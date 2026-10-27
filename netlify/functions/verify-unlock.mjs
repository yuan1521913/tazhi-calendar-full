import crypto from 'node:crypto';
import { getStore } from '../../lib/store.mjs';
import { json, isRateLimited, codeStatus, normalizeScope } from './_shared.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, message: '请求方式不对。' }, 405);
  }
  if (await isRateLimited(req, getStore('rate-limits'), 'verify', 20, 10 * 60 * 1000)) {
    return json({ ok: false, message: '尝试次数过多，请稍后再试。' }, 429);
  }

  let body;
  try {
    body = await req.json();
  } catch (error) {
    return json({ ok: false, message: '请求内容无法识别。' }, 400);
  }

  const code = String(body.code || '').trim().toUpperCase();
  if (!/^TAZHI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    return json({ ok: false, message: '解锁码格式不正确。' }, 400);
  }

  const store = getStore('unlock-codes');
  const sessions = getStore('unlock-sessions');
  const entry = await store.getWithMetadata(code, { type: 'json' });
  if (!entry) {
    return json({ ok: false, message: '解锁码无效，请核对后重试。' }, 404);
  }

  const record = entry.data || {};
  const status = codeStatus(record);
  if (status === 'used') {
    return json({ ok: false, message: '这个解锁码已经使用过了。' }, 409);
  }
  if (status === 'refunded' || record.refunded) {
    return json({ ok: false, message: '这个解锁码已退款停用。' }, 410);
  }
  if (status !== 'available' && status !== 'assigned') {
    return json({ ok: false, message: '这个解锁码当前不可用。' }, 409);
  }

  const scope = normalizeScope(record.scope);
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    await sessions.setJSON(sessionToken, {
      code,
      scope,
      orderId: record.orderId || null,
      createdAt: new Date().toISOString(),
      expiresAt
    });
  } catch (error) {
    return json({ ok: false, message: '解锁服务暂时不可用。' }, 500);
  }

  try {
    const result = await store.setJSON(code, {
      ...record,
      status: 'used',
      usedAt: new Date().toISOString()
    }, { onlyIfMatch: entry.etag });
    if (!result.modified) {
      return json({ ok: false, message: '解锁码刚刚被使用，请刷新后重试。' }, 409);
    }
  } catch (error) {
    return json({ ok: false, message: '解锁服务暂时不可用。' }, 500);
  }

  return json({ ok: true, message: '解锁成功。', scope }, 200, {
    'Set-Cookie': `tazhi_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`
  });
};
