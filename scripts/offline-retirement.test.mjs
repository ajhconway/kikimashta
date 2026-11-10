import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/offline-demo/offline-worker.js', import.meta.url), 'utf8');
function setup({ scope = 'https://example.test/offline-demo/', storageFails = false } = {}) {
  const listeners = {}, deleted = [], navigated = [];
  let skipped = false, unregistered = false;
  const names = ['kikimashta-offline-/offline-demo/-v1', 'kikimashta-offline-/offline-demo/-v2',
    'kikimashta-offline-/-production', 'other-app', 'kikimashta-offline-/offline-demo-other/-v1'];
  const self = {
    registration: { scope, async unregister() { unregistered = true; } },
    async skipWaiting() { skipped = true; },
    addEventListener(type, callback) { listeners[type] = callback; },
    clients: { async matchAll(options) {
      assert.equal(options.type, 'window'); assert.equal(options.includeUncontrolled, true);
      return ['https://example.test/offline-demo/', 'https://example.test/offline-demo/vocabulary/',
        'https://example.test/', 'https://example.test/offline-demo-other/', 'https://other.test/offline-demo/'].map(url => ({ url,
        async navigate(target) { navigated.push({ url, target }); } }));
    } },
  };
  const caches = { async keys() { if (storageFails) throw new Error('Storage unavailable'); return names; },
    async delete(name) { deleted.push(name); } };
  vm.runInNewContext(source, { self, caches, URL });
  async function event(type) { let pending; listeners[type]({ waitUntil(value) { pending = value; } }); await pending; }
  return { event, listeners, deleted, navigated, state: () => ({ skipped, unregistered }) };
}

test('retirement replaces existing preview caches and redirects only preview windows, preserving root data', async () => {
  const worker = setup();
  await worker.event('install'); assert.equal(worker.state().skipped, true);
  await worker.event('activate'); assert.equal(worker.state().unregistered, true);
  assert.deepEqual(worker.deleted, ['kikimashta-offline-/offline-demo/-v1', 'kikimashta-offline-/offline-demo/-v2']);
  assert.deepEqual(worker.navigated, [
    { url: 'https://example.test/offline-demo/', target: 'https://example.test/' },
    { url: 'https://example.test/offline-demo/vocabulary/', target: 'https://example.test/' },
  ]);
  assert.equal(worker.listeners.fetch, undefined);
});

test('retirement still unregisters and redirects if cache storage is unavailable', async () => {
  const worker = setup({ storageFails: true }); await worker.event('activate');
  assert.equal(worker.state().unregistered, true); assert.equal(worker.navigated.length, 2);
});

test('retirement cannot replace the production root worker', () => {
  assert.throws(() => setup({ scope: 'https://example.test/' }), /Unexpected retirement scope/);
});
