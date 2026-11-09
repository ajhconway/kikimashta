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
  await expect(page.getByRole('button', { name: 'Start · 3 reviews', exact: true })).toBeEnabled();
  await expect(forecast).not.toContainText('Current cards · daily practice');
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
  await expect(page.getByRole('button', { name: 'Start · 1 review', exact: true })).toBeEnabled();
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


test.describe('forecast dates across daylight-saving changes (#156)', () => {
  test.use({ timezoneId: 'America/New_York' });
  for (const { transition, at, month, firstDay, dueAt, nextDayReviews } of [
    { transition: 'spring forward', at: '2026-03-08T00:30:00-05:00', month: 'March', firstDay: 8, dueAt: '2026-03-09T01:00:00-04:00', nextDayReviews: '0' },
    { transition: 'fall back', at: '2026-11-01T00:30:00-04:00', month: 'November', firstDay: 1, dueAt: '2026-11-02T00:00:00-05:00', nextDayReviews: '1' },
  ]) {
    test(`shows seven consecutive local dates at ${transition}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(at));
      await page.goto('./');
      const future: PracticeAttempt = {
        id: 'dst-future-history', sessionId: 'dst-seed', itemId: 'ja-dog', language: 'ja-JP',
        choiceIds: ['ja-dog'], selectedId: 'ja-dog', correct: true,
        startedAt: new Date(dueAt).getTime(), answeredAt: new Date(dueAt).getTime(), responseMs: 0,
      };
      await expect(page.getByRole('button', { name: 'Start · 0 reviews', exact: true })).toBeEnabled();
      await stored(page, [future]);
      await page.reload();
      const rows = page.getByRole('region', { name: 'Review forecast' }).getByRole('listitem');
      await expect(rows).toHaveCount(7);
      await expect(rows.locator('time')).toHaveText(['Today', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      for (let day = 0; day < 7; day++) {
        await expect(rows.nth(day)).toHaveAccessibleName(new RegExp(`^${day === 0 ? 'Today, ' : ''}${weekdays[day]}, ${month} ${firstDay + day}: `));
      }
      await expect(rows.nth(0).locator('.review-forecast-count')).toHaveText('0');
      await expect(rows.nth(1).locator('.review-forecast-count')).toHaveText(nextDayReviews);
      if (transition === 'spring forward') await expect(rows.nth(2).locator('.review-forecast-count')).toHaveText('1');
      expect(await stored(page)).toEqual([future]);
      expect(await rows.locator('time').evaluateAll(elements => elements.map(element => {
        const date = new Date(element.getAttribute('datetime')!);
        return [date.getDate(), date.getHours(), date.getMinutes()];
      }))).toEqual(Array.from({ length: 7 }, (_, day) => [firstDay + day, 0, 30]));
    });
  }
});
