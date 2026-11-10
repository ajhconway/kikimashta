import { savedAttempts } from './saved-attempts';
import { expect, test } from './fixtures';
import { leaveNewCards } from './lesson-fixture';

import spanish from '../content/es-419.json' with { type: 'json' };

test('Spanish lesson uses its selected voice and saves an isolated answer after reload', async ({ page }) => {
  await page.goto('./vocabulary/?language=es-419&pack=es-419-travel-1-pictures');
  for (const name of ['Travel level 2 · Pictures', 'Travel level 3 · Pictures', 'Travel level 4 · Pictures', 'Basic Spanish level 1 · Pictures + contexts', 'Food level 1 · Pictures', 'Food level 2 · Pictures']) {
    await page.getByRole('checkbox', { name, exact: true }).uncheck();
  }
  const voices = page.getByRole('group', { name: 'Practice voices', exact: true });
  await expect(voices.getByRole('checkbox')).toHaveCount(8);
  await expect(voices.getByRole('checkbox', { name: 'Juan', exact: true })).toHaveAccessibleDescription('Mexico City, Mexico');
  await expect(voices.getByRole('checkbox', { name: 'Carito', exact: true })).toHaveAccessibleDescription('Bogotá, Colombia');
  await expect(voices.getByRole('checkbox', { name: 'Santiago', exact: true })).toHaveAccessibleDescription('Buenos Aires, Argentina');
  await expect(voices.getByRole('checkbox', { name: 'Veronica', exact: true })).toHaveAccessibleDescription('Puerto Rico · Caribbean Spanish');
  for (const checkbox of await voices.getByRole('checkbox').all()) {
    if (await checkbox.getAttribute('value') !== 'juan') await checkbox.uncheck();
  }
  await voices.getByRole('checkbox', { name: 'Juan', exact: true }).click();
  await expect(voices.getByRole('checkbox', { name: 'Juan', exact: true })).toBeChecked();
  await expect(page.getByText('Keep at least one voice selected for practice.')).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('kikimashta-practice-voices-v1', JSON.stringify(['lime']));
    localStorage.setItem('kikimashta-learning-language-v1', 'es-419');
  });
  await page.reload();
  await expect(voices.getByRole('checkbox', { checked: true })).toHaveAccessibleName('Juan');
  const auditions = page.getByRole('group', { name: 'Latin American Spanish voices for Hotel', exact: true });
  await expect(auditions.getByRole('button')).toHaveCount(8);
  await expect(auditions.getByRole('button', { name: 'Juan: Hotel', exact: true })).toHaveAccessibleDescription('Mexico City, Mexico');
  await page.getByRole('link', { name: '← Listening practice' }).click();
  const baseline = await leaveNewCards(page, 'es-419', spanish.items, ['audio-picture'], [{ itemId: spanish.items[0]!.id, exercise: 'audio-picture' }]);
  await page.reload();
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
  await expect(page.locator('audio')).toHaveAttribute('src', /\/juan\//);
  await page.getByRole('button', { name: /mini-quiz/i }).click();
  const source = await page.locator('audio').getAttribute('src');
  expect(source).toContain('/juan/');
  const target = spanish.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  expect(target).toBeDefined();
  const recordingSrc = target.audio.find(clip => source?.endsWith(clip.src))!.src;
  const choices = page.getByRole('button', { name: /choose picture/i });
  await expect(choices).toHaveCount(4);
  const shown = await choices.locator('img').evaluateAll(images => images.map(image => image.getAttribute('alt')));
  expect(shown.every(alt => spanish.items.some(item => item.image.alt === alt))).toBe(true);
  await page.getByRole('button', { name: 'Replay word' }).click();
  await expect(page.locator('audio')).toHaveAttribute('src', source!);
  await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  await choices.filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(baseline + 1);
  await page.reload();
  const saved = await savedAttempts(page, 'es-419');
  const answers = saved.filter(attempt => !attempt.id.startsWith('known-'));
  expect(answers).toHaveLength(1);
  expect(answers[0]).toMatchObject({ itemId: target.id, language: 'es-419', context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc } });
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('ja-JP');
  await expect(page.getByRole('button', { name: 'Start · 0 reviews', exact: true })).toBeEnabled();
  expect(await savedAttempts(page, 'ja-JP')).toEqual([]);
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Learning language' })).toHaveValue('es-419');
  expect(await savedAttempts(page, 'es-419')).toEqual(saved);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kikimashta-practice-voices-v1')!))).toEqual(['lime']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kikimashta-practice-voices-v1:es-419')!))).toEqual(['juan']);
});
