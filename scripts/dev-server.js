// Local preview: runs the Worker in Node with an in-memory database. Data is lost when it stops.
//   node test/dev-server.js   then open http://localhost:8787
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import worker from '../worker/index.js';
import { fakeD1 } from '../test/d1.js';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const root = join(import.meta.dirname, '..', 'public');
const env = {
  DB: fakeD1(),
  ASSETS: {
    async fetch(request) {
      let path = normalize(new URL(request.url).pathname);
      if (path === '/' || !extname(path)) path = '/index.html';
      try { return new Response(await readFile(join(root, path)), { headers: { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' } }); }
      catch { return new Response('Not found', { status: 404 }); }
    },
  },
};

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://localhost:8787${req.url}`, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(8787, () => console.log('http://localhost:8787'));
