#!/usr/bin/env node
// ---------------------------------------------------------------------------
// scripts/dev-server.mjs
//
// Minimal static file server for local development and the Playwright suite.
// Deliberately dependency-free: `npx serve` needs registry access at run time,
// which fails behind a TLS-intercepting proxy, and pulling a server package in
// just to hand back static files is not worth the supply-chain surface.
//
//   node scripts/dev-server.mjs              # http://127.0.0.1:5500
//   node scripts/dev-server.mjs --port 4173
// ---------------------------------------------------------------------------
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const portArg = process.argv.indexOf('--port');
const PORT = portArg !== -1 ? Number(process.argv[portArg + 1]) : 5500;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// Resolve inside ROOT and reject anything that escapes it, so a crafted path
// like /../../.ssh/id_rsa can't read outside the site directory.
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const candidate = resolve(join(ROOT, decoded));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;
  return candidate;
}

async function resolveFile(p) {
  try {
    const s = await stat(p);
    if (s.isDirectory()) return resolveFile(join(p, 'index.html'));
    return p;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method Not Allowed');
  }

  const requested = safePath(req.url === '/' ? '/index.html' : req.url);
  if (!requested) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  let file = await resolveFile(requested);
  // Bare paths like /about also resolve to /about.html, matching static hosts.
  if (!file && !extname(requested)) file = await resolveFile(requested + '.html');

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<h1>404</h1>');
  }

  const body = await readFile(file);
  res.writeHead(200, {
    'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
});

server.listen(PORT, HOST, () => {
  console.log(`Serving ${ROOT}\n  http://${HOST}:${PORT}`);
});
