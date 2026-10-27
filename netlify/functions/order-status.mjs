import { getStore } from '../../lib/store.mjs';
import {
  json,
  isRateLimited,
  safeEqual,
  publicOrder,
  retrieveStripeSession,
  activateOrder
} from './_shared.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'GET') {
    return json({ ok: false, message: '请求方式不对。' }, 405);
  }
  if (await isRateLimited(req, getStore('rate-limits'), 'order-status', 60, 10 * 60 * 1000)) {
    return json({ ok: false, message: '查询过于频繁，请稍后再试。' }, 429);
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id') || '';
  const orderId = String(url.searchParams.get('orderId') || '').trim();
  const token = String(url.searchParams.get('token') || '').trim();

  try {
    if (sessionId) {
      const session = await retrieveStripeSession(sessionId);
      const sessionOrderId = String(session.metadata?.orderId || session.client_reference_id || '').trim();
      if (!sessionOrderId) {
        return json({ ok: false, message: '支付会话没有关联订单。' }, 400);
      }
      const ordersStore = getStore('orders');
      const current = await ordersStore.get(`order:${sessionOrderId}`, { type: 'json' });
      if (!current) {
        return json({ ok: false, message: '订单不存在。' }, 404);
      }
      if (session.payment_status !== 'paid') {
        return json({ ok: true, order: publicOrder({ ...current, provider: 'stripe' }) });
      }
      const result = await activateOrder({
        ordersStore,
        codesStore: getStore('unlock-codes'),
        orderId: sessionOrderId,
        provider: 'stripe',
        externalId: session.id
      });
      if (!result.ok) return json({ ok: false, message: result.message }, result.status || 409);
      return json({ ok: true, order: publicOrder(result.order) });
    }

    if (!orderId || !token) {
      return json({ ok: false, message: '缺少订单参数。' }, 400);
    }

    const ordersStore = getStore('orders');
    const order = await ordersStore.get(`order:${orderId}`, { type: 'json' });
    if (!order) {
      return json({ ok: false, message: '订单不存在。' }, 404);
    }
    if (!safeEqual(order.deliveryToken, token)) {
      return json({ ok: false, message: '订单校验失败。' }, 403);
    }
    return json({ ok: true, order: publicOrder(order) });
  } catch (error) {
    return json({ ok: false, message: error.message === 'stripe-not-configured' ? '在线支付未配置。' : '订单状态查询失败，请稍后重试。' }, 502);
  }
};
