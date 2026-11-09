import { expect, test } from './fixtures';
import { savedAttempts } from './saved-attempts';
import spanish from '../content/es-419.json' with { type: 'json' };

test('downloaded packs play and save a complete lesson after an offline reload', async ({ page, context }) => {
  test.setTimeout(180000);
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.setItem('kikimashta-learning-language-v1', 'es-419');
    localStorage.setItem('kikimashta-card-packs-v1:es-419', JSON.stringify(['es-419-travel-1-pictures']));
  });
  await page.reload();
  await page.getByText('Offline practice', { exact: true }).click();
  await page.getByRole('button', { name: 'Download selected packs', exact: true }).click();
  await expect(page.getByText('Selected packs are downloaded for offline practice.')).toBeVisible({ timeout: 120000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
  for (let turn = 0; turn < 10; turn++) {
    await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(2);
    const next = page.getByRole('button', { name: /next card/i });
    if (!await next.count()) break;
    await next.click();
  }
  await page.getByRole('button', { name: /mini-quiz/i }).click();
  for (let turn = 0; turn < 10; turn++) {
    const source = await page.locator('audio').getAttribute('src');
    const target = spanish.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
    expect(target).toBeDefined();
    const choices = page.getByRole('button', { name: /choose picture/i });
    await expect(choices).toHaveCount(4);
    expect(await choices.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(2);
    await choices.filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
    await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(turn + 1);
    if (turn < 9) await expect(choices.first()).toBeEnabled();
  }
  await page.reload();
  const saved = await savedAttempts(page, 'es-419');
  expect(saved).toHaveLength(10);
  expect(saved.every(attempt => attempt.correct)).toBe(true);
  // Library navigation is another HTML entry point and must also work offline.
  await page.getByRole('link', { name: /Card library/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Travel level 1 · Pictures', exact: true })).toBeChecked();
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await context.setOffline(false);
  await page.reload();
  expect(await savedAttempts(page, 'es-419')).toEqual(saved);
  await page.getByText(/Offline practice/).click();
  await page.getByRole('button', { name: 'Remove all downloads' }).click();
  await expect(page.getByText('Download selected packs before going offline.')).toBeVisible();
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
