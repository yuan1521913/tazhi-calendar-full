import crypto from 'node:crypto';

export const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8'
};

export const json = (payload, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { ...jsonHeaders, ...extraHeaders } });

export const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const clientIp = (req) => {
  const direct = req.headers.get('x-nf-client-connection-ip');
  if (direct) return direct;
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || 'unknown';
};

export const isRateLimited = async (req, store, prefix, max, windowMs) => {
  const key = `${prefix}:${clientIp(req)}`;
  const now = Date.now();
  let record = null;
  try {
    record = await store.get(key, { type: 'json' });
  } catch (error) {
    record = null;
  }
  const startedAt = record && Number.isFinite(Date.parse(record.startedAt)) ? Date.parse(record.startedAt) : now;
  const count = record && now - startedAt < windowMs ? Number(record.count) + 1 : 1;
  try {
    await store.setJSON(key, { count, startedAt: new Date(startedAt).toISOString() });
  } catch (error) {}
  return count > max;
};

export const readJsonBody = async (req) => {
  try {
    return await req.json();
  } catch (error) {
    return {};
  }
};

const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const makeCode = () => {
  const part = () => Array.from({ length: 4 }, () => CHARS[crypto.randomInt(CHARS.length)]).join('');
  return `TAZHI-2026-${part()}-${part()}`;
};

export const makeToken = () => crypto.randomBytes(32).toString('hex');

export const createOrderId = () => {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = crypto.randomInt(100000, 1000000);
  return `TZ${ymd}-${random}`;
};

export const PRODUCTS = Object.freeze({
  trial28: Object.freeze({
    sku: 'trial28',
    title: '第二个月体验 · 第 29-56 天',
    shortTitle: '第二个月',
    priceYuan: 9.9,
    priceLabel: '9.9 元',
    scope: 'month2',
    digital: true,
    needsFulfillment: false,
    description: '首月 28 天免费开放；9.9 元继续第二个月，再决定是否升级全年。'
  }),
  month2: Object.freeze({
    sku: 'month2',
    title: '第二个月体验 · 第 29-56 天',
    shortTitle: '第二个月',
    priceYuan: 9.9,
    priceLabel: '9.9 元',
    scope: 'month2',
    digital: true,
    needsFulfillment: false,
    description: '首月 28 天免费开放；9.9 元继续第二个月，再决定是否升级全年。'
  }),
  full365: Object.freeze({
    sku: 'full365',
    title: '全年 365 天数字日历',
    shortTitle: '全年数字版',
    priceYuan: 99,
    priceLabel: '99 元',
    scope: 'full365',
    digital: true,
    needsFulfillment: false,
    description: '解锁全年内容，包含 365 天制度卡片、工具箱；未完成人工终审的部分按复核进度开放。'
  }),
  gift299: Object.freeze({
    sku: 'gift299',
    title: '实物底气礼盒',
    shortTitle: '底气礼盒',
    priceYuan: 299,
    priceLabel: '299 元',
    scope: 'full365',
    digital: false,
    needsFulfillment: true,
    description: '数字全年版 + 实物礼盒；需人工确认发货方案和实物样版后再开放。'
  }),
  custom999: Object.freeze({
    sku: 'custom999',
    title: '社群 / 企业定制',
    shortTitle: '企业定制',
    priceYuan: 999,
    priceLabel: '999 元起',
    scope: 'full365',
    digital: false,
    needsFulfillment: true,
    description: '按社群、企业或机构需求定制；需人工对接范围和交付方式。'
  })
});

export const isValidSku = (sku) => Boolean(PRODUCTS[sku]);
export const normalizeScope = (scope) => ((scope === 'month2' || scope === 'trial28') ? 'month2' : 'full365');

export const codeStatus = (record) => {
  if (!record) return 'missing';
  if (record.status) return record.status;
  if (record.used) return 'used';
  if (record.refunded) return 'refunded';
  return 'available';
};

export const claimAvailableCode = async (codesStore, scope, orderId) => {
  const { blobs } = await codesStore.list();
  for (const blob of blobs) {
    if (!/^TAZHI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(blob.key)) continue;
    let entry;
    try {
      entry = await codesStore.getWithMetadata(blob.key, { type: 'json' });
    } catch (error) {
      continue;
    }
    if (!entry) continue;
    const record = entry.data || {};
    if (codeStatus(record) !== 'available') continue;
    const recordScope = record.scope || 'full365';
    if (recordScope !== scope) continue;
    const result = await codesStore.setJSON(blob.key, {
      ...record,
      status: 'assigned',
      scope: recordScope,
      orderId,
      assignedAt: new Date().toISOString()
    }, { onlyIfMatch: entry.etag });
    if (result.modified) {
      return { code: blob.key, record: { ...record, status: 'assigned', scope: recordScope, orderId } };
    }
  }
  return null;
};

export const mintNewCode = async (codesStore, scope, orderId) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = makeCode();
    const record = {
      status: 'assigned',
      scope: normalizeScope(scope),
      orderId,
      assignedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    const result = await codesStore.setJSON(code, record, { onlyIfNew: true });
    if (result.modified) return { code, record };
  }
  throw new Error('code-mint-failed');
};

