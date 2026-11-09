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
import spanishLevel2 from '../content/es-419-travel-2.json' with { type: 'json' };

test('Spanish picture lessons play, save and stay isolated after reload', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await page.evaluate(id => {
    localStorage.setItem('kikimashta-learning-language-v1', 'es-419');
    localStorage.setItem('kikimashta-card-packs-v1:es-419', JSON.stringify([`${id}-pictures`]));
  }, spanish.id);
  await page.reload();
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson' }).click();
  const lessonSize = 10;
  for (let i = 0; i < lessonSize; i++) {
    await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
    await page.getByRole('button', { name: i === lessonSize - 1 ? /mini-quiz/i : /next card/i }).click();
  }
  for (let i = 0; i < lessonSize; i++) {
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(i));
    await expect(page.getByRole('button', { name: /choose (picture|writing)/i }).first()).toBeEnabled();
    const source = await page.locator('audio').getAttribute('src');
    const target = spanish.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
    expect(target).toBeTruthy();
    const shown = await page.getByRole('button', { name: /choose picture/i }).locator('img').evaluateAll(images => images.map(image => image.getAttribute('alt')));
    expect(shown.every(alt => spanish.items.some(item => item.image.alt === alt))).toBe(true);
    await page.getByRole('button', { name: /choose picture/i }).filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
  }
  await expect(page.getByRole('heading', { name: 'Nice round!' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.reload();
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(lessonSize);
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('ja-JP');
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  expect(await savedAttempts(page, 'ja-JP')).toEqual([]);
  await expect(page.getByRole('button', { name: 'Start · 0 reviews', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(lessonSize);
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


test('level 2 pack selection scopes a saved answer independently of level 1', async ({ page }) => {
  await page.goto('vocabulary/?language=es-419&pack=es-419-travel-2-pictures');
  await expect(page.locator('#results-status')).toContainText('36 cards');
  await expect(page.locator('.card h2')).toHaveText(spanishLevel2.items.slice(0, 24).map(item => item.text));
  await page.getByRole('checkbox', { name: 'Travel level 1 · Pictures', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Travel level 2 · Pictures', exact: true })).toBeChecked();
  await page.getByLabel('Search words').fill('stairs');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('escaleras');
  const stairs = spanishLevel2.items.find(item => item.id.endsWith('-stairs'))!;
  await expect(page.locator('.card-image')).toHaveAttribute('src', '../' + stairs.image.src);
  await expect.poll(() => page.locator('.card-image').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Juan: Stairs', exact: true }).click();
  await expect(page.locator('#audio-status')).toContainText('escaleras');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Travel level 1 · Pictures', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Travel level 2 · Pictures', exact: true })).toBeChecked();
  await page.getByLabel('Card pack').selectOption('all');
  await expect(page.locator('#results-status')).toContainText('72 cards');
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
  for (let turn = 0; turn < 10; turn++) {
    const miniQuiz = page.getByRole('button', { name: /mini-quiz/i });
    if (await miniQuiz.count()) { await miniQuiz.click(); break; }
    await page.getByRole('button', { name: /next card/i }).click();
  }
  await expect(page.getByRole('button', { name: /choose picture/i }).first()).toBeEnabled();
  const source = await page.locator('audio').getAttribute('src');
  const target = spanishLevel2.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  expect(target).toBeDefined();
  const choices = page.getByRole('button', { name: /choose picture/i });
  await expect(choices).toHaveCount(4);
  const shown = await choices.locator('img').evaluateAll(images => images.map(image => image.getAttribute('alt')));
  expect(shown.every(alt => spanishLevel2.items.some(item => item.image.alt === alt))).toBe(true);
  await choices.filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(1);
  await page.reload();
  const saved = await savedAttempts(page, 'es-419');
  expect(saved).toHaveLength(1);
  expect(saved[0]!.itemId).toBe(target.id);
  expect(await savedAttempts(page, 'ja-JP')).toEqual([]);
});
