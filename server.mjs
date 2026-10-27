import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import contentHandler from './netlify/functions/content.mjs';
import createOrderHandler from './netlify/functions/create-order.mjs';
import mockPayHandler from './netlify/functions/mock-pay.mjs';
import orderStatusHandler from './netlify/functions/order-status.mjs';
import verifyUnlockHandler from './netlify/functions/verify-unlock.mjs';
import restoreSessionHandler from './netlify/functions/restore-session.mjs';
import adminCodesHandler from './netlify/functions/admin-codes.mjs';
import adminOrdersHandler from './netlify/functions/admin-orders.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'public');
const PORT = Number(process.env.PORT || 8080);

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
  '.txt': 'text/plain; charset=utf-8'
};

const readBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => resolve(raw));
});

const runHandler = async (req, res, handler) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const headers = new Headers();
  for (const key of Object.keys(req.headers || {})) {
    headers.set(key, req.headers[key]);
  }
  let body;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    body = await readBody(req);
  }
  const request = new Request(url, { method: req.method, headers, body });
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(await response.text());
};

const routes = {
  '/api/content': contentHandler,
  '/api/create-order': createOrderHandler,
  '/api/mock-pay': mockPayHandler,
  '/api/order-status': orderStatusHandler,
  '/api/verify-unlock': verifyUnlockHandler,
  '/api/restore-session': restoreSessionHandler,
  '/api/admin-codes': adminCodesHandler,
  '/api/admin-orders': adminOrdersHandler
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (routes[pathname]) {
      await runHandler(req, res, routes[pathname]);
      return;
    }

    if (pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, message: '接口不存在。' }));
      return;
    }

    let requestPath = pathname;
    if (requestPath === '/') requestPath = '/home.html';
    if (requestPath === '/favicon.ico') requestPath = '/favicon.svg';

    const decoded = decodeURIComponent(requestPath);
    const filePath = path.normalize(path.join(publicDir, decoded));
    if (filePath !== publicDir && !filePath.startsWith(publicDir + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat || stat.isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const body = await fs.promises.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch (error) {
    console.error(error);
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, message: 'Not Found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tazhi CloudBase server: http://0.0.0.0:${PORT}`);
});
