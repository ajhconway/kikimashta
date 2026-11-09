import { savedAttempts } from './saved-attempts';
import { expect, test } from './fixtures';

test('remembers learning language and independent pack choices across reloads', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Card library' })).toHaveAttribute('href', /language=es-419/);
  await page.getByRole('link', { name: /Card library/ }).click();
  const esPack = page.getByRole('checkbox', { name: 'Travel level 1 · Pictures', exact: true });
  await expect(page.getByRole('checkbox', { name: /Writing/ })).toHaveCount(0);
  await esPack.uncheck();
  await page.getByRole('checkbox', { name: 'Travel level 2 · Pictures', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Travel level 3 · Pictures', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Travel level 4 · Pictures', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: /Basic Spanish level 1/ }).uncheck();
  await page.getByRole('checkbox', { name: 'Food level 1 · Pictures', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: /WaniKani/ })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Practice voices', exact: true }).getByRole('checkbox')).toHaveCount(8);
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
import spanishFood from '../content/es-419-food-1.json' with { type: 'json' };

test('Spanish lesson uses its selected voice and saves an isolated answer after reload', async ({ page }) => {
  await page.goto('./vocabulary/?language=es-419&pack=es-419-travel-1-pictures');
  for (const name of ['Travel level 2 · Pictures', 'Travel level 3 · Pictures', 'Travel level 4 · Pictures', 'Basic Spanish level 1 · Pictures + contexts', 'Food level 1 · Pictures']) {
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
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
  for (let turn = 0; turn < 10; turn++) {
    await expect(page.locator('audio')).toHaveAttribute('src', /\/juan\//);
    const next = page.getByRole('button', { name: /next card/i });
    if (!await next.count()) break;
    await next.click();
  }
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
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(1);
  await page.reload();
  const saved = await savedAttempts(page, 'es-419');
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ itemId: target.id, language: 'es-419', context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc } });
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('ja-JP');
  await expect(page.getByRole('button', { name: 'Start · 0 reviews', exact: true })).toBeEnabled();
  expect(await savedAttempts(page, 'ja-JP')).toEqual([]);
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  expect(await savedAttempts(page, 'es-419')).toEqual(saved);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kikimashta-practice-voices-v1')!))).toEqual(['lime']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kikimashta-practice-voices-v1:es-419')!))).toEqual(['juan']);
});

test('expanded Spanish pack retains old starter progress while retired words leave selection', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  const original = await page.evaluate(async () => {
    localStorage.setItem('kikimashta-learning-language-v1', 'es-419');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const attempts = ['hotel', 'water', 'coffee', 'car', 'entrance', 'exit'].map((word, i) => ({
      id: `starter-${word}`, sessionId: 'old-spanish-starter', itemId: `es-419-travel-${word}`, language: 'es-419',
      choiceIds: [`es-419-travel-${word}`], selectedId: `es-419-travel-${word}`, correct: true,
      startedAt: Date.now() - 86_400_000 - i, answeredAt: Date.now() - 86_400_000 - i, responseMs: 0,
      context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: `audio/es-419-travel-v1/cesar/es-419-travel-${word}.mp3`, replays: 0, schedulerVersion: 'fsrs-6-v1' },
    }));
    const transaction = db.transaction('attempts', 'readwrite');
    for (const attempt of attempts) transaction.objectStore('attempts').put(attempt);
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close(); return attempts;
  });
  await page.reload();
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(6);
  await page.getByRole('link', { name: /card library/i }).click();
  await expect(page.locator('#results-status')).toContainText('36 cards');
  await expect(page.locator('[data-item-id="es-419-travel-hotel"] .card-mastery')).toHaveText('Mastery: Learning');
  await page.getByLabel('Search words').fill('Entrance');
  await expect(page.locator('.card')).toHaveCount(0);
  const retained = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('kikimashta-v0', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const records = await new Promise<unknown[]>((resolve, reject) => { const request = db.transaction('attempts').objectStore('attempts').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return records;
  });
  expect(retained).toEqual(expect.arrayContaining(original));
  expect(retained).toHaveLength(6);
});


