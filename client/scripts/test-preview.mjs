// Serve the real production build and stream API/SSE requests without loading Vite's native tooling.
import { createServer, request } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:4174');
  if (url.pathname.startsWith('/api/')) {
    const upstream = request(
      new URL(req.url, 'http://localhost:5213'),
      { method: req.method, headers: req.headers },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (res.headersSent) res.destroy();
      else {
        res.writeHead(502);
        res.end('Test API unavailable');
      }
    });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
    return;
  }
  try {
    const file = path.resolve(
      dist,
      url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)),
    );
    if (!file.startsWith(path.resolve(dist) + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.listen(4174, '127.0.0.1', () => console.log('Production test preview listening on 4174'));
