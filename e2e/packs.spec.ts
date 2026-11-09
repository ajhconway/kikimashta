import { savedAttempts } from './saved-attempts';
import { expect, test } from '@playwright/test';
import catalogue from '../content/catalog/ja.json' with { type: 'json' };
import pool from '../content/practice-pool.json' with { type: 'json' };
import starter from '../content/ja.json' with { type: 'json' };

const packPreferenceKey = 'kikimashta-card-packs-v1';
const pack = { id: 'ja-wanikani-2-writing', title: 'WaniKani level 2 · Writing' };
const eligible = catalogue.items.filter(item => item.sourceLevel === 2 &&
  [...pool.itemIds, ...starter.items.map(item => item.id)].includes(item.id));

test('selected writing pack persists and saves only its cards to real browser storage', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(({ key, id }) => localStorage.setItem(key, JSON.stringify([id])), { key: packPreferenceKey, id: pack.id });
  await page.reload();
  await page.getByRole('link', { name: 'Card library · 1 pack selected' }).click();
  await expect(page.getByRole('group', { name: 'Practice packs', exact: true }).getByRole('checkbox', { checked: true })).toHaveAccessibleName(pack.title);
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
  for (let turn = 0; turn < 10; turn++) {
    await expect(page.locator('.preview')).toHaveAttribute('data-exercise', 'audio-text');
    const text = await page.locator('.preview .written-answer').textContent();
    expect(eligible.some(item => item.text === text)).toBe(true);
    const miniQuiz = page.getByRole('button', { name: 'Mini-quiz', exact: false });
    if (await miniQuiz.count()) { await miniQuiz.click(); break; }
    await page.getByRole('button', { name: 'Next card', exact: false }).click();
  }
  await expect(page.locator('.quiz')).toHaveAttribute('data-exercise', 'audio-text');
  await expect(page.locator('.choices img')).toHaveCount(0);
  const source = await page.locator('audio').getAttribute('src');
  const target = eligible.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  const choices = await page.locator('.choices .written-answer').allTextContents();
  expect(choices).toHaveLength(4);
  expect(choices.every(text => eligible.some(item => item.text === text))).toBe(true);
  await page.getByRole('button', { name: 'Choose writing ' + target.text, exact: true }).click();
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(1);
  await page.reload();
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(1);
  await expect(page.getByRole('link', { name: 'Card library · 1 pack selected' })).toBeVisible();
  await page.getByRole('link', { name: 'Card library · 1 pack selected' }).click();
  await page.getByRole('checkbox', { name: pack.title }).uncheck();
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await expect(page.getByRole('button', { name: /^start/i })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Card library · 0 packs selected' })).toBeVisible();
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(1);
});

test('retired starter selections disappear while their saved history survives reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await page.getByRole('link', { name: 'Card library · 10 packs selected' }).click();
  await expect(page.getByRole('group', { name: 'Practice packs', exact: true }).getByRole('checkbox')).toHaveCount(10);
  await expect(page.getByRole('checkbox', { name: /Starter words/ })).toHaveCount(0);
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await page.evaluate(async ({ key, packId }) => {
    localStorage.setItem(key, JSON.stringify(['ja-starter-pictures', packId, 'ja-starter-writing']));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('attempts', 'readwrite');
      for (const itemId of ['ja-cat', 'ja-banana', 'ja-umbrella', 'ja-cup']) {
        tx.objectStore('attempts').put({
          id: 'retired-' + itemId, sessionId: 'legacy', itemId, language: 'ja-JP',
          choiceIds: [itemId], selectedId: itemId, correct: true,
          startedAt: 1000, answeredAt: 2000, responseMs: 1000,
        });
      }
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    } finally { db.close(); }
  }, { key: packPreferenceKey, packId: pack.id });
  await page.reload();
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(4);
  await page.getByRole('link', { name: 'Card library · 1 pack selected' }).click();
  await expect(page.getByRole('group', { name: 'Practice packs', exact: true }).getByRole('checkbox', { checked: true })).toHaveAccessibleName(pack.title);
  await expect(page.getByRole('group', { name: 'Practice packs', exact: true }).getByRole('checkbox')).toHaveCount(10);
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await page.getByRole('button', { name: /^start/i }).click();
  await expect(page.getByRole('button', { name: 'Begin review', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Begin lesson', exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(4);
  await expect(page.getByRole('link', { name: 'Card library · 1 pack selected' })).toBeVisible();
});
