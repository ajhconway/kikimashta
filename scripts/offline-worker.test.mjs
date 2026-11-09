import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';

const template = readFileSync(new URL('./offline-worker.mjs', import.meta.url), 'utf8');
const origin = 'https://example.test/game/';
function setup() {
  const bodies = { 'index.html': '<html>app</html>', 'vocabulary/index.html': '<html>library</html>', 'audio/a.mp3': '0123456789', 'assets/app.js': 'app();' };
  const manifest = { version: 'v1', shell: ['index.html', 'vocabulary/index.html', 'assets/app.js'],
    hashes: Object.fromEntries(Object.entries(bodies).map(([path, body]) => [path, createHash('sha256').update(body).digest('hex')])),
    sizes: Object.fromEntries(Object.entries(bodies).map(([path, body]) => [path, Buffer.byteLength(body)])) };
  const listeners = {};
  const stores = new Map();
  const requests = [];
  let offline = false;
  let fail = '';
  const cacheStorage = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return { async match(url) { return store.get(url)?.clone(); }, async put(url, response) { store.set(url, response.clone()); } };
    },
    async delete(name) { return stores.delete(name); },
    async keys() { return [...stores.keys()]; },
  };
  const fetcher = async request => {
    requests.push(request.url);
    if (offline || request.url.endsWith(fail) && fail) throw new Error('Offline');
    const body = bodies[request.url.slice(origin.length)];
    return new Response(body ?? 'missing', { status: body === undefined ? 404 : 200 });
  };
  const context = { self: { registration: { scope: origin }, addEventListener(type, listener) { listeners[type] = listener; } },
    caches: cacheStorage, crypto: webcrypto, Headers, Response, Request, URL, fetch: fetcher };
  vm.runInNewContext(template.replace('__OFFLINE_MANIFEST__', JSON.stringify(manifest)), context);
  async function message(type, urls = ['audio/a.mp3'], version = 'v1') {
    const replies = [];
    let operation;
    listeners.message({ data: { type, urls, version }, ports: [{ postMessage(value) { replies.push(value); } }], waitUntil(value) { operation = value; } });
    await operation;
    return replies;
  }
  async function fetchRequest(path, options = {}) {
    let response;
    const request = options.navigate ? { url: origin + path, method: 'GET', mode: 'navigate', headers: new Headers() } : new Request(origin + path, options);
    listeners.fetch({ request, respondWith(value) { response = value; } });
    return response;
  }
  return { manifest, bodies, requests, stores, message, fetchRequest, setOffline(value) { offline = value; }, setFailure(path) { fail = path; } };
}

test('explicit download reports complete readiness, serves offline navigation and media ranges', async () => {
  const app = setup();
  assert.equal((await app.message('STATUS')).at(-1).ready, false);
  const replies = await app.message('DOWNLOAD');
  assert.equal(replies.filter(reply => reply.type === 'PROGRESS').length, 4);
  assert.equal(replies.at(-1).ready, true);
  app.setOffline(true);
  assert.equal(await (await app.fetchRequest('?language=ja', { navigate: true })).text(), '<html>app</html>');
  assert.equal(await (await app.fetchRequest('vocabulary/?view=contextual', { navigate: true })).text(), '<html>library</html>');
  const partial = await app.fetchRequest('audio/a.mp3', { headers: { Range: 'bytes=2-5' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('Content-Range'), 'bytes 2-5/10');
  assert.equal(await partial.text(), '2345');
  assert.equal(await (await app.fetchRequest('audio/a.mp3', { headers: { Range: 'bytes=-3' } })).text(), '789');
  assert.equal((await app.fetchRequest('audio/a.mp3', { headers: { Range: 'bytes=10-' } })).status, 416);
  assert.equal(app.requests.length, 4);
});

test('an interrupted download stays unready, resumes, and eviction is detected', async () => {
  const app = setup();
  app.setFailure('audio/a.mp3');
  assert.match((await app.message('DOWNLOAD')).at(-1).error, /Offline/);
  assert.equal((await app.message('STATUS')).at(-1).ready, false);
  app.setFailure('');
  assert.equal((await app.message('DOWNLOAD')).at(-1).ready, true);
  assert.equal(app.requests.filter(url => url.endsWith('index.html')).length, 2);
  const cache = [...app.stores.values()][0];
  cache.delete(origin + 'assets/app.js');
  assert.equal((await app.message('STATUS')).at(-1).ready, false);
});

test('changed deployment bytes are rejected rather than mixed with the loaded version', async () => {
  const app = setup();
  app.bodies['audio/a.mp3'] = 'new release';
  const result = (await app.message('DOWNLOAD')).at(-1);
  assert.equal(result.ready, false);
  assert.match(result.error, /updated/);
  assert.equal((await app.message('STATUS')).at(-1).ready, false);
});

test('version mismatches, unknown URLs and account requests cannot enter the cache', async () => {
  const app = setup();
  assert.match((await app.message('DOWNLOAD', [], 'old')).at(-1).error, /updated/);
  assert.match((await app.message('DOWNLOAD', ['https://evil.test/audio.mp3'])).at(-1).error, /unavailable/);
  assert.equal(await app.fetchRequest('auth/v1/token'), undefined);
  assert.equal(app.requests.length, 0);
});

test('removal clears only app downloads and is ordered after an in-flight download', async () => {
  const app = setup();
  app.stores.set('another-app', new Map([['x', 'preserved']]));
  const preparing = app.message('DOWNLOAD');
  const removing = app.message('REMOVE');
  assert.equal((await preparing).at(-1).ready, true);
  assert.equal((await removing).at(-1).ready, false);
  assert.equal((await app.message('STATUS')).at(-1).ready, false);
  assert.equal(app.stores.get('another-app').get('x'), 'preserved');
});
