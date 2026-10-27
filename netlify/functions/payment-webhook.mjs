import { getStore } from '../../lib/store.mjs';
import { json, verifyStripeSignature, activateOrder } from './_shared.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, message: '请求方式不对。' }, 405);
  }

  const raw = await req.text();
  const signature = req.headers.get('stripe-signature') || '';
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!verifyStripeSignature(raw, signature, secret)) {
    return json({ ok: false, message: 'webhook 签名校验失败。' }, 401);
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch (error) {
    return json({ ok: false, message: 'webhook 内容无法解析。' }, 400);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object || {};
      const orderId = String(session.metadata?.orderId || session.client_reference_id || '').trim();
      if (!orderId) {
        return json({ ok: false, message: '支付事件缺少订单号。' }, 400);
      }
      if (session.payment_status !== 'paid') {
        return json({ ok: true, received: true, status: 'not-paid' });
      }
      const result = await activateOrder({
        ordersStore: getStore('orders'),
        codesStore: getStore('unlock-codes'),
        orderId,
        provider: 'stripe',
        externalId: session.id
      });
      return json({ ok: result.ok, received: true, message: result.message || 'ok' }, result.status || 200);
    }

    if (event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data?.object || {};
      const orderId = String(session.metadata?.orderId || session.client_reference_id || '').trim();
      if (!orderId) {
        return json({ ok: false, message: '支付事件缺少订单号。' }, 400);
      }
      const result = await activateOrder({
        ordersStore: getStore('orders'),
        codesStore: getStore('unlock-codes'),
        orderId,
        provider: 'stripe',
        externalId: session.id
      });
      return json({ ok: result.ok, received: true, message: result.message || 'ok' }, result.status || 200);
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      return json({ ok: true, received: true, status: 'payment-failed' });
    }

    return json({ ok: true, received: true, ignored: event.type });
  } catch (error) {
    return json({ ok: false, message: '订单履约失败，请人工核查。' }, 500);
  }
};
