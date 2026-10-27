import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTS,
  safeEqual,
  codeStatus,
  normalizeScope,
  createOrderId,
  makeToken,
  makeCode,
  publicOrder,
  activateOrder
} from '../netlify/functions/_shared.mjs';
import { buildData, loadFullData, FUNCTION_SOURCE } from '../netlify/functions/content.mjs';
import { OPEN_TO_PUBLIC } from '../lib/launch-mode.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const stateDir = path.join(rootDir, '.local');
const stateFile = path.join(stateDir, process.env.LOCAL_STATE_FILE || 'dev-blobs.json');
const port = Number(process.env.PORT || 4173);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

class LocalStore {
  constructor(name, persist) {
    this.name = name;
    this.persist = persist;
    this.map = new Map();
  }

  async load() {
    try {
      const raw = await fs.promises.readFile(stateFile, 'utf8');
      const all = JSON.parse(raw);
      const entries = all[this.name] || {};
      Object.entries(entries).forEach(([key, value]) => {
        this.map.set(key, value);
      });
    } catch (error) {}
  }

  async get(key, options = {}) {
    const entry = this.map.get(key);
    if (!entry) return null;
    return options.type === 'json' ? structuredClone(entry.value) : entry.value;
  }

  async getWithMetadata(key, options = {}) {
    const entry = this.map.get(key);
    if (!entry) return null;
    return {
      data: options.type === 'json' ? structuredClone(entry.value) : entry.value,
      etag: entry.etag,
      metadata: {}
    };
  }

  async setJSON(key, value, options = {}) {
    const existing = this.map.get(key);
    if (options.onlyIfNew && existing) return { modified: false };
    if (options.onlyIfMatch && (!existing || existing.etag !== options.onlyIfMatch)) return { modified: false };
    const etag = crypto.randomBytes(12).toString('hex');
    this.map.set(key, { etag, value: structuredClone(value), metadata: {} });
    await this.persist();
    return { modified: true, etag };
  }

  async set(key, value, options = {}) {
    return this.setJSON(key, value, options);
  }

  async list(options = {}) {
    const prefix = options.prefix || '';
    const blobs = [];
    for (const [key, entry] of this.map.entries()) {
      if (key.startsWith(prefix)) blobs.push({ key, etag: entry.etag });
    }
    return { blobs, directories: [] };
  }

  async delete(key) {
    this.map.delete(key);
    await this.persist();
  }
}

const stores = {};
const storeNames = ['orders', 'unlock-codes', 'unlock-sessions', 'rate-limits', 'comments'];

const persistAll = async () => {
  await fs.promises.mkdir(stateDir, { recursive: true });
  const all = {};
  for (const name of storeNames) {
    const entries = {};
    for (const [key, entry] of stores[name].map.entries()) {
      entries[key] = { etag: entry.etag, value: entry.value };
    }
    all[name] = entries;
  }
  await fs.promises.writeFile(stateFile, JSON.stringify(all), 'utf8');
};

for (const name of storeNames) {
  stores[name] = new LocalStore(name, persistAll);
  await stores[name].load();
}

const localAdminToken = process.env.ADMIN_TOKEN || (() => {
  try {
    const tokenPath = path.join(stateDir, 'ADMIN_TOKEN.txt');
    return fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : 'dev-admin-token';
  } catch (error) {
    return 'dev-admin-token';
  }
})();

const parseCookies = (req) => {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  });
  return cookies;
};

const readBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    try { resolve(JSON.parse(raw || '{}')); } catch (error) { resolve({}); }
  });
});

const send = (res, status, body, type = 'application/json; charset=utf-8', extraHeaders = {}) => {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
};

const json = (res, payload, status = 200, extraHeaders = {}) =>
  send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8', extraHeaders);

const clientIp = (req) => req.socket.remoteAddress || 'local';

const isRateLimited = async (req, storeName, prefix, max, windowMs) => {
  const key = `${prefix}:${clientIp(req)}`;
  const now = Date.now();
  let record = await stores[storeName].get(key, { type: 'json' });
  const startedAt = record && Number.isFinite(Date.parse(record.startedAt)) ? Date.parse(record.startedAt) : now;
  const count = record && now - startedAt < windowMs ? Number(record.count) + 1 : 1;
  await stores[storeName].setJSON(key, { count, startedAt: new Date(startedAt).toISOString() });
  return count > max;
};

const isAdmin = (req) => safeEqual(req.headers['x-admin-token'], localAdminToken);

