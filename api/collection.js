// api/collection.js  — 公共收藏接口
// GET    /api/collection           — 读取公共收藏（所有人可读）
// POST   /api/collection           — 新增条目（需登录）
// PUT    /api/collection/{id}      — 修改条目（需登录，管理员可改所有，普通用户只能改自己创建的）
// DELETE /api/collection/{id}      — 删除条目（同上）
// ─────────────────────────────────────────────────────────────────
import {
  cors, ok, err,
  requireAuth, authFromReq,
  ghRead, ghPut,
  GH_PATHS,
} from './_lib.js';

const PATH = GH_PATHS.publicCollection;   // data/public/collection.json

/** 生成条目 ID */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 解析 URL，取条目 id（如有）
  const parts = req.url.replace(/\?.*$/, '').split('/').filter(Boolean);
  const itemId = parts[2] || null;   // /api/collection/{itemId}

  // ── GET — 公开读取 ────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { data } = await ghRead(PATH, []);
      const user = authFromReq(req);

      // 访客：隐藏 createdBy 等敏感字段可在此处理（本版本全部返回）
      return ok(res, { items: data, total: data.length, role: user?.role || 'guest' });
    } catch (e) {
      return err(res, 500, `读取失败：${e.message}`);
    }
  }

  // 以下操作需要登录
  const user = requireAuth(req, res);
  if (!user) return;
  if (user.role === 'guest') return err(res, 401, '请先登录');

  // ── POST — 新增条目 ───────────────────────────────────────────
  if (req.method === 'POST' && !itemId) {
    const body = req.body || {};
    if (!body.title) return err(res, 400, '标题不能为空');

    try {
      const { data, sha } = await ghRead(PATH, []);
      const newItem = {
        id:        uid(),
        ...sanitizeItem(body),
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };
      data.unshift(newItem);
      await ghPut(PATH, data, sha, `Add "${newItem.title}" by ${user.username}`);
      return ok(res, { item: newItem });
    } catch (e) {
      return err(res, 500, `写入失败：${e.message}`);
    }
  }

  // ── PUT — 修改条目 ────────────────────────────────────────────
  if (req.method === 'PUT' && itemId) {
    try {
      const { data, sha } = await ghRead(PATH, []);
      const idx  = data.findIndex(i => i.id === itemId);
      if (idx < 0) return err(res, 404, '条目不存在');

      const item = data[idx];
      // 权限：管理员可改所有；普通用户只能改自己创建的
      if (user.role !== 'admin' && item.createdBy !== user.uid) {
        return err(res, 403, '无权修改他人创建的条目');
      }

      data[idx] = {
        ...item,
        ...sanitizeItem(req.body || {}),
        id:        item.id,
        createdBy: item.createdBy,
        createdAt: item.createdAt,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };
      await ghPut(PATH, data, sha, `Update "${data[idx].title}" by ${user.username}`);
      return ok(res, { item: data[idx] });
    } catch (e) {
      return err(res, 500, `修改失败：${e.message}`);
    }
  }

  // ── DELETE — 删除条目 ─────────────────────────────────────────
  if (req.method === 'DELETE' && itemId) {
    try {
      const { data, sha } = await ghRead(PATH, []);
      const idx  = data.findIndex(i => i.id === itemId);
      if (idx < 0) return err(res, 404, '条目不存在');

      const item = data[idx];
      if (user.role !== 'admin' && item.createdBy !== user.uid) {
        return err(res, 403, '无权删除他人创建的条目');
      }

      const removed = data.splice(idx, 1)[0];
      await ghPut(PATH, data, sha, `Delete "${removed.title}" by ${user.username}`);
      return ok(res, { message: '已删除', id: itemId });
    } catch (e) {
      return err(res, 500, `删除失败：${e.message}`);
    }
  }

  return err(res, 405, '不支持该请求方法');
}

/** 过滤/白名单允许存储的字段 */
function sanitizeItem(body) {
  const ALLOWED = [
    'category','title','author','publisher','cast','voice',
    'year','episodes','desc','notes','cover','links','tags',
    'status','rating','eps','local',
  ];
  const out = {};
  for (const k of ALLOWED) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}
