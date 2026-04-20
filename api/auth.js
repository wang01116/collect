// api/auth.js
// POST /api/auth/login     — 用户名+密码 或 管理员 Token 登录
// POST /api/auth/register  — 注册（需管理员预先开启或邀请码）
// GET  /api/auth/me        — 查看当前登录信息
// POST /api/auth/password  — 修改自己的密码
// ─────────────────────────────────────────────────────────────────
import {
  cors, ok, err,
  authFromReq, requireAuth,
  kvGetUserByUsername, kvGetUser, kvSaveUser,
  verifyPassword, hashPassword, signToken, genUid, genPassword,
  kv,
} from './_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const [, , action] = req.url.split('/');
  // URL: /api/auth/{action}
  const path = req.url.replace(/\?.*$/, '').split('/').filter(Boolean);
  const action2 = path[2] || '';   // auth/{action2}

  // ── GET /api/auth/me ──────────────────────────────────────────
  if (req.method === 'GET' && action2 === 'me') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (user.uid === '__guest__') return ok(res, { role: 'guest' });

    const full = await kvGetUser(user.uid);
    if (!full) return err(res, 404, '用户不存在');
    const { passwordHash, ...safe } = full;
    return ok(res, { user: safe });
  }

  // ── POST /api/auth/login ──────────────────────────────────────
  if (req.method === 'POST' && action2 === 'login') {
    const { username, password, adminToken } = req.body || {};

    // 管理员 Token 直登
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
    if (adminToken && ADMIN_TOKEN && adminToken === ADMIN_TOKEN) {
      const token = signToken({ uid: '__admin__', username: 'admin', role: 'admin' });
      return ok(res, { token, role: 'admin', username: 'admin' });
    }

    if (!username || !password) return err(res, 400, '请填写用户名和密码');

    const user = await kvGetUserByUsername(username);
    if (!user) return err(res, 401, '用户名或密码错误');

    const match = await verifyPassword(password, user.passwordHash);
    if (!match) return err(res, 401, '用户名或密码错误');

    const token = signToken({ uid: user.uid, username: user.username, role: user.role });
    const { passwordHash, ...safe } = user;
    return ok(res, { token, user: safe });
  }

  // ── POST /api/auth/register ───────────────────────────────────
  // 注册策略：
  //   1. 如果系统尚无用户（首次部署），允许直接注册第一个账号为普通用户
  //   2. 否则需要管理员 Token 或有效邀请码
  if (req.method === 'POST' && action2 === 'register') {
    const { username, password, inviteCode } = req.body || {};
    if (!username || !password) return err(res, 400, '用户名和密码不能为空');
    if (username.length < 2 || username.length > 32)
      return err(res, 400, '用户名长度 2~32 位');
    if (!/^[A-Za-z0-9_\-\u4e00-\u9fa5]+$/.test(username))
      return err(res, 400, '用户名只允许字母、数字、下划线、中文');
    if (password.length < 6) return err(res, 400, '密码至少 6 位');

    // 检查是否首次（无用户）
    const usernames = (await kv.get('usernames')) || {};
    const isFirst   = Object.keys(usernames).length === 0;

    // 非首次：需要管理员 Token 或有效邀请码
    if (!isFirst) {
      const caller = authFromReq(req);
      const validCode = process.env.INVITE_CODE || '';
      const hasAdminAuth = caller && caller.role === 'admin';
      const hasInvite    = validCode && inviteCode === validCode;
      if (!hasAdminAuth && !hasInvite) {
        return err(res, 403, '注册需要管理员授权或有效邀请码');
      }
    }

    // 用户名唯一性
    const exists = await kvGetUserByUsername(username);
    if (exists) return err(res, 409, '该用户名已被使用');

    const uid  = genUid();
    const role = isFirst ? 'user' : 'user';   // 注册均为普通用户，管理员由 admin API 提升
    const newUser = {
      uid,
      username,
      passwordHash: await hashPassword(password),
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await kvSaveUser(newUser);

    const token = signToken({ uid, username, role });
    const { passwordHash, ...safe } = newUser;
    return ok(res, { token, user: safe });
  }

  // ── POST /api/auth/password ───────────────────────────────────
  if (req.method === 'POST' && action2 === 'password') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (user.uid === '__admin__') return err(res, 400, '管理员 Token 无密码可改');

    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) return err(res, 400, '请填写旧密码和新密码');
    if (newPassword.length < 6) return err(res, 400, '新密码至少 6 位');

    const full = await kvGetUser(user.uid);
    if (!full) return err(res, 404, '用户不存在');

    const match = await verifyPassword(oldPassword, full.passwordHash);
    if (!match) return err(res, 401, '旧密码不正确');

    full.passwordHash = await hashPassword(newPassword);
    full.updatedAt    = new Date().toISOString();
    await kvSaveUser(full);
    return ok(res, { message: '密码已更新' });
  }

  return err(res, 404, '接口不存在');
}
