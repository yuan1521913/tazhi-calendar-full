import { getStore } from '../../lib/store.mjs';
import {
  json,
  safeEqual,
  readJsonBody,
  isRateLimited,
  activateOrder,
  publicOrder
} from './_shared.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, message: '请求方式不对。' }, 405);
  }
  if (await isRateLimited(req, getStore('rate-limits'), 'mock-pay', 20, 10 * 60 * 1000)) {
    return json({ ok: false, message: '请求过于频繁，请稍后再试。' }, 429);
  }

  const body = await readJsonBody(req);
  const orderId = String(body.orderId || '').trim();
  const token = String(body.token || '').trim();
  if (!orderId || !token) {
    return json({ ok: false, message: '缺少订单号或交付令牌。' }, 400);
  }

  const ordersStore = getStore('orders');
  const codesStore = getStore('unlock-codes');
  const order = await ordersStore.get(`order:${orderId}`, { type: 'json' });
  if (!order) {
    return json({ ok: false, message: '订单不存在。' }, 404);
  }
  if (!safeEqual(order.deliveryToken, token)) {
    return json({ ok: false, message: '没有权限操作这个订单。' }, 403);
  }
  if (order.status === 'paid' && order.code) {
    return json({ ok: true, order: publicOrder(order) });
  }

  const result = await activateOrder({
    ordersStore,
    codesStore,
    orderId,
    provider: 'mock',
    externalId: `mock:${new Date().toISOString()}`,
    note: '模拟支付（测试）'
  });
  if (!result.ok) {
    return json({ ok: false, message: result.message }, result.status || 409);
  }
  return json({ ok: true, order: publicOrder(result.order) });
};
