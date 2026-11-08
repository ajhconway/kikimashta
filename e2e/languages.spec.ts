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
    await page.getByRole('button', { name: /choose picture/i }).filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
  }
  await expect(page.getByRole('heading', { name: 'Nice round!' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.reload();
  await expect(page.getByText(`${lessonSize} answers saved on this device`)).toBeVisible();
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('ja-JP');
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await expect(page.getByText(`${lessonSize} answers saved on this device`)).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  await expect(page.getByText(`${lessonSize} answers saved on this device`)).toBeVisible();
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
  await expect(page.getByText('6 answers saved on this device')).toBeVisible();
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
