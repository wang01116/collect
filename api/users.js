// api/users.js  — 管理员用户管理接口（全部需要 admin 权限）
// GET    /api/users           — 列出所有用户
// POST   /api/users           — 创建用户（自动生成密码）
// GET    /api/users/{uid}     — 查看某用户
// PUT    /api/users/{uid}     — 修改用户（username / role / resetPassword）
// DELETE /api/users/{uid}     — 删除用户
// POST   /api/users/gen-password — 生成安全密码（供管理员参考）
// ─────────────────────────────────────────────────────────────────
import {
  cors, ok, err,
  requireAdmin,
  kvListUsers, kvGetUser, kvGetUserByUsername, kvSaveUser, kvDeleteUser,
  hashPassword, signToken, genUid, kv,
} from './_lib.js';
import { randomBytes } from 'crypto';

/** 生成 N 位可读随机密码（去除易混淆字符） */
function genPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const buf   = randomBytes(len);
  return [...buf].map(b => chars[b % chars.length]).join('');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const admin = requireAdmin(req, res);
  if (!admin) return;

  // 解析路径：/api/users 或 /api/users/{uid} 或 /api/users/gen-password
  const parts = req.url.replace(/\?.*$/, '').split('/').filter(Boolean);
  const uid   = parts[2] || null;   // parts = ['api','users','{uid}']

  // ── POST /api/users/gen-password ─────────────────────────────
  if (req.method === 'POST' && uid === 'gen-password') {
    const len = parseInt(req.body?.length || '12', 10);
    return ok(res, { password: genPassword(Math.max(8, Math.min(32, len))) });
  }

  // ── GET /api/users ────────────────────────────────────────────
  if (req.method === 'GET' && !uid) {
    const users = await kvListUsers();
    const safe  = users.map(({ passwordHash, ...u }) => u);
    return ok(res, { users: safe, total: safe.length });
  }

  // ── POST /api/users  — 创建新用户 ─────────────────────────────
  if (req.method === 'POST' && !uid) {
    const { username, password, role = 'user' } = req.body || {};
    if (!username) return err(res, 400, '用户名不能为空');
    if (!['user', 'admin'].includes(role)) return err(res, 400, 'role 只能是 user 或 admin');
    if (username.length < 2 || username.length > 32)
      return err(res, 400, '用户名长度 2~32 位');
    if (!/^[A-Za-z0-9_\-\u4e00-\u9fa5]+$/.test(username))
      return err(res, 400, '用户名包含非法字符');

    const exists = await kvGetUserByUsername(username);
    if (exists) return err(res, 409, '用户名已存在');

    const plain   = password || genPassword();
    const newUser = {
      uid:          genUid(),
      username,
      passwordHash: await hashPassword(plain),
      role,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    };
    await kvSaveUser(newUser);

    const { passwordHash, ...safe } = newUser;
    // 返回明文密码（仅此一次，请管理员告知用户）
    return ok(res, { user: safe, plainPassword: plain, message: '账号已创建，请将密码告知用户' });
  }

  // ── GET /api/users/{uid} ──────────────────────────────────────
  if (req.method === 'GET' && uid) {
    const user = await kvGetUser(uid);
    if (!user) return err(res, 404, '用户不存在');
    const { passwordHash, ...safe } = user;
    return ok(res, { user: safe });
  }

  // ── PUT /api/users/{uid} ──────────────────────────────────────
  if (req.method === 'PUT' && uid) {
    const user = await kvGetUser(uid);
    if (!user) return err(res, 404, '用户不存在');

    const { username, role, resetPassword } = req.body || {};
    let newPlain = null;

    if (username && username !== user.username) {
      if (username.length < 2 || username.length > 32)
        return err(res, 400, '用户名长度 2~32');
      const conflict = await kvGetUserByUsername(username);
      if (conflict && conflict.uid !== uid)
        return err(res, 409, '用户名已被使用');
      // 更新旧用户名索引
      const index = (await kv.get('usernames')) || {};
      delete index[user.username.toLowerCase()];
      await kv.set('usernames', index);
      user.username = username;
    }

    if (role && ['user', 'admin'].includes(role)) {
      user.role = role;
    }

    if (resetPassword) {
      newPlain          = resetPassword === true ? genPassword() : String(resetPassword);
      user.passwordHash = await hashPassword(newPlain);
    }

    user.updatedAt = new Date().toISOString();
    await kvSaveUser(user);

    const { passwordHash, ...safe } = user;
    const resp = { user: safe };
    if (newPlain) resp.plainPassword = newPlain;
    return ok(res, resp);
  }

  // ── DELETE /api/users/{uid} ───────────────────────────────────
  if (req.method === 'DELETE' && uid) {
    if (uid === '__admin__') return err(res, 400, '无法删除内置管理员');
    const user = await kvGetUser(uid);
    if (!user) return err(res, 404, '用户不存在');
    await kvDeleteUser(uid);
    // 可选：同时删除该用户的私人收藏文件
    // await ghDelete(`${GH_PATHS.privateDir}/${uid}.json`);
    return ok(res, { message: `用户 ${user.username} 已删除` });
  }

  return err(res, 404, '接口不存在');
}