test('Food library and practice share Travel progress and stay scoped after reload', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.5;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      (window as unknown as { foodAudio: HTMLMediaElement }).foodAudio = this;
      return play.call(this);
    };
  });
  await page.goto('vocabulary/?language=es-419&pack=es-419-food-1-pictures');
  await expect(page.locator('#results-status')).toContainText('36 cards');
  for (const level of [1, 2, 3, 4]) await page.getByRole('checkbox', { name: `Travel level ${level} · Pictures`, exact: true }).uncheck();
  await page.getByRole('checkbox', { name: /Basic Spanish level 1/ }).uncheck();
  const voices = page.getByRole('group', { name: 'Practice voices', exact: true });
  for (const checkbox of await voices.getByRole('checkbox').all()) if (await checkbox.getAttribute('value') !== 'juan') await checkbox.uncheck();
  const rice = spanishFood.items.find(word => word.id === 'es-419-travel-rice')!;
  const priorRice = await page.evaluate(async recordingSrc => {
    const attempt = { id: 'shared-travel-rice', sessionId: 'before-food', itemId: 'es-419-travel-rice', language: 'es-419',
      choiceIds: ['es-419-travel-rice'], selectedId: 'es-419-travel-rice', correct: true,
      startedAt: Date.now() - 1000, answeredAt: Date.now() - 500, responseMs: 500,
      context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc, replays: 0, schedulerVersion: 'fsrs-6-v1' } };
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('kikimashta-v0', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      await new Promise<void>((resolve, reject) => { const tx = db.transaction('attempts', 'readwrite'); tx.objectStore('attempts').put(attempt); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    } finally { db.close(); }
    return attempt;
  }, rice.audio[0]!.src);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Food level 1 · Pictures', exact: true })).toBeChecked();
  await page.getByLabel('Search words').fill('arroz');
  await expect(page.locator('.card-image')).toHaveAttribute('src', '../' + rice.image.src);
  await expect(page.locator('.card-mastery')).toHaveText('Mastery: Learning');
  await expect.poll(() => page.locator('.card-image').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('group', { name: 'Latin American Spanish voices for Rice', exact: true }).getByRole('button')).toHaveCount(8);
  await page.getByRole('button', { name: 'Juan: Rice', exact: true }).click();
  await expect(page.locator('#audio-status')).toContainText('arroz');
  await page.getByLabel('Card pack').selectOption('es-419-travel-1-pictures');
  await expect(page.locator('.card-image')).toHaveAttribute('src', '../' + rice.image.src);
  await expect(page.locator('.card-mastery')).toHaveText('Mastery: Learning');
  await expect(page.getByRole('checkbox', { name: 'Travel level 1 · Pictures', exact: true })).not.toBeChecked();
  await page.getByLabel('Card pack').selectOption('es-419-food-1-pictures');
  await page.getByLabel('Search words').fill('papa');
  await page.getByRole('button', { name: 'Juan: Potato', exact: true }).click();
  await expect(page.locator('#audio-status')).toContainText('papa');
  await expect.poll(() => page.evaluate(() => {
    const audio = (window as unknown as { foodAudio: HTMLMediaElement }).foodAudio;
    return audio.src.includes('/es-419-food-1/juan/') && audio.currentTime > 0;
  })).toBe(true);
  await page.getByLabel('Search words').fill('');
  await page.getByLabel('Card pack').selectOption('all');
  await expect(page.locator('#results-status')).toContainText('171 cards');
  await expect(page.getByRole('checkbox', { name: 'Food level 1 · Pictures', exact: true })).toBeChecked();
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
  const previewed = new Set<string>();
  for (let turn = 0; turn < 10; turn++) {
    await expect(page.locator('audio')).toHaveAttribute('src', /\/juan\//);
    const src = await page.locator('audio').getAttribute('src');
    const item = spanishFood.items.find(word => word.audio.some(clip => src?.endsWith(clip.src)))!;
    expect(item).toBeDefined(); previewed.add(item.id);
    const quiz = page.getByRole('button', { name: /mini-quiz/i });
    if (await quiz.count()) { await quiz.click(); break; }
    await page.getByRole('button', { name: /next card/i }).click();
    await expect(page.locator('audio')).not.toHaveAttribute('src', src!);
  }
  expect(previewed.size).toBe(10);
  const source = await page.locator('audio').getAttribute('src');
  const target = spanishFood.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  expect(target).toBeDefined();
  const choices = page.getByRole('button', { name: /choose picture/i });
  await expect(choices).toHaveCount(4);
  const shown = await choices.locator('img').evaluateAll(images => images.map(image => image.getAttribute('alt')));
  expect(shown.every(alt => spanishFood.items.some(item => item.image.alt === alt))).toBe(true);
  await choices.filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(2);
  await page.reload();
  const saved = await savedAttempts(page, 'es-419');
  expect(saved).toHaveLength(2);
  expect(saved.find(attempt => attempt.id === priorRice.id)).toEqual(priorRice);
  const answer = saved.find(attempt => attempt.id !== priorRice.id)!;
  expect(answer.itemId).toBe(target.id);
  expect(answer.context?.recordingSrc).toBe(target.audio.find(clip => source?.endsWith(clip.src))!.src);
  expect(await savedAttempts(page, 'ja-JP')).toEqual([]);
});
