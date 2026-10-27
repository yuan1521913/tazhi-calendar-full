import crypto from 'node:crypto';
import { getStore } from '../../lib/store.mjs';
import {
  json,
  safeEqual,
  isRateLimited,
  readJsonBody,
  codeStatus,
  normalizeScope
} from './_shared.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, message: '请求方式不对。' }, 405);
  }
  if (await isRateLimited(req, getStore('rate-limits'), 'restore-session', 30, 10 * 60 * 1000)) {
    return json({ ok: false, message: '请求过于频繁，请稍后再试。' }, 429);
  }

  const body = await readJsonBody(req);
  const orderId = String(body.orderId || '').trim();
  const token = String(body.token || '').trim();
  if (!orderId || !token) {
    return json({ ok: false, message: '缺少订单参数。' }, 400);
  }

  const ordersStore = getStore('orders');
  const codesStore = getStore('unlock-codes');
  const sessions = getStore('unlock-sessions');

  const order = await ordersStore.get(`order:${orderId}`, { type: 'json' });
  if (!order) {
    return json({ ok: false, message: '订单不存在。' }, 404);
  }
  if (!safeEqual(order.deliveryToken, token)) {
    return json({ ok: false, message: '订单校验失败。' }, 403);
  }
  if (order.status !== 'paid' || !order.code) {
    return json({ ok: false, message: '订单尚未完成付款。' }, 409);
  }

  const entry = await codesStore.getWithMetadata(order.code, { type: 'json' });
  const record = entry?.data || {};
  const status = codeStatus(record);
  if (status === 'refunded' || record.refunded) {
    return json({ ok: false, message: '这个订单已退款停用。' }, 410);
  }
  if (status === 'orphaned' || status === 'missing') {
    return json({ ok: false, message: '这个订单的解锁码不可用，请联系管理员。' }, 409);
  }

  const scope = normalizeScope(record.scope || order.scope);
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    await sessions.setJSON(sessionToken, {
      code: order.code,
      scope,
      orderId,
      restored: true,
      createdAt: new Date().toISOString(),
      expiresAt
    });
  } catch (error) {
    return json({ ok: false, message: '恢复服务暂时不可用。' }, 500);
  }

  return json({ ok: true, message: '访问已恢复。', scope }, 200, {
    'Set-Cookie': `tazhi_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`
  });
};
