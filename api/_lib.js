// api/_lib.js  — 共享工具函数（所有 API 路由 import 此文件）
// ─────────────────────────────────────────────────────────────────
// 环境变量（在 Vercel Dashboard → Settings → Environment Variables 配置）
//   GITHUB_TOKEN   Fine-grained PAT，需 Contents 读写权限
//   GITHUB_REPO    格式：owner/repo
//   ADMIN_TOKEN    管理员直接登录用的 Token（不会出现在前端代码）
//   JWT_SECRET     用于签发/验证 JWT，建议 32 位随机字符串
//   KV_REST_API_URL & KV_REST_API_TOKEN  Vercel KV 连接信息
// ─────────────────────────────────────────────────────────────────

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { kv } from '@vercel/kv';

export { bcrypt, kv };

// ── 常量 ──────────────────────────────────────────────────────────
const JWT_SECRET  = process.env.JWT_SECRET  || 'change_me_in_production';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const GH_TOKEN    = process.env.GITHUB_TOKEN || '';
const GH_REPO     = process.env.GITHUB_REPO  || '';

// GitHub 上的文件路径约定
export const GH_PATHS = {
  publicCollection: 'data/public/collection.json',
  privateDir:       'data/private',               // + /{uid}.json
  usersIndex:       'data/users/index.json',       // 备份（主存 KV）
};

// ── CORS helper ───────────────────────────────────────────────────
export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

// ── JWT ───────────────────────────────────────────────────────────
/** 签发 JWT，payload 中包含 uid / username / role */
export function signToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/** 验证 JWT；返回 payload 或 null */
export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

/** 从请求 Authorization header 或 query.token 中取 token 并验证 */
export function authFromReq(req) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ')
    ? header.slice(7)
    : (req.query?.token || '');

  if (!token) return null;

  // 管理员 Token（直接与环境变量比对，不走 JWT）
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) {
    return { uid: '__admin__', username: 'admin', role: 'admin' };
  }

  return verifyToken(token);
}

/** 快速鉴权中间件——返回 user 对象；权限不足时直接结束响应并返回 null */
export function requireAuth(req, res, allowGuest = false) {
  const user = authFromReq(req);
  if (!user && !allowGuest) {
    res.status(401).json({ error: '未登录或 Token 已过期' });
    return null;
  }
  return user || { uid: '__guest__', role: 'guest' };
}

export function requireAdmin(req, res) {
  const user = authFromReq(req);
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' });
    return null;
  }
  return user;
}

// ── GitHub REST helper ────────────────────────────────────────────
const GH_API = 'https://api.github.com';

/** 读取 GitHub 文件；返回 { content, sha } 或 null（文件不存在） */
export async function ghGet(path) {
  const res = await fetch(`${GH_API}/repos/${GH_REPO}/contents/${path}`, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} → ${res.status}`);
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  return { content, sha: data.sha };
}

/** 写入 GitHub 文件（新建或更新） */
export async function ghPut(path, content, sha = null, message = null) {
  const body = {
    message: message || `Update ${path} at ${new Date().toISOString()}`,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
  };
  if (sha) body.sha = sha;

  const res = await fetch(`${GH_API}/repos/${GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub PUT ${path} → ${res.status}: ${err.message || ''}`);
  }
  return res.json();
}

/** 读取文件（不存在时返回默认值） */
export async function ghRead(path, defaultValue = []) {
  const result = await ghGet(path);
  return result ? { data: result.content, sha: result.sha } : { data: defaultValue, sha: null };
}

// ── KV helpers（用户账号存储） ────────────────────────────────────
// KV key 约定：
//   user:{uid}        → 用户对象 { uid, username, passwordHash, role, createdAt }
//   usernames         → { [username]: uid }  用于用户名唯一性检查

export async function kvGetUser(uid) {
  return kv.get(`user:${uid}`);
}

export async function kvGetUserByUsername(username) {
  const index = (await kv.get('usernames')) || {};
  const uid   = index[username.toLowerCase()];
  if (!uid) return null;
  return kv.get(`user:${uid}`);
}

export async function kvSaveUser(user) {
  await kv.set(`user:${user.uid}`, user);
  // 更新用户名索引
  const index = (await kv.get('usernames')) || {};
  index[user.username.toLowerCase()] = user.uid;
  await kv.set('usernames', index);
}

export async function kvDeleteUser(uid) {
  const user = await kvGetUser(uid);
  if (!user) return;
  await kv.del(`user:${uid}`);
  const index = (await kv.get('usernames')) || {};
  delete index[user.username.toLowerCase()];
  await kv.set('usernames', index);
}

export async function kvListUsers() {
  const index = (await kv.get('usernames')) || {};
  const uids  = Object.values(index);
  if (!uids.length) return [];
  const users = await Promise.all(uids.map(uid => kv.get(`user:${uid}`)));
  return users.filter(Boolean);
}

// ── 密码工具 ──────────────────────────────────────────────────────
export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ── uid 生成 ──────────────────────────────────────────────────────
export function genUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── 密码生成（管理员创建账号时使用） ─────────────────────────────
/** 生成 N 位可读随机密码（大写+小写+数字，去除易混淆字符） */
export function genPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  const arr = new Uint8Array(len);
  // 在 Node.js 环境中使用 crypto
  const { randomFillSync } = await import('crypto');
  randomFillSync(arr);
  for (const b of arr) pwd += chars[b % chars.length];
  return pwd;
}

// ── 通用响应 ──────────────────────────────────────────────────────
export function ok(res, data = {}) {
  return res.status(200).json({ ok: true, ...data });
}

export function err(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}
