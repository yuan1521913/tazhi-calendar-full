const readBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => resolve(raw));
});

export const runNetlify = async (req, res, handler) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const headers = new Headers();
  for (const key of Object.keys(req.headers || {})) {
    headers.set(key, req.headers[key]);
  }

  let body;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    body = await readBody(req);
  }

  const request = new Request(url, {
    method: req.method,
    headers,
    body
  });

  const response = await handler(request);
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(await response.text());
};
