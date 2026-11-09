import { expect, test } from './fixtures';
import { savedAttempts } from './saved-attempts';
import spanish from '../content/es-419.json' with { type: 'json' };

test('subpath demo keeps root data and caches intact through an offline lesson', async ({ page, context }) => {
  test.skip(process.env.VITE_STORAGE_NAMESPACE !== 'offline-demo', 'Requires the isolated /offline-demo/ production build.');
  test.setTimeout(180000);
  await page.goto('../');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/root-fixture-worker.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.evaluate(async () => {
    localStorage.setItem('kikimashta-learning-language-v1', 'ja-JP');
    localStorage.setItem('kikimashta-scope:offline-demo:kikimashta-learning-language-v1', 'es-419');
    localStorage.setItem('kikimashta-scope:offline-demo:kikimashta-card-packs-v1:es-419', JSON.stringify(['es-419-travel-1-pictures']));
    localStorage.setItem('sb-root-auth-token', 'root-session-sentinel');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onupgradeneeded = () => { const store = request.result.createObjectStore('attempts', { keyPath: 'id' }); store.createIndex('language', 'language'); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('attempts', 'readwrite');
    tx.objectStore('attempts').put({ id: 'root-progress-sentinel', language: 'ja-JP' });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  });
  const rootPage = await context.newPage();
  await rootPage.goto('../');
  await expect.poll(() => rootPage.evaluate(async () => (await (await caches.open('kikimashta-offline-/-production-test')).match('/production-marker'))?.text())).toBe('root-cache-preserved');
  await page.goto('./');
  const outside: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === new URL(page.url()).origin && !url.pathname.startsWith('/offline-demo/')) outside.push(url.pathname);
  });
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Learning language' })).toHaveValue('es-419');
  await page.getByText('Offline practice', { exact: true }).click();
  await page.getByRole('button', { name: 'Download selected packs', exact: true }).click();
  await expect(page.getByText('Selected packs are downloaded for offline practice.')).toBeVisible({ timeout: 120000 });
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/offline-demo/'))?.scope)).toMatch(/\/offline-demo\/$/);
  await context.setOffline(true); await page.reload();
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
  for (let i = 0; i < 10; i++) {
    await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(2);
    const next = page.getByRole('button', { name: /next card/i });
    if (!await next.count()) break;
    await next.click();
  }
  await page.getByRole('button', { name: /mini-quiz/i }).click();
  const database = 'kikimashta-scope:offline-demo:kikimashta-v0';
  for (let i = 0; i < 10; i++) {
    const src = await page.locator('audio').getAttribute('src');
    const target = spanish.items.find(item => item.audio.some(audio => src?.endsWith(audio.src)))!;
    const choices = page.getByRole('button', { name: /choose picture/i });
    await expect(choices).toHaveCount(4);
    await choices.filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
    await expect.poll(async () => (await savedAttempts(page, 'es-419', database)).length).toBe(i + 1);
    if (i < 9) await expect(choices.first()).toBeEnabled();
  }
  await page.reload();
  expect(await savedAttempts(page, 'es-419', database)).toHaveLength(10);
  await page.getByRole('link', { name: /Card library/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Travel level 1 · Pictures', exact: true })).toBeChecked();
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await page.getByText(/Offline practice/).click();
  expect(await rootPage.evaluate(async () => (await (await caches.open('kikimashta-offline-/-production-test')).match('/production-marker'))?.text())).toBe('root-cache-preserved');
  await page.getByRole('button', { name: 'Remove all downloads' }).click();
  await expect(page.getByText('Download selected packs before going offline.')).toBeVisible();
  expect(await rootPage.evaluate(async () => (await (await caches.open('kikimashta-offline-/-production-test')).match('/production-marker'))?.text())).toBe('root-cache-preserved');
  expect(await page.evaluate(() => localStorage.getItem('kikimashta-learning-language-v1'))).toBe('ja-JP');
  expect(await page.evaluate(() => localStorage.getItem('sb-root-auth-token'))).toBe('root-session-sentinel');
  expect(await savedAttempts(page, 'ja-JP')).toEqual([{ id: 'root-progress-sentinel', language: 'ja-JP' }]);
  expect(outside).toEqual([]);
  await context.setOffline(false);
  await rootPage.close();
});
