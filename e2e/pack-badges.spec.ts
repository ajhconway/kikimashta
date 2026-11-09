import { expect, test, type Page } from './fixtures';
import { badgeArtwork } from '../src/core/badge-art';
import { badgeHistory } from '../src/test/pack-badge-history';
import catalogue from '../content/catalog/ja.json' with { type: 'json' };
import pool from '../content/practice-pool.json' with { type: 'json' };
import starter from '../content/ja.json' with { type: 'json' };
import wordPolicy from '../content/contextual/pack-1/practice-policy.json' with { type: 'json' };
import type { PracticeAttempt, PracticeCard, WordExercise, WordItem } from '../src/types';
const packPreferenceKey = 'kikimashta-card-packs-v1';
const pack = { id: 'ja-wanikani-1-pictures', title: 'WaniKani level 1 · Pictures' };
const poolIds = new Set([...pool.itemIds, ...starter.items.map(item => item.id)]);
const writingOnlyIds = new Set(wordPolicy.writingOnlyItemIds);
function packCards(level: number, exercise: WordExercise): PracticeCard[] {
  return catalogue.items.filter(item => item.sourceLevel === level &&
    (poolIds.has(item.id) || exercise === 'audio-text' && writingOnlyIds.has(item.id)) &&
    (exercise === 'audio-text' || !writingOnlyIds.has(item.id)))
    .map(item => ({ exercise, item: { ...item, label: item.meaning, theme: 'vocabulary' } as WordItem }));
}
const cards = packCards(1, 'audio-picture');
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
  const alignment = await badge.locator('.badge-wk').evaluate(element => {
    const box = (element as SVGGraphicsElement).getBBox();
    return { x: Number(element.getAttribute('x')), y: Number(element.getAttribute('y')),
      inkX: box.x + box.width / 2, inkY: box.y + box.height / 2 };
  });
  const faceCenter = badgeArtwork.Familiar.center;
  // Slot placement is exact; glyph ink bounds vary across the supported rounded font fallbacks.
  expect(alignment.x).toBe(faceCenter.x);
  expect(alignment.y).toBe(faceCenter.y);
  await expect(badge.locator('.badge-wk')).toHaveAttribute('text-anchor', 'middle');
  expect(Math.abs(alignment.inkX - faceCenter.x)).toBeLessThan(2);
  expect(Math.abs(alignment.inkY - faceCenter.y)).toBeLessThan(3);
  const ribbon = await badge.locator('.badge-number').evaluate(element => {
    const box = (element as SVGGraphicsElement).getBBox();
    return { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height };
  });
  expect(ribbon.left).toBeGreaterThanOrEqual(12);
  expect(ribbon.right).toBeLessThanOrEqual(88);
  // Allow half a viewBox unit for font metrics at the ribbon’s y=60 upper edge.
  expect(ribbon.top).toBeGreaterThanOrEqual(59.5);
  expect(ribbon.bottom).toBeLessThanOrEqual(90);
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


test('ten upright static medals follow a circle around Kiku on a narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(key => localStorage.setItem(key, '[]'), packPreferenceKey);
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeDisabled();
  const attempts = [];
  for (const level of [1, 2, 3, 4, 5]) for (const format of ['pictures', 'writing'] as const) {
    // Include the writing-only cards that have separate approval in the contextual pack policy.
    const exercise = format === 'pictures' ? 'audio-picture' : 'audio-text';
    attempts.push(...await badgeHistory(packCards(level, exercise), `ja-wanikani-${level}-${format}`));
  }
  await page.evaluate(async history => {
    const request = indexedDB.open('kikimashta-v0', 1);
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('attempts', 'readwrite');
        for (const attempt of history) tx.objectStore('attempts').put(attempt);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      }; request.onerror = () => reject(request.error);
    });
  }, attempts);
  await page.reload();
  const medals = page.locator('.home-kiku-stage .pack-badge');
  await expect(medals).toHaveCount(10);
  await expect(medals.first()).toHaveCSS('animation-name', 'none');
  const kiku = (await page.locator('.home-intensity .pace-kiku').boundingBox())!;
  const start = (await page.getByRole('button', { name: /^Start/ }).boundingBox())!;
  const boxes = await medals.evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
  }));
  const stage = (await page.locator('.home-kiku-stage').boundingBox())!;
  const center = { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 };
  const centers = boxes.map(box => ({ x: (box.x + box.right) / 2, y: (box.y + box.bottom) / 2 }));
  expect(centers[0]!.x).toBeLessThan(center.x);
  expect(centers[1]!.x).toBeGreaterThan(center.x);
  expect(centers[0]!.y).toBeLessThan(center.y);
  for (let index = 0; index < centers.length; index += 2) {
    expect(centers[index]!.x + centers[index + 1]!.x).toBeCloseTo(2 * center.x, 0);
    expect(centers[index]!.y).toBeCloseTo(centers[index + 1]!.y, 0);
  }
  const radii = centers.map(point => Math.hypot(point.x - center.x, point.y - center.y));
  expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1);
  await expect(medals.first()).toHaveCSS('transform', /^matrix\(1, 0, 0, 1,/);
  for (const [index, box] of boxes.entries()) {
    expect(box.right <= kiku.x || box.x >= kiku.x + kiku.width || box.bottom <= kiku.y || box.y >= kiku.y + kiku.height).toBe(true);
    expect(box.bottom).toBeLessThan(start.y);
    for (const other of boxes.slice(index + 1)) {
      expect(box.right <= other.x || box.x >= other.right || box.bottom <= other.y || box.y >= other.bottom, JSON.stringify({ index, box, other })).toBe(true);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await medals.first().focus();
  await expect(medals.first()).toHaveAccessibleName(/WaniKani level 1.*Familiar minimum mastery/);
  expect(await medals.first().evaluate(element => element === document.activeElement)).toBe(true);
  await medals.first().evaluate(element => (element as HTMLElement).blur());
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(medals.first()).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: `test-results/pack-badges-circle-${testInfo.project.name}.png`, fullPage: true });
});


