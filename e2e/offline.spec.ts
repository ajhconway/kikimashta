import { prepareOffline, disableOffline } from './offline-settings';
import { expect, test } from './fixtures';
import { savedAttempts } from './saved-attempts';
import { leaveNewCards } from './lesson-fixture';
import spanish from '../content/es-419.json' with { type: 'json' };

test('downloaded packs play and save a complete lesson after an offline reload', async ({ page, context }) => {
  test.setTimeout(60000);
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.setItem('kikimashta-learning-language-v1', 'es-419');
    localStorage.setItem('kikimashta-practice-voices-v1:es-419', JSON.stringify(['juan']));
    localStorage.setItem('kikimashta-card-packs-v1:es-419', JSON.stringify(['es-419-travel-1-pictures']));
  });
  const baseline = await leaveNewCards(page, 'es-419', spanish.items, ['audio-picture'], [{ itemId: spanish.items[0]!.id, exercise: 'audio-picture' }]);
  await page.reload();
  await prepareOffline(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
  await page.getByRole('button', { name: /mini-quiz/i }).click();
  const source = await page.locator('audio').getAttribute('src');
  const target = spanish.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  expect(target).toBeDefined();
  const choices = page.getByRole('button', { name: /choose picture/i });
  await expect(choices).toHaveCount(4);
  expect(await choices.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  await choices.filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(baseline + 1);
  await page.reload();
  const saved = await savedAttempts(page, 'es-419');
  expect(saved).toHaveLength(baseline + 1);
  expect(saved.every(attempt => attempt.correct)).toBe(true);
  // Library navigation is another HTML entry point and must also work offline.
  await page.getByRole('link', { name: /Card library/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Travel level 1 · Pictures', exact: true })).toBeChecked();
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await context.setOffline(false);
  await page.reload();
  expect(await savedAttempts(page, 'es-419')).toEqual(saved);
  await disableOffline(page);
  await expect.poll(() => page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('kikimashta-offline-'));
    const counts = await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).length));
    return counts.reduce((sum, count) => sum + count, 0);
  })).toBe(0);
  expect(await savedAttempts(page, 'es-419')).toEqual(saved);
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /^start/i })).toBeDisabled();
  await context.setOffline(false);
});
