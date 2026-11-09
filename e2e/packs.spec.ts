import { savedAttempts } from './saved-attempts';
import { expect, test } from '@playwright/test';

const packPreferenceKey = 'kikimashta-card-packs-v1';
const pack = { id: 'ja-wanikani-2-writing', title: 'WaniKani level 2 · Writing' };

test('retired starter selections disappear while their saved history survives reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await page.getByRole('link', { name: 'Card library · 10 packs selected' }).click();
  await expect(page.getByRole('group', { name: 'Practice packs', exact: true }).getByRole('checkbox')).toHaveCount(10);
  await expect(page.getByRole('checkbox', { name: /Starter words/ })).toHaveCount(0);
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await page.evaluate(async ({ key, packId }) => {
    localStorage.setItem(key, JSON.stringify(['ja-starter-pictures', packId, 'ja-starter-writing']));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('attempts', 'readwrite');
      for (const itemId of ['ja-cat', 'ja-banana', 'ja-umbrella', 'ja-cup']) {
        tx.objectStore('attempts').put({
          id: 'retired-' + itemId, sessionId: 'legacy', itemId, language: 'ja-JP',
          choiceIds: [itemId], selectedId: itemId, correct: true,
          startedAt: 1000, answeredAt: 2000, responseMs: 1000,
        });
      }
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    } finally { db.close(); }
  }, { key: packPreferenceKey, packId: pack.id });
  await page.reload();
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(4);
  await page.getByRole('link', { name: 'Card library · 1 pack selected' }).click();
  await expect(page.getByRole('group', { name: 'Practice packs', exact: true }).getByRole('checkbox', { checked: true })).toHaveAccessibleName(pack.title);
  await expect(page.getByRole('group', { name: 'Practice packs', exact: true }).getByRole('checkbox')).toHaveCount(10);
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await page.getByRole('button', { name: /^start/i }).click();
  await expect(page.getByRole('button', { name: 'Begin review', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Begin lesson', exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(4);
  await expect(page.getByRole('link', { name: 'Card library · 1 pack selected' })).toBeVisible();
});
