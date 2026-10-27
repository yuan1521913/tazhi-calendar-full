import { getStore } from '../../lib/store.mjs';
import {
  json,
  safeEqual,
  isRateLimited,
  readJsonBody,
  publicOrder,
  activateOrder,
  codeStatus
} from './_shared.mjs';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const admin = (payload, status = 200) => json(payload, status);

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (!ADMIN_TOKEN || !safeEqual(req.headers.get('x-admin-token'), ADMIN_TOKEN)) {
    return admin({ ok: false, message: '没有权限，ADMIN_TOKEN 不匹配。' }, 401);
  }
  if (await isRateLimited(req, getStore('rate-limits'), 'admin-orders', 30, 10 * 60 * 1000)) {
    return admin({ ok: false, message: '请求过于频繁，请稍后再试。' }, 429);
  }

  const ordersStore = getStore('orders');
  const codesStore = getStore('unlock-codes');

  if (req.method === 'GET') {
    try {
      const { blobs } = await ordersStore.list({ prefix: 'order:' });
      const orders = [];
      for (const blob of blobs) {
        const order = await ordersStore.get(blob.key, { type: 'json' });
        if (!order) continue;
        orders.push({
          orderId: order.orderId,
          sku: order.sku,
          title: order.title,
          priceYuan: order.priceYuan,
          status: order.status,
          scope: order.scope,
          provider: order.provider,
          providerExternalId: order.providerExternalId,
          code: order.code,
          createdAt: order.createdAt,
          paidAt: order.paidAt,
          refundedAt: order.refundedAt,
          adminNote: order.adminNote,
          source: order.source
        });
      }
      orders.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return admin({ ok: true, orders });
    } catch (error) {
      return admin({ ok: false, message: '读取订单失败：' + String(error && error.message || error) }, 500);
    }
  }

  if (req.method !== 'POST') {
    return admin({ ok: false, message: '请求方式不对。' }, 405);
  }

  const body = await readJsonBody(req);
  const action = String(body.action || '').trim();
  const orderId = String(body.orderId || '').trim();
  const note = String(body.note || '').trim().slice(0, 300);
  if (!orderId) return admin({ ok: false, message: '缺少订单号。' }, 400);

  try {
    if (action === 'confirm') {
      const result = await activateOrder({
        ordersStore,
        codesStore,
        orderId,
        provider: 'manual',
        externalId: `manual:${new Date().toISOString()}`,
        note
      });
      if (!result.ok) return admin({ ok: false, message: result.message }, result.status || 409);
      return admin({ ok: true, order: publicOrder(result.order) });
    }

    const current = await ordersStore.getWithMetadata(`order:${orderId}`, { type: 'json' });
    if (!current) return admin({ ok: false, message: '订单不存在。' }, 404);
    const order = current.data || {};

    if (action === 'cancel') {
      if (order.status === 'refunded') return admin({ ok: false, message: '订单已退款。' }, 409);
      const updated = { ...order, status: 'cancelled', adminNote: note || order.adminNote, cancelledAt: new Date().toISOString() };
      const result = await ordersStore.setJSON(`order:${orderId}`, updated, { onlyIfMatch: current.etag });
      if (!result.modified) return admin({ ok: false, message: '订单已被其他操作更新，请刷新后重试。' }, 409);
      return admin({ ok: true, order: publicOrder(updated) });
    }

    if (action === 'refund') {
      if (order.status === 'refunded') return admin({ ok: false, message: '订单已退款。' }, 409);
      const updated = {
        ...order,
        status: 'refunded',
        adminNote: note || order.adminNote,
        refundedAt: new Date().toISOString()
      };
      const result = await ordersStore.setJSON(`order:${orderId}`, updated, { onlyIfMatch: current.etag });
      if (!result.modified) return admin({ ok: false, message: '订单已被其他操作更新，请刷新后重试。' }, 409);
      if (order.code) {
        const codeEntry = await codesStore.getWithMetadata(order.code, { type: 'json' });
        if (codeEntry) {
          const record = codeEntry.data || {};
          await codesStore.setJSON(order.code, { ...record, status: 'refunded', refundedAt: new Date().toISOString() }, { onlyIfMatch: codeEntry.etag });
        }
      }
      return admin({ ok: true, order: publicOrder(updated) });
    }

    if (action === 'lookup') {
      return admin({ ok: true, order: publicOrder(order) });
    }

    return admin({ ok: false, message: '不支持的操作。' }, 400);
  } catch (error) {
    return admin({ ok: false, message: '订单操作失败，请稍后重试。' }, 500);
  }
};
