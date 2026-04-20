// api/private.js  — 私人收藏接口（每用户独立隔离）
// GET    /api/private           — 读取自己的私人收藏
// POST   /api/private           — 新增条目
// PUT    /api/private/{id}      — 修改条目
// DELETE /api/private/{id}      — 删除条目
//
// 管理员额外接口：
// GET    /api/private?uid={uid}  — 读取指定用户的私人收藏（仅管理员）
// ─────────────────────────────────────────────────────────────────
import {
  cors, ok, err,
  requireAuth,
  ghRead, ghPut,
  GH_PATHS,
} from './_lib.js';

/** 私人数据路径：data/private/{uid}.json */
const privatePath = uid => `${GH_PATHS.privateDir}/${uid}.json`;

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 所有私人接口均需登录
  const caller = requireAuth(req, res);
  if (!caller) return;
  if (caller.role === 'guest') return err(res, 401, '请先登录');

  // 解析 URL
  const parts  = req.url.replace(/\?.*$/, '').split('/').filter(Boolean);
  const itemId = parts[2] || null;   // /api/private/{itemId}

  // 确定操作的 uid：管理员可通过 ?uid= 操作他人；普通用户只能操作自己
  let targetUid = caller.uid;
  if (req.query?.uid && req.query.uid !== caller.uid) {
    if (caller.role !== 'admin') {
      return err(res, 403, '无权访问他人私人收藏');
    }
    targetUid = req.query.uid;
  }

  const filePath = privatePath(targetUid);

  // ── GET — 读取私人收藏 ────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { data } = await ghRead(filePath, []);
      return ok(res, { items: data, total: data.length, uid: targetUid });
    } catch (e) {
      return err(res, 500, `读取失败：${e.message}`);
    }
  }

  // 以下操作不允许管理员代为执行（除非明确传 ?uid=）
  // 读取用自己的还是他人的，已由 targetUid 确定

  // ── POST — 新增条目 ───────────────────────────────────────────
  if (req.method === 'POST' && !itemId) {
    const body = req.body || {};
    if (!body.title) return err(res, 400, '标题不能为空');

    try {
      const { data, sha } = await ghRead(filePath, []);
      const newItem = {
        id:        genId(),
        ...sanitizeItem(body),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.unshift(newItem);
      await ghPut(filePath, data, sha, `Private add "${newItem.title}" uid:${targetUid}`);
      return ok(res, { item: newItem });
    } catch (e) {
      return err(res, 500, `写入失败：${e.message}`);
    }
  }

  // ── PUT — 修改条目 ────────────────────────────────────────────
  if (req.method === 'PUT' && itemId) {
    try {
      const { data, sha } = await ghRead(filePath, []);
      const idx = data.findIndex(i => i.id === itemId);
      if (idx < 0) return err(res, 404, '条目不存在');

      data[idx] = {
        ...data[idx],
        ...sanitizeItem(req.body || {}),
        id:        data[idx].id,
        createdAt: data[idx].createdAt,
        updatedAt: new Date().toISOString(),
      };
      await ghPut(filePath, data, sha, `Private update uid:${targetUid}`);
      return ok(res, { item: data[idx] });
    } catch (e) {
      return err(res, 500, `修改失败：${e.message}`);
    }
  }

  // ── DELETE — 删除条目 ─────────────────────────────────────────
  if (req.method === 'DELETE' && itemId) {
    try {
      const { data, sha } = await ghRead(filePath, []);
      const idx = data.findIndex(i => i.id === itemId);
      if (idx < 0) return err(res, 404, '条目不存在');
      const removed = data.splice(idx, 1)[0];
      await ghPut(filePath, data, sha, `Private delete uid:${targetUid}`);
      return ok(res, { message: '已删除', id: itemId });
    } catch (e) {
      return err(res, 500, `删除失败：${e.message}`);
    }
  }

  return err(res, 405, '不支持该请求方法');
}

function sanitizeItem(body) {
  const ALLOWED = [
    'category','title','author','publisher','cast','voice',
    'year','episodes','desc','notes','cover','links','tags',
    'status','rating','eps',
  ];
  const out = {};
  for (const k of ALLOWED) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}