async function putBadgeHistory(page: Page, attempts: PracticeAttempt[]) {
  await page.evaluate(async history => {
    const request = indexedDB.open('kikimashta-v0', 1);
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result, transaction = db.transaction('attempts', 'readwrite');
        for (const attempt of history) transaction.objectStore('attempts').put(attempt);
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, attempts);
}

test('saved badge changes celebrate on Home return before reordering and respect reduced motion', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '[]'), packPreferenceKey);
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeDisabled();
  const firstId = 'ja-wanikani-1-pictures', secondId = 'ja-wanikani-2-pictures';
  const first = await badgeHistory(packCards(1, 'audio-picture'), firstId, 3);
  const second = await badgeHistory(packCards(2, 'audio-picture'), secondId, 4);
  await putBadgeHistory(page, [...first, ...second]);
  await page.reload();
  const region = page.getByRole('region', { name: 'Pack mastery badges' });
  await expect(region).toHaveAttribute('data-phase', 'idle');
  await expect(region.getByRole('listitem')).toHaveCount(2);
  await expect(region.getByRole('listitem').first()).toHaveAttribute('data-pack-id', secondId);
  await expect(page.locator('.badge-fireworks')).toHaveCount(0);
  const firstBadge = page.locator(`[data-pack-id="${firstId}"]`);
  const oldSlot = await firstBadge.getAttribute('style');
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  await expect(region).toHaveCount(0);
  const upgraded = await badgeHistory(packCards(1, 'audio-picture'), firstId, 7);
  await putBadgeHistory(page, upgraded);
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await expect(region).toHaveAttribute('data-phase', 'celebrate');
  const replacement = await firstBadge.evaluate(element => ({
    slot: element.getAttribute('style'), kind: element.getAttribute('data-celebration'),
    previous: element.querySelector('.badge-previous-art .pack-badge-medal')?.getAttribute('data-rank'),
    current: element.querySelector('.badge-current-art .pack-badge-medal')?.getAttribute('data-rank'),
    sparks: element.querySelectorAll('.badge-fireworks i').length,
  }));
  expect(replacement).toMatchObject({ slot: oldSlot, kind: 'upgrade', previous: 'Familiar', current: 'Mastered', sparks: 12 });
  await page.waitForFunction(() => document.querySelector('.pack-badges')?.getAttribute('data-phase') === 'reorder');
  await expect(region.getByRole('listitem').first()).toHaveAttribute('data-pack-id', firstId);
  expect(await firstBadge.getAttribute('style')).not.toBe(oldSlot);
  await expect(firstBadge).toHaveCSS('transition-property', 'left, top');
  await expect(region).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('.badge-previous-art, .badge-fireworks')).toHaveCount(0);

  const third = await badgeHistory(packCards(3, 'audio-picture'), 'ja-wanikani-3-pictures', 3);
  await putBadgeHistory(page, third);
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await expect(page.locator('[data-celebration="award"]')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('[data-celebration="award"] .badge-current-art')).toHaveCSS('animation-name', 'none');
  await expect(region).toHaveAttribute('data-phase', 'idle');
  await expect(region.getByRole('listitem')).toHaveCount(3);
  await expect(region.getByRole('listitem').first()).toHaveCSS('transition-property', 'none');
  const expectedIds = new Set([...first, ...second, ...upgraded, ...third].map(attempt => attempt.id));
  expect(new Set((await savedAttempts(page)).map(attempt => attempt.id))).toEqual(expectedIds);
  await page.reload();
  await expect(region).toHaveAttribute('data-phase', 'idle');
  await expect(region.getByRole('listitem')).toHaveCount(3);
  await expect(page.locator('.badge-fireworks')).toHaveCount(0);
});
