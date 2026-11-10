import { expect, test } from './fixtures';
import { badgeHistory } from '../src/test/pack-badge-history';
import catalogue from '../content/catalog/ja.json' with { type: 'json' };
import pool from '../content/practice-pool.json' with { type: 'json' };
import starter from '../content/ja.json' with { type: 'json' };
import type { PracticeAttempt, PracticeCard, WordItem } from '../src/types';
import { savedAttempts } from './saved-attempts';

const packId = 'ja-wanikani-1-pictures';
const eligible = new Set([...pool.itemIds, ...starter.items.map(item => item.id)]);
const cards: PracticeCard[] = catalogue.items.filter(item => item.sourceLevel === 1 && eligible.has(item.id))
  .map(item => ({ item: { ...item, label: item.meaning, theme: 'vocabulary' } as WordItem, exercise: 'audio-picture' }));

// Native SVG, CSS media queries and the Home subscription are the browser boundary.
// Ranking, queue permutations and earned-level rules stay in focused tests.
test('saved pack mastery renders on a narrow Home and upgrades without motion after returning', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('kikimashta-card-packs-v1', '[]'));
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeDisabled();
  const put = async (attempts: PracticeAttempt[]) => page.evaluate(async attempts => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('attempts', { keyPath: 'id' }).createIndex('language', 'language');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('attempts', 'readwrite');
      for (const attempt of attempts) tx.objectStore('attempts').put(attempt);
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    } finally { db.close(); }
  }, attempts);
  const original = await badgeHistory(cards, packId, 3);
  await put(original);
  await page.reload();
  const region = page.getByRole('region', { name: 'Pack mastery badges' });
  const badge = region.getByRole('listitem');
  await expect(badge).toHaveAccessibleName('WaniKani level 1 · Pictures: Familiar minimum mastery');
  await expect(badge.locator('.badge-current-art .pack-badge-medal')).toHaveAttribute('data-rank', 'Familiar');
  await expect(badge).toBeInViewport({ ratio: 1 });
  const bounds = (await badge.boundingBox())!;
  expect(bounds.width).toBeGreaterThan(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  const upgraded = await badgeHistory(cards, packId, 7);
  await put(upgraded);
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await expect(badge).toHaveAccessibleName('WaniKani level 1 · Pictures: Mastered minimum mastery');
  await expect(badge.locator('.badge-current-art')).toHaveCSS('animation-name', 'none');
  await expect(region).toHaveAttribute('data-phase', 'idle');
  await expect(badge).toHaveCSS('transition-property', 'none');
  await page.reload();
  await expect(badge).toHaveAccessibleName('WaniKani level 1 · Pictures: Mastered minimum mastery');
  expect(new Set((await savedAttempts(page)).map(attempt => attempt.id))).toEqual(new Set(upgraded.map(attempt => attempt.id)));
});
