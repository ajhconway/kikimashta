/* global self, caches */
// Retire installed preview copies without touching practice history or the root worker. (#245)
const scope = new URL(self.registration.scope);
if (scope.pathname !== '/offline-demo/') throw new Error('Unexpected retirement scope.');
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  try {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('kikimashta-offline-/offline-demo/-')).map(name => caches.delete(name)));
  } catch { /* Storage failure must not keep the retired worker registered. */ }
  await self.registration.unregister();
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.allSettled(windows.filter(client => {
    const url = new URL(client.url);
    return url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
  }).map(client => client.navigate(new URL('/', scope).href)));
})()));
