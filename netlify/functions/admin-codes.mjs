import { getStore } from '../../lib/store.mjs';
import { json, safeEqual, isRateLimited, readJsonBody, makeCode, codeStatus, normalizeScope } from './_shared.mjs';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (!ADMIN_TOKEN || !safeEqual(req.headers.get('x-admin-token'), ADMIN_TOKEN)) {
    return json({ ok: false, message: '没有权限，ADMIN_TOKEN 不匹配。' }, 401);
  }

  if (await isRateLimited(req, getStore('rate-limits'), 'admin', 20, 10 * 60 * 1000)) {
    return json({ ok: false, message: '请求过于频繁，请稍后再试。' }, 429);
  }

  const store = getStore('unlock-codes');

  if (req.method === 'GET') {
    try {
      const { blobs } = await store.list();
      const codes = [];
      for (const blob of blobs) {
        if (!/^TAZHI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(blob.key)) continue;
        const record = await store.get(blob.key, { type: 'json' });
        codes.push({
          code: blob.key,
          scope: record?.scope || 'full365',
          status: codeStatus(record),
          orderId: record?.orderId || null,
          createdAt: record?.createdAt || null,
          assignedAt: record?.assignedAt || null,
          usedAt: record?.usedAt || null
        });
      }
      codes.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      return json({ ok: true, codes });
    } catch (error) {
      return json({ ok: false, message: '读取解锁码失败。' }, 500);
    }
  }

  if (req.method !== 'POST') {
    return json({ ok: false, message: '请求方式不对。' }, 405);
  }

  const body = await readJsonBody(req);
  const requested = Number(body.count) || 1;
  const count = Math.min(Math.max(requested, 1), 50);
  const scope = normalizeScope(body.scope);
  const note = String(body.note || '').trim().slice(0, 200);
  const codes = [];

  try {
    for (let index = 0; index < count; index += 1) {
      const code = makeCode();
      const record = {
        status: 'available',
        scope,
        orderId: null,
        note: note || null,
        createdAt: new Date().toISOString(),
        usedAt: null
      };
      const result = await store.setJSON(code, record, { onlyIfNew: true });
      if (!result.modified) {
        index -= 1;
        continue;
      }
      codes.push(code);
    }
  } catch (error) {
    return json({ ok: false, message: '生成解锁码失败。' }, 500);
  }

  return json({ ok: true, codes, scope, count: codes.length });
};
