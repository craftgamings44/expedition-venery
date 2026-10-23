/**
 * Run the cloud accounts API on the local dev server.
 *
 * The Vercel function in api/index.js is the one and only implementation.
 * This file only adapts Node's http request and response objects to the
 * shape that function expects, so local development and production run
 * exactly the same code.
 */

import handler from '../api/index.js';

/**
 * Read the whole request body.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string|Object>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Wrap a Node response in the small subset of the Vercel response API that
 * the handler uses.
 * @param {import('node:http').ServerResponse} res
 */
function wrapRes(res) {
  let status = 200;
  const vres = {
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    status(code) {
      status = code;
      return vres;
    },
    json(obj) {
      const body = JSON.stringify(obj);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(body);
    },
    writeHead(code, headers) {
      res.writeHead(code, headers);
    },
    end(...args) {
      res.end(...args);
    },
  };
  return vres;
}

/**
 * Handle a request that arrived at /api/*.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleApi(req, res) {
  const raw = await readBody(req);
  const type = String(req.headers['content-type'] || '');
  let body = raw;
  if (raw && type.includes('json')) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = {};
    }
  }
  const vreq = {
    url: req.url,
    method: req.method,
    headers: req.headers,
    body,
    socket: req.socket,
  };
  try {
    await handler(vreq, wrapRes(res));
  } catch (err) {
    console.error('api error', err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server error.' }));
  }
}
