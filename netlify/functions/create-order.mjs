import { getStore } from '../../lib/store.mjs';
import { OPEN_TO_PUBLIC } from '../../lib/launch-mode.mjs';
import {
  json,
  isRateLimited,
  readJsonBody,
  clientIp,
  isValidSku,
  PRODUCTS,
  createOrderId,
  makeToken,
  createStripeCheckout,
  stripePriceId
} from './_shared.mjs';

const ordersStore = () => getStore('orders');
const rateStore = () => getStore('rate-limits');

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  // 已全站开放，暂停售卖：不生成订单，也不发起支付。
  if (OPEN_TO_PUBLIC) {
    return json({ ok: false, message: '内容已全部开放，无需购买。' }, 410);
  }
  if (req.method !== 'POST') {
    return json({ ok: false, message: '请求方式不对。' }, 405);
  }
  if (await isRateLimited(req, rateStore(), 'order-create', 30, 10 * 60 * 1000)) {
    return json({ ok: false, message: '下单过于频繁，请稍后再试。' }, 429);
  }

  const body = await readJsonBody(req);
  const sku = String(body.sku || '').trim();
  if (!isValidSku(sku)) {
    return json({ ok: false, message: '商品不存在。' }, 400);
  }

  const product = PRODUCTS[sku];
  const orderId = createOrderId();
  const deliveryToken = makeToken();
  const order = {
    orderId,
    sku: product.sku,
    scope: product.scope,
    status: 'unpaid',
    provider: 'manual',
    providerExternalId: null,
    code: null,
    priceYuan: product.priceYuan,
    title: product.title,
    source: String(body.source || 'storefront').slice(0, 40),
    clientIp: clientIp(req),
    deliveryToken,
    createdAt: new Date().toISOString(),
    paidAt: null,
    fulfilledAt: null,
    refundedAt: null,
    adminNote: null
  };

  const store = ordersStore();
  try {
    const created = await store.setJSON(`order:${orderId}`, order, { onlyIfNew: true });
    if (!created.modified) {
      return json({ ok: false, message: '订单号冲突，请重试。' }, 409);
    }
  } catch (error) {
    return json({ ok: false, message: '创建订单失败，请稍后重试。' }, 500);
  }

  const wantsStripe = process.env.PAYMENT_PROVIDER === 'stripe' && stripePriceId(sku);
  if (wantsStripe) {
    try {
      const session = await createStripeCheckout(order, product);
      const current = await store.getWithMetadata(`order:${orderId}`, { type: 'json' });
      if (current) {
        const updated = {
          ...(current.data || order),
          provider: 'stripe',
          providerExternalId: session.sessionId
        };
        await store.setJSON(`order:${orderId}`, updated, { onlyIfMatch: current.etag });
      }
      return json({
        ok: true,
        orderId,
        sku: product.sku,
        mode: 'stripe',
        paymentUrl: session.url,
        deliveryToken
      });
    } catch (error) {
      return json({
        ok: true,
        orderId,
        sku: product.sku,
        mode: 'manual',
        deliveryToken,
        message: '在线支付暂不可用，已切换为人工收款确认。'
      });
    }
  }

  return json({
    ok: true,
    orderId,
    sku: product.sku,
    mode: 'manual',
    deliveryToken
  });
};
