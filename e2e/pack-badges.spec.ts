import { expect, test } from './fixtures';
import { badgeHistory } from '../src/test/pack-badge-history';
import catalogue from '../content/catalog/ja.json' with { type: 'json' };
import pool from '../content/practice-pool.json' with { type: 'json' };
import starter from '../content/ja.json' with { type: 'json' };
import type { PracticeCard, WordItem } from '../src/types';
const packPreferenceKey = 'kikimashta-card-packs-v1';
const pack = { id: 'ja-wanikani-1-pictures', title: 'WaniKani level 1 · Pictures' };
const cards: PracticeCard[] = catalogue.items.filter(item => item.sourceLevel === 1 && [...pool.itemIds, ...starter.items.map(item => item.id)].includes(item.id))
  .map(item => ({ exercise: 'audio-picture', item: { ...item, label: item.meaning, theme: 'vocabulary' } as WordItem }));
import { savedAttempts } from './saved-attempts';

test('Home pack badges survive reload, remain visible for deselected packs and follow current mastery', async ({ page }, testInfo) => {
  await page.addInitScript(key => localStorage.setItem(key, '[]'), packPreferenceKey);
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeDisabled();
  const history = await badgeHistory(cards, pack.id);
  await page.evaluate(async attempts => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('attempts', 'readwrite');
        for (const attempt of attempts) tx.objectStore('attempts').put(attempt);
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, history);
  await page.reload();
  const badges = page.getByRole('region', { name: 'Pack mastery badges' });
  const badge = page.getByRole('listitem', { name: `${pack.title}: Familiar minimum mastery` });
  await expect(badge).toBeVisible();
  await expect(badges.getByRole('listitem')).toHaveCount(1);
  await page.screenshot({ path: `test-results/pack-badges-${testInfo.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  await expect(badges).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('ja-JP');
  await expect(badge).toBeVisible();
  await page.reload();
  await expect(badge).toBeVisible();
  const original = await savedAttempts(page);
  const last = [...history].reverse().find(attempt => attempt.itemId === history[0]!.itemId)!;
  await page.evaluate(async attempt => {
    const request = indexedDB.open('kikimashta-v0', 1);
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('attempts', 'readwrite');
        tx.objectStore('attempts').put(attempt);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      }; request.onerror = () => reject(request.error);
    });
  }, { ...last, id: 'badge-browser-lapse', correct: false, answeredAt: Date.parse('2026-11-01'), context: { ...last.context!, phase: 'review' } });
  await page.reload();
  await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible();
  await expect(badges).toHaveCount(0);
  expect(await savedAttempts(page)).toHaveLength(original.length + 1);
});
