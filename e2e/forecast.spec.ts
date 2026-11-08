import { expect, test, type Page } from './fixtures';
import type { PracticeAttempt } from '../src/types';
import { schedulerVersion } from '../src/core/scheduler';

const at = Date.UTC(2026, 10, 9, 17);
const baseline: PracticeAttempt[] = [
  ['ja-dog', 'ja-JP', 'audio-picture'], ['ja-dog', 'ja-JP', 'audio-text'],
  ['ja-apple', 'ja-JP', 'audio-picture'], ['es-419-travel-water', 'es-419', 'audio-picture'],
].map(([itemId, language, exercise], index) => ({
  id: `forecast-history-${index}`, sessionId: 'forecast-seed', itemId: itemId!, language: language!,
  choiceIds: [itemId!], selectedId: itemId!, correct: true,
  startedAt: at - 86_400_000 - 1000, answeredAt: at - 86_400_000, responseMs: 1000,
  context: { phase: 'lesson', exercise: exercise as 'audio-picture' | 'audio-text', recordingSrc: 'seed.mp3', replays: 0, schedulerVersion },
}));

async function stored(page: Page, incoming?: PracticeAttempt[]) {
  return page.evaluate(async incoming => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      if (incoming) await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('attempts', 'readwrite');
        incoming.forEach(attempt => tx.objectStore('attempts').put(attempt));
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
      return await new Promise<PracticeAttempt[]>((resolve, reject) => {
        const request = db.transaction('attempts').objectStore('attempts').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, incoming);
}

test('Home forecast persists, follows language/pack scope and refreshes after practice in another tab', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(at);
  await page.goto('./');
  const forecast = page.getByRole('region', { name: 'Review forecast', exact: true });
  const today = forecast.getByRole('listitem').first().locator('.review-forecast-count');
  await expect(today).toHaveText('0');
  await expect(forecast).toContainText('No reviews expected this week.');
  await stored(page, baseline);
  const original = await stored(page);
  await page.reload();
  await expect(forecast.getByRole('listitem')).toHaveCount(7);
  await expect(today).toHaveText('3');
  await expect(forecast).toHaveAccessibleDescription('Current cards · daily practice');
  expect((await forecast.boundingBox())!.height).toBeLessThanOrEqual(145);
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 664 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: /^start/i })).toBeInViewport();
  }
  await page.setViewportSize(testInfo.project.use.isMobile ? { width: 390, height: 664 } : { width: 1280, height: 800 });
  await page.screenshot({ path: `test-results/home-forecast-${testInfo.project.name}.png`, fullPage: true });
  expect(await stored(page)).toEqual(original);

  await page.evaluate(() => localStorage.setItem('kikimashta-card-packs-v1', JSON.stringify(['ja-wanikani-2-writing'])));
  await page.reload();
  await expect(today).toHaveText('1');
  const practice = await page.context().newPage();
  await practice.clock.setFixedTime(at);
  await practice.goto(page.url());
  await practice.getByRole('button', { name: /^start/i }).click();
  await practice.getByRole('button', { name: 'Begin review', exact: true }).click();
  await practice.getByRole('button', { name: 'Choose writing 犬', exact: true }).click();
  await expect.poll(async () => (await stored(practice)).length).toBe(5);
  await practice.close();
  await page.bringToFront();
  // Headless tab activation does not consistently emit a window-focus event.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(today).toHaveText('0');
  await page.reload();
  await expect(today).toHaveText('0');
  const after = await stored(page);
  expect(after.filter(attempt => original.some(saved => saved.id === attempt.id))).toEqual(original);
  expect(after).toHaveLength(5);

  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  await expect(today).toHaveText('1');
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('ja-JP');
  await expect(today).toHaveText('0');
  expect(await stored(page)).toEqual(after);
});
