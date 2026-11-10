import travel5 from '../content/es-419-travel-5.json' with { type: 'json' };
import { savedAttempts } from './saved-attempts';
import { expect, test } from './fixtures';

test('Travel5 library, native audio and saved lessons stay scoped to its36 words after reload', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.5;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      (window as unknown as { travel5Audio: HTMLMediaElement }).travel5Audio = this;
      return play.call(this);
    };
  });
  await page.goto('vocabulary/?language=es-419&pack=es-419-travel-5-pictures');
  await expect(page.locator('#results-status')).toContainText('36 cards');
  await expect(page.locator('.card')).toHaveCount(36);
  for (const name of [
    'Travel level 1 · Pictures', 'Travel level 2 · Pictures', 'Travel level 3 · Pictures',
    'Travel level 4 · Pictures', 'Basic Spanish level 1 · Pictures + contexts',
    'Food level 1 · Pictures', 'Food level 2 · Pictures',
  ]) await page.getByRole('checkbox', { name, exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Travel level 5 · Pictures', exact: true })).toBeChecked();
  const voices = page.getByRole('group', { name: 'Practice voices', exact: true });
  for (const checkbox of await voices.getByRole('checkbox').all()) {
    if (await checkbox.getAttribute('value') !== 'juan') await checkbox.uncheck();
  }
  const drawing = travel5.items.find(item => item.id === 'es-419-travel-draw')!;
  await page.getByLabel('Search words').fill('dibujar');
  await expect(page.locator('.card-image')).toHaveAttribute('src', '../' + drawing.image.src);
  await expect.poll(() => page.locator('.card-image').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: `Juan: ${drawing.label}`, exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const audio = (window as unknown as { travel5Audio: HTMLMediaElement }).travel5Audio;
    return audio.src.includes('/es-419-travel-5/juan/es-419-travel-draw.mp3') && audio.currentTime > 0;
  })).toBe(true);
  await page.getByLabel('Search words').fill('');
  await expect(page.locator('.card')).toHaveCount(36);
  expect(await savedAttempts(page, 'es-419')).toEqual([]);
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
  const previewed = new Set<string>();
  for (let turn = 0; turn < 10; turn++) {
    const audio = page.locator('audio');
    await expect(audio).toHaveAttribute('src', /\/es-419-travel-5\/juan\//);
    const source = await audio.getAttribute('src');
    const item = travel5.items.find(word => word.audio.some(clip => source?.endsWith(clip.src)));
    expect(item).toBeDefined();
    previewed.add(item!.id);
    const quiz = page.getByRole('button', { name: /mini-quiz/i });
    if (await quiz.count()) { await quiz.click(); break; }
    await page.getByRole('button', { name: /next card/i }).click();
    await expect(audio).not.toHaveAttribute('src', source!);
  }
  expect(previewed.size).toBe(10);
  const source = await page.locator('audio').getAttribute('src');
  const target = travel5.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  expect(target).toBeDefined();
  const choices = page.getByRole('button', { name: /choose picture/i });
  await expect(choices).toHaveCount(4);
  const pictures = await choices.locator('img').evaluateAll(images => images.map(image => image.getAttribute('src')));
  expect(pictures.every(src => travel5.items.some(item => src?.endsWith(item.image.src)))).toBe(true);
  await page.getByRole('button', { name: 'Replay word', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  await choices.filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(1);
  await page.reload();
  const saved = await savedAttempts(page, 'es-419');
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    itemId: target.id, language: 'es-419', correct: true,
    context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: target.audio.find(clip => source?.endsWith(clip.src))!.src },
  });
  expect(saved[0]!.choiceIds.every(id => travel5.items.some(item => item.id === id))).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kikimashta-card-packs-v1:es-419')!))).toEqual(['es-419-travel-5-pictures']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kikimashta-practice-voices-v1:es-419')!))).toEqual(['juan']);
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('ja-JP');
  expect(await savedAttempts(page, 'ja-JP')).toEqual([]);
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  expect(await savedAttempts(page, 'es-419')).toEqual(saved);
  await page.getByRole('link', { name: 'Card library', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Travel level 5 · Pictures', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Travel level 1 · Pictures', exact: true })).not.toBeChecked();
});