const isLocalHost = (req) => {
  const host = String(req.headers.host || '');
  return host.startsWith('127.0.0.1') || host.startsWith('localhost') || host === '[::1]';
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/api/content') {
      const full = await loadFullData();
      const cookies = parseCookies(req);
      const devReferrer = String(req.headers.referer || '').includes('?dev=1');
      const devMode = isLocalHost(req) && (url.searchParams.get('dev') === '1' || devReferrer || cookies.tazhi_session === 'dev');
      let session = null;
      if (cookies.tazhi_session && cookies.tazhi_session !== 'dev') {
        session = await stores['unlock-sessions'].get(cookies.tazhi_session, { type: 'json' });
      }
      if (session?.code) {
        const codeRecord = await stores['unlock-codes'].get(session.code, { type: 'json' });
        if (codeStatus(codeRecord) === 'refunded' || codeRecord?.refunded) session = null;
      }
      const authorizedScope = devMode
        ? 'full365'
        : session && new Date(session.expiresAt) > new Date()
          ? ((session.scope === 'month2' || session.scope === 'trial28') ? 'month2' : 'full365')
          : 'free';
      const payload = buildData(full, authorizedScope);
      send(res, 200, `window.CALENDAR_DATA = ${JSON.stringify(payload)};\n${FUNCTION_SOURCE}`, 'application/javascript; charset=utf-8');
      return;
    }

    if (pathname === '/api/verify-unlock' && req.method === 'POST') {
      const body = await readBody(req);
      const code = String(body.code || '').trim().toUpperCase();
      if (code === 'DEV') {
        if (!isLocalHost(req)) {
          json(res, { ok: false, message: '仅限本机开发解锁。' }, 403);
          return;
        }
        send(res, 200, JSON.stringify({ ok: true, message: '本地开发解锁成功。', scope: 'full365' }), 'application/json; charset=utf-8', {
          'Set-Cookie': 'tazhi_session=dev; Path=/; HttpOnly; Max-Age=86400'
        });
        return;
      }
      if (!/^TAZHI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
        json(res, { ok: false, message: '解锁码格式不正确。' }, 400);
        return;
      }
      const entry = await stores['unlock-codes'].getWithMetadata(code, { type: 'json' });
      if (!entry) {
        json(res, { ok: false, message: '解锁码无效，请核对后重试。' }, 404);
        return;
      }
      const record = entry.data || {};
      const status = codeStatus(record);
      if (status === 'used') {
        json(res, { ok: false, message: '这个解锁码已经使用过了。' }, 409);
        return;
      }
      if (status === 'refunded') {
        json(res, { ok: false, message: '这个解锁码已退款停用。' }, 410);
        return;
      }
      if (status !== 'available' && status !== 'assigned') {
        json(res, { ok: false, message: '这个解锁码当前不可用。' }, 409);
        return;
      }
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const scope = normalizeScope(record.scope);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await stores['unlock-sessions'].setJSON(sessionToken, {
        code,
        scope,
        orderId: record.orderId || null,
        createdAt: new Date().toISOString(),
        expiresAt
      });
      const result = await stores['unlock-codes'].setJSON(code, {
        ...record,
        status: 'used',
        usedAt: new Date().toISOString()
      }, { onlyIfMatch: entry.etag });
      if (!result.modified) {
        json(res, { ok: false, message: '解锁码刚刚被使用，请刷新后重试。' }, 409);
        return;
      }
      json(res, { ok: true, message: '解锁成功。', scope }, 200, {
        'Set-Cookie': `tazhi_session=${sessionToken}; Path=/; HttpOnly; Max-Age=2592000`
      });
      return;
    }

    if (pathname === '/api/create-order' && req.method === 'POST') {
      // 与 netlify/functions/create-order.mjs 保持一致：全开放时不下单、不收款。
      if (OPEN_TO_PUBLIC) {
        json(res, { ok: false, message: '内容已全部开放，无需购买。' }, 410);
        return;
      }
      if (await isRateLimited(req, 'rate-limits', 'order-create', 30, 10 * 60 * 1000)) {
        json(res, { ok: false, message: '下单过于频繁，请稍后再试。' }, 429);
        return;
      }
      const body = await readBody(req);
      const sku = String(body.sku || '').trim();
      if (!PRODUCTS[sku]) {
        json(res, { ok: false, message: '商品不存在。' }, 400);
        return;
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
      const created = await stores.orders.setJSON(`order:${orderId}`, order, { onlyIfNew: true });
      if (!created.modified) {
        json(res, { ok: false, message: '订单号冲突，请重试。' }, 409);
        return;
      }
      json(res, { ok: true, orderId, sku: product.sku, mode: 'manual', deliveryToken });
      return;
    }

    if (pathname === '/api/order-status' && req.method === 'GET') {
      const sessionId = url.searchParams.get('session_id') || '';
      const orderId = String(url.searchParams.get('orderId') || '').trim();
      const token = String(url.searchParams.get('token') || '').trim();
      if (sessionId) {
        json(res, { ok: false, message: '本地开发模式未接入 Stripe，请使用订单号查询。' }, 501);
        return;
      }
      if (!orderId || !token) {
        json(res, { ok: false, message: '缺少订单参数。' }, 400);
        return;
      }
      const order = await stores.orders.get(`order:${orderId}`, { type: 'json' });
      if (!order) {
        json(res, { ok: false, message: '订单不存在。' }, 404);
        return;
      }
      if (!safeEqual(order.deliveryToken, token)) {
        json(res, { ok: false, message: '订单校验失败。' }, 403);
        return;
      }
      json(res, { ok: true, order: publicOrder(order) });
      return;
    }

    if (pathname === '/api/restore-session' && req.method === 'POST') {
      if (await isRateLimited(req, 'rate-limits', 'restore-session', 30, 10 * 60 * 1000)) {
        json(res, { ok: false, message: '请求过于频繁，请稍后再试。' }, 429);
        return;
      }
      const body = await readBody(req);
      const orderId = String(body.orderId || '').trim();
      const token = String(body.token || '').trim();
      if (!orderId || !token) {
        json(res, { ok: false, message: '缺少订单参数。' }, 400);
        return;
      }
      const order = await stores['orders'].get(`order:${orderId}`, { type: 'json' });
      if (!order) {
        json(res, { ok: false, message: '订单不存在。' }, 404);
        return;
      }
      if (!safeEqual(order.deliveryToken, token)) {
        json(res, { ok: false, message: '订单校验失败。' }, 403);
        return;
      }
      if (order.status !== 'paid' || !order.code) {
        json(res, { ok: false, message: '订单尚未完成付款。' }, 409);
        return;
      }
      const entry = await stores['unlock-codes'].getWithMetadata(order.code, { type: 'json' });
      const record = entry?.data || {};
      const status = codeStatus(record);
      if (status === 'refunded' || record.refunded) {
        json(res, { ok: false, message: '这个订单已退款停用。' }, 410);
        return;
      }
      if (status === 'orphaned' || status === 'missing') {
        json(res, { ok: false, message: '这个订单的解锁码不可用，请联系管理员。' }, 409);
        return;
      }
      const scope = normalizeScope(record.scope || order.scope);
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await stores['unlock-sessions'].setJSON(sessionToken, {
        code: order.code,
        scope,
        orderId,
        restored: true,
        createdAt: new Date().toISOString(),
        expiresAt
      });
      json(res, { ok: true, message: '访问已恢复。', scope }, 200, {
        'Set-Cookie': `tazhi_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`
      });
      return;
    }

    if (pathname === '/api/admin-codes') {
      if (!isLocalHost(req)) { json(res, { ok: false, message: '仅限本机访问。' }, 403); return; }
      if (!isAdmin(req)) {
        json(res, { ok: false, message: '没有权限，ADMIN_TOKEN 不匹配。' }, 401);
        return;
      }
      if (req.method === 'GET') {
        const { blobs } = await stores['unlock-codes'].list();
        const codes = [];
        for (const blob of blobs) {
          if (!/^TAZHI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(blob.key)) continue;
          const record = await stores['unlock-codes'].get(blob.key, { type: 'json' });
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
        json(res, { ok: true, codes });
        return;
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        const count = Math.min(Math.max(Number(body.count) || 1, 1), 50);
        const scope = normalizeScope(body.scope);
        const note = String(body.note || '').trim().slice(0, 200);
        const codes = [];
        for (let index = 0; index < count; index += 1) {
          const code = makeCode();
          const record = { status: 'available', scope, orderId: null, note: note || null, createdAt: new Date().toISOString(), usedAt: null };
          const result = await stores['unlock-codes'].setJSON(code, record, { onlyIfNew: true });
          if (!result.modified) {
            index -= 1;
            continue;
          }
          codes.push(code);
        }
        json(res, { ok: true, codes, scope, count: codes.length });
        return;
      }
      json(res, { ok: false, message: '请求方式不对。' }, 405);
      return;
    }

    if (pathname === '/api/admin-orders') {
      if (!isLocalHost(req)) { json(res, { ok: false, message: '仅限本机访问。' }, 403); return; }
      if (!isAdmin(req)) {
        json(res, { ok: false, message: '没有权限，ADMIN_TOKEN 不匹配。' }, 401);
        return;
      }
      if (req.method === 'GET') {
        const { blobs } = await stores.orders.list({ prefix: 'order:' });
        const orders = [];
        for (const blob of blobs) {
          const order = await stores.orders.get(blob.key, { type: 'json' });
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
        json(res, { ok: true, orders });
        return;
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        const action = String(body.action || '').trim();
        const orderId = String(body.orderId || '').trim();
        const note = String(body.note || '').trim().slice(0, 300);
        if (!orderId) {
          json(res, { ok: false, message: '缺少订单号。' }, 400);
          return;
        }
        if (action === 'confirm') {
          const result = await activateOrder({
            ordersStore: stores.orders,
            codesStore: stores['unlock-codes'],
            orderId,
            provider: 'manual',
            externalId: `manual:${new Date().toISOString()}`,
            note
          });
          if (!result.ok) {
            json(res, { ok: false, message: result.message }, result.status || 409);
            return;
          }
          json(res, { ok: true, order: publicOrder(result.order) });
          return;
        }
        const current = await stores.orders.getWithMetadata(`order:${orderId}`, { type: 'json' });
        if (!current) {
          json(res, { ok: false, message: '订单不存在。' }, 404);
          return;
        }
        const order = current.data || {};
        if (action === 'cancel') {
          const updated = { ...order, status: 'cancelled', adminNote: note || order.adminNote, cancelledAt: new Date().toISOString() };
          const result = await stores.orders.setJSON(`order:${orderId}`, updated, { onlyIfMatch: current.etag });
          if (!result.modified) {
            json(res, { ok: false, message: '订单已被其他操作更新，请刷新后重试。' }, 409);
            return;
          }
          json(res, { ok: true, order: publicOrder(updated) });
          return;
        }
        if (action === 'refund') {
          const updated = { ...order, status: 'refunded', adminNote: note || order.adminNote, refundedAt: new Date().toISOString() };
          const result = await stores.orders.setJSON(`order:${orderId}`, updated, { onlyIfMatch: current.etag });
          if (!result.modified) {
            json(res, { ok: false, message: '订单已被其他操作更新，请刷新后重试。' }, 409);
            return;
          }
          if (order.code) {
            const codeEntry = await stores['unlock-codes'].getWithMetadata(order.code, { type: 'json' });
            if (codeEntry) {
              await stores['unlock-codes'].setJSON(order.code, { ...(codeEntry.data || {}), status: 'refunded', refundedAt: new Date().toISOString() }, { onlyIfMatch: codeEntry.etag });
            }
          }
          json(res, { ok: true, order: publicOrder(updated) });
          return;
        }
        json(res, { ok: false, message: '不支持的操作。' }, 400);
        return;
      }
      json(res, { ok: false, message: '请求方式不对。' }, 405);
      return;
    }

    if (pathname === '/api/comments' && req.method === 'GET') {
      const day = Math.min(365, Math.max(1, Number(url.searchParams.get('day') || 1)));
      const { blobs } = await stores.comments.list();
      const comments = [];
      for (const blob of blobs) {
        const comment = await stores.comments.get(blob.key, { type: 'json' });
        if (!comment || comment.status !== 'approved' || Number(comment.day) !== day) continue;
        comments.push({ id: comment.id, day: comment.day, text: comment.text, likes: Number(comment.likes || 0), createdAt: comment.createdAt });
      }
      comments.sort((a, b) => (b.likes - a.likes) || String(a.createdAt).localeCompare(String(b.createdAt)));
      json(res, { ok: true, comments, likeTotal: comments.reduce(function (sum, item) { return sum + item.likes; }, 0) });
      return;
    }

    if (pathname === '/api/comments' && req.method === 'POST') {
      if (await isRateLimited(req, 'rate-limits', 'comment-create', 10, 60 * 1000)) {
        json(res, { ok: false, message: '留言过于频繁，请稍后再试。' }, 429);
        return;
      }
      const body = await readBody(req);
      const day = Math.min(365, Math.max(1, Number(body.day) || 1));
      const text = String(body.text || '').trim().slice(0, 300);
      if (!text) { json(res, { ok: false, message: '留言不能为空。' }, 400); return; }
      const id = crypto.randomUUID();
      const comment = { id, day, text, status: 'pending', likes: 0, likedIps: [], createdAt: new Date().toISOString() };
      await stores.comments.setJSON(`comment:${id}`, comment, { onlyIfNew: true });
      json(res, { ok: true, comment: { id, day, text, status: 'pending', likes: 0, createdAt: comment.createdAt } });
      return;
    }

    if (pathname === '/api/comments/like' && req.method === 'POST') {
      if (await isRateLimited(req, 'rate-limits', 'comment-like', 20, 60 * 1000)) {
        json(res, { ok: false, message: '点赞过于频繁，请稍后再试。' }, 429);
        return;
      }
      const body = await readBody(req);
      const id = String(body.id || '').trim();
      const current = await stores.comments.getWithMetadata(`comment:${id}`, { type: 'json' });
      if (!current || (current.data || {}).status !== 'approved') { json(res, { ok: false, message: '留言不存在或未通过审核。' }, 404); return; }
      const comment = current.data; const ip = clientIp(req);
      if ((comment.likedIps || []).includes(ip)) { json(res, { ok: true, already: true, likes: comment.likes }); return; }
      const updated = { ...comment, likes: Number(comment.likes || 0) + 1, likedIps: [...(comment.likedIps || []), ip] };
      await stores.comments.setJSON(`comment:${id}`, updated, { onlyIfMatch: current.etag });
      json(res, { ok: true, likes: updated.likes });
      return;
    }

    if (pathname === '/api/admin-comments') {
      if (!isLocalHost(req)) { json(res, { ok: false, message: '仅限本机访问。' }, 403); return; }
      if (!isAdmin(req)) { json(res, { ok: false, message: '没有权限，ADMIN_TOKEN 不匹配。' }, 401); return; }
      if (req.method === 'GET') {
        const { blobs } = await stores.comments.list();
        const comments = [];
        for (const blob of blobs) {
          const comment = await stores.comments.get(blob.key, { type: 'json' });
          if (!comment || comment.status === 'deleted') continue;
          comments.push(comment);
        }
        comments.sort(function (a, b) { const rank = { pending: 0, approved: 1, rejected: 2 }; return (rank[a.status] - rank[b.status]) || (b.likes - a.likes) || String(a.createdAt).localeCompare(String(b.createdAt)); });
        json(res, { ok: true, comments });
        return;
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        const id = String(body.id || '').trim();
        const action = String(body.action || '').trim();
        const current = await stores.comments.getWithMetadata(`comment:${id}`, { type: 'json' });
        if (!current) { json(res, { ok: false, message: '留言不存在。' }, 404); return; }
        const comment = current.data || {};
        const next = { ...comment };
        if (action === 'approve') next.status = 'approved';
        else if (action === 'reject') next.status = 'rejected';
        else if (action === 'delete') next.status = 'deleted';
        else { json(res, { ok: false, message: '不支持的操作。' }, 400); return; }
        next.adminActionAt = new Date().toISOString();
        await stores.comments.setJSON(`comment:${id}`, next, { onlyIfMatch: current.etag });
        json(res, { ok: true, comment: next });
        return;
      }
      json(res, { ok: false, message: '请求方式不对。' }, 405);
      return;
    }
    if (pathname.startsWith('/api/')) {
      json(res, { ok: false, message: '本地预览未实现该接口。' }, 404);
      return;
    }

    let requestPath = pathname;
    if (requestPath === '/') requestPath = '/home.html';
    const decoded = decodeURIComponent(requestPath);
    if (decoded === '/admin.html' && !isLocalHost(req)) {
      send(res, 403, 'Forbidden');
      return;
    }
    const filePath = path.normalize(path.join(publicDir, decoded));
    if (filePath !== publicDir && !filePath.startsWith(publicDir + path.sep)) {
      send(res, 403, 'Forbidden');
      return;
    }

    const stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      send(res, 404, 'Not Found');
      return;
    }

    const body = await fs.promises.readFile(filePath);
    send(res, 200, body, mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  } catch (error) {
    send(res, 404, 'Not Found');
    console.error(error);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`SheZhi commercial preview: http://127.0.0.1:${port}`);
});
