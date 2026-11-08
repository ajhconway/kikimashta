import { savedAttempts } from './saved-attempts';
import { expect, test } from './fixtures';

test('remembers learning language and independent pack choices across reloads', async ({ page }, testInfo) => {
  await page.goto('./');
  const language = page.getByRole('combobox', { name: 'Learning language' });
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await page.getByRole('link', { name: /Card library/ }).click();
  const jaPack = page.getByRole('checkbox', { name: 'WaniKani level 1 · Pictures', exact: true });
  await jaPack.uncheck();
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await language.selectOption('es-419');
  await expect(language).toBeFocused();
  const control = await language.boundingBox();
  expect(control!.height).toBeGreaterThanOrEqual(44);
  expect(control!.x + control!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: `test-results/language-selector-${testInfo.project.name}.png` });
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Card library' })).toHaveAttribute('href', /language=es-419/);
  await page.getByRole('link', { name: /Card library/ }).click();
  const esPack = page.getByRole('checkbox', { name: 'Travel level 1 · Pictures', exact: true });
  await expect(page.getByRole('checkbox', { name: /Writing/ })).toHaveCount(0);
  await esPack.uncheck();
  await expect(page.getByRole('checkbox', { name: /WaniKani/ })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Practice voices', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await expect(page.getByRole('button', { name: /^start/i })).toBeDisabled();
  await page.reload();
  await expect(language).toHaveValue('es-419');
  await page.getByRole('link', { name: /Card library/ }).click();
  await expect(esPack).not.toBeChecked();
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await language.selectOption('ja-JP');
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await page.getByRole('link', { name: /Card library/ }).click();
  await expect(jaPack).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Travel/ })).toHaveCount(0);
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await expect(page.getByRole('link', { name: 'Card library' })).toBeVisible();
});

import spanish from '../content/es-419.json' with { type: 'json' };

test('Spanish picture lessons play, save and stay isolated after reload', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.setItem('kikimashta-learning-language-v1', 'es-419');
    localStorage.setItem('kikimashta-card-packs-v1:es-419', JSON.stringify(['es-419-travel-1-pictures']));
  });
  await page.reload();
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson' }).click();
  for (let i = 0; i < 6; i++) {
    await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
    await page.getByRole('button', { name: i === 5 ? /mini-quiz/i : /next card/i }).click();
  }
  for (let i = 0; i < 6; i++) {
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(i));
    await expect(page.getByRole('button', { name: /choose (picture|writing)/i }).first()).toBeEnabled();
    const source = await page.locator('audio').getAttribute('src');
    const target = spanish.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
    expect(target).toBeTruthy();
    await page.getByRole('button', { name: /choose picture/i }).filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
  }
  await expect(page.getByRole('heading', { name: 'Nice round!' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.reload();
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(6);
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('ja-JP');
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  expect(await savedAttempts(page, 'ja-JP')).toEqual([]);
  await expect(page.getByRole('button', { name: 'Start · 0 reviews', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(6);
});
