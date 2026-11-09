/** Real HTTP fixture for root-worker/demo coexistence; serves the built demo unchanged. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const port = Number(process.env.E2E_PORT ?? 4251);
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Production root fixture</title>'); return; }
    if (path === '/root-fixture-worker.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end("self.addEventListener('activate',event=>event.waitUntil(Promise.all([self.clients.claim(), caches.open('kikimashta-offline-/-production-test').then(cache=>cache.put('/production-marker',new Response('root-cache-preserved')))]))); self.addEventListener('fetch',()=>{});"); return;
    }
    if (!path.startsWith('/offline-demo/')) { response.writeHead(404); response.end(); return; }
    let file = resolve(root, path.slice('/offline-demo/'.length));
    if (file !== root && !file.startsWith(root + sep)) { response.writeHead(400); response.end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const body = await readFile(file);
    response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    response.setHeader('Content-Length', body.byteLength);
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404); response.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Demo fixture http://127.0.0.1:${port}/offline-demo/`));