export const reserveCodeForOrder = async (codesStore, scope, orderId) => {
  const claimed = await claimAvailableCode(codesStore, normalizeScope(scope), orderId);
  if (claimed) return claimed;
  return mintNewCode(codesStore, normalizeScope(scope), orderId);
};

export const retireOrphanCode = async (codesStore, code, orderId) => {
  try {
    const entry = await codesStore.getWithMetadata(code, { type: 'json' });
    if (!entry) return;
    const record = entry.data || {};
    if (record.status === 'assigned' && record.orderId === orderId) {
      await codesStore.setJSON(code, { ...record, status: 'orphaned' }, { onlyIfMatch: entry.etag });
    }
  } catch (error) {}
};

export const activateOrder = async ({ ordersStore, codesStore, orderId, provider, externalId, note }) => {
  let order = await ordersStore.get(`order:${orderId}`, { type: 'json' });
  if (!order) return { ok: false, status: 404, message: '订单不存在。' };
  if (order.status === 'paid' && order.code) {
    return { ok: true, order };
  }
  if (order.status === 'refunded' || order.status === 'cancelled') {
    return { ok: false, status: 409, message: `订单已${order.status === 'refunded' ? '退款' : '取消'}。` };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await ordersStore.getWithMetadata(`order:${orderId}`, { type: 'json' });
    if (!current) return { ok: false, status: 404, message: '订单不存在。' };
    const latest = current.data || {};
    if (latest.status === 'paid' && latest.code) {
      return { ok: true, order: latest };
    }
    if (latest.status === 'refunded' || latest.status === 'cancelled') {
      return { ok: false, status: 409, message: `订单已${latest.status === 'refunded' ? '退款' : '取消'}。` };
    }
    const reserved = await reserveCodeForOrder(codesStore, latest.scope, orderId);
    const nowIso = new Date().toISOString();
    const updated = {
      ...latest,
      status: 'paid',
      code: reserved.code,
      paidAt: nowIso,
      fulfilledAt: nowIso,
      provider,
      providerExternalId: externalId || latest.providerExternalId || null,
      adminNote: note || latest.adminNote || null
    };
    const writeResult = await ordersStore.setJSON(`order:${orderId}`, updated, { onlyIfMatch: current.etag });
    if (writeResult.modified) {
      return { ok: true, order: updated };
    }
    await retireOrphanCode(codesStore, reserved.code, orderId);
  }
  return { ok: false, status: 409, message: '订单正在处理中，请稍后重试。' };
};

export const publicOrder = (order) => {
  const product = PRODUCTS[order.sku] || { title: order.title, priceYuan: Number(order.amountYuan || 0), scope: order.scope };
  const manualPending = order.status === 'unpaid' && order.provider === 'manual';
  return {
    orderId: order.orderId,
    sku: order.sku,
    title: product.title,
    shortTitle: product.shortTitle || product.title,
    priceYuan: product.priceYuan,
    priceLabel: product.priceLabel || `${product.priceYuan} 元`,
    status: order.status,
    scope: order.scope || product.scope || 'full365',
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
    provider: order.provider || null,
    needsFulfillment: Boolean(product.needsFulfillment),
    code: order.status === 'paid' ? order.code : null,
    qr: manualPending ? {
      wechat: '微信收款码.jpg',
      alipay: '支付宝收款码.jpg'
    } : null,
    manualMessage: manualPending
      ? '请按订单金额扫码付款，保留订单号。卖家确认到账后，本页会自动出现解锁码。'
      : null
  };
};

export const stripePriceId = (sku) => {
  const map = {
    trial28: process.env.STRIPE_PRICE_TRIAL || '',
    month2: process.env.STRIPE_PRICE_TRIAL || '',
    full365: process.env.STRIPE_PRICE_FULL || '',
    gift299: process.env.STRIPE_PRICE_GIFT || '',
    custom999: process.env.STRIPE_PRICE_CUSTOM || ''
  };
  return map[sku] || '';
};

export const createStripeCheckout = async (order, product) => {
  const secret = process.env.STRIPE_SECRET_KEY;
  const siteUrl = process.env.SITE_URL || '';
  const priceId = stripePriceId(product.sku);
  if (!secret || !siteUrl || !priceId) throw new Error('stripe-not-configured');
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${siteUrl.replace(/\/$/, '')}/order.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl.replace(/\/$/, '')}/checkout.html?cancelled=1`,
    client_reference_id: order.orderId,
    'metadata[orderId]': order.orderId,
    'metadata[sku]': product.sku
  });
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const payload = await response.json();
  if (!response.ok || !payload.id || !payload.url) {
    throw new Error(payload.error?.message || 'stripe-session-failed');
  }
  return { sessionId: payload.id, url: payload.url };
};

export const retrieveStripeSession = async (sessionId) => {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error('stripe-not-configured');
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secret}` }
  });
  const payload = await response.json();
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || 'stripe-session-not-found');
  }
  return payload;
};

export const verifyStripeSignature = (payload, signatureHeader, secret) => {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const signaturePart = parts.find((part) => part.startsWith('v1='));
  if (!timestampPart || !signaturePart) return false;
  const timestamp = timestampPart.slice(2);
  const signature = signaturePart.slice(3);
  if (!/^\d+$/.test(timestamp)) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return safeEqual(signature, expected);
};
