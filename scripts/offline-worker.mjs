/* global self, caches */
// Replaced by the production build. This script is never served directly.
const manifest = __OFFLINE_MANIFEST__; // eslint-disable-line no-undef
const scope = new URL(self.registration.scope);
const cacheName = `kikimashta-offline-${scope.pathname}-${manifest.version}`;
const absolute = path => new URL(path, scope).href;
const known = new Map(Object.keys(manifest.hashes).map(path => [absolute(path), path]));
let mutation = Promise.resolve();

// Let existing tabs finish on their current app version. Never skipWaiting or claim clients.
self.addEventListener('install', () => {});

async function cachedRange(response, range) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const data = await response.arrayBuffer();
  const size = data.byteLength;
  let start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
  let end = match?.[1] && match[2] ? Number(match[2]) : size - 1;
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(data.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin) return;
  if (url.pathname === new URL('offline-manifest.json', scope).pathname) {
    event.respondWith(Promise.resolve(Response.json(manifest)));
    return;
  }
  const relativePath = url.pathname.slice(scope.pathname.length);
  const navigation = request.mode === 'navigate' && ['', 'index.html', 'vocabulary', 'vocabulary/', 'vocabulary/index.html'].includes(relativePath);
  const target = navigation ? absolute(relativePath.startsWith('vocabulary') ? 'vocabulary/index.html' : 'index.html') : request.url;
  if (!known.has(target)) return; // No API, auth, account data or unknown requests in these caches.
  event.respondWith((async () => {
    const cached = await (await caches.open(cacheName)).match(target);
    if (cached) return request.headers.has('range') ? cachedRange(cached, request.headers.get('range')) : cached;
    return fetch(request);
  })());
});

function selectedUrls(urls) {
  if (!Array.isArray(urls) || urls.length > 20000) throw new Error('Invalid download selection.');
  const all = [...new Set([...manifest.shell, ...urls])];
  return all.map(path => {
    if (typeof path !== 'string' || !(path in manifest.hashes)) throw new Error('This selection is unavailable in this app version. Reload while online.');
    return absolute(path);
  });
}

async function status(urls) {
  const cache = await caches.open(cacheName);
  let completed = 0;
  let bytes = 0;
  for (const url of urls) {
    const response = await cache.match(url);
    if (response?.ok) { completed++; bytes += manifest.sizes[known.get(url)]; }
  }
  return { ready: completed === urls.length, completed, total: urls.length, bytes };
}

async function download(urls, port) {
  const cache = await caches.open(cacheName);
  let completed = 0;
  let bytes = 0;
  for (const url of urls) {
    const path = known.get(url);
    if (!(await cache.match(url))) {
      const response = await fetch(new Request(url, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(30000) }));
      if (!response.ok || response.status !== 200 || response.redirected) throw new Error('Download failed. Reconnect and try again.');
      const body = await response.clone().arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', body))].map(value => value.toString(16).padStart(2, '0')).join('');
      if (hash !== manifest.hashes[path]) throw new Error('The app has updated. Close all app tabs and reopen while online before downloading.');
      await cache.put(url, response);
    }
    completed++;
    bytes += manifest.sizes[path];
    port.postMessage({ type: 'PROGRESS', completed, total: urls.length, bytes });
  }
  return status(urls);
}

self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port) return;
  const run = async () => {
    try {
      const { type, version, urls = [] } = event.data ?? {};
      if (version !== manifest.version) throw new Error('The app has updated. Close all app tabs and reopen while online.');
      if (type === 'REMOVE') {
        for (const name of await caches.keys()) {
          if (name.startsWith(`kikimashta-offline-${scope.pathname}-`)) await caches.delete(name);
        }
        port.postMessage({ type: 'RESULT', ready: false, completed: 0, total: 0, bytes: 0 });
        return;
      }
      const selected = selectedUrls(urls);
      const result = type === 'STATUS' ? await status(selected) : type === 'DOWNLOAD' ? await download(selected, port) : null;
      if (!result) throw new Error('Unknown offline action.');
      port.postMessage({ type: 'RESULT', ...result });
    } catch (error) {
      port.postMessage({ type: 'RESULT', ready: false, completed: 0, total: 0, bytes: 0, error: error.message });
    }
  };
  // Serialize removal and downloads. A remove cannot be undone by an in-flight download.
  const operation = mutation.then(run);
  mutation = operation.catch(() => {});
  event.waitUntil(operation);
});
