import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { advanceSchedule, schedulerVersion } from '../src/core/scheduler';
import { cardMastery } from '../src/core/mastery';
import type { PracticeAttempt, WordItem } from '../src/types';

const catalog = JSON.parse(readFileSync(new URL('../content/catalog/ja.json', import.meta.url), 'utf8')) as { items: WordItem[] };
const prepared = JSON.parse(readFileSync(new URL('../content/semantic-neighbors/ja-runtime.json', import.meta.url), 'utf8')) as { ids: string[] };
const words = catalog.items.filter(item => prepared.ids.includes(item.id));
const book = words.find(item => item.text === '本')!;

async function history(page: Page, incoming?: PracticeAttempt[]): Promise<PracticeAttempt[]> {
  return page.evaluate(async values => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('attempts', { keyPath: 'id' }).createIndex('language', 'language');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      if (values) await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('attempts', 'readwrite'); values.forEach(value => tx.objectStore('attempts').put(value));
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
      return await new Promise<PracticeAttempt[]>((resolve, reject) => {
        const request = db.transaction('attempts').objectStore('attempts').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, incoming);
}

test('saved word mastery selects semantic alternatives and keeps the shown choices through retries and reload', async ({ page }) => {
  const at = Date.UTC(2026, 0, 1);
  const first: PracticeAttempt = { id: 'word-learn', sessionId: 'seed', itemId: book.id, language: 'ja-JP',
    choiceIds: [book.id], selectedId: book.id, correct: true, startedAt: at, answeredAt: at, responseMs: 0,
    context: { phase: 'lesson', exercise: 'audio-text', recordingSrc: book.audio[0]!.src, replays: 0, schedulerVersion } };
  const learned = await advanceSchedule(undefined, first);
  const second = { ...first, id: 'word-review', startedAt: learned.dueAt, answeredAt: learned.dueAt,
    context: { ...first.context!, phase: 'review' as const } };
  const familiar = await advanceSchedule(learned, second);
  expect(cardMastery(familiar).label).toBe('Familiar');
  await page.clock.install({ time: new Date(familiar.dueAt + 1000) });
  await page.addInitScript(() => {
    Math.random = () => .999;
    localStorage.setItem('kikimashta-card-packs-v1', JSON.stringify([1, 2, 3, 4, 5].map(level => `ja-wanikani-${level}-writing`)));
  });
  await page.goto('./'); await history(page, [first, second]); await page.reload();
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.getByRole('button', { name: 'Begin review' }).click();
  await expect(page.locator('.quiz')).toHaveAttribute('data-exercise', 'audio-text');
  const shown = await page.locator('.choices .written-answer').allTextContents();
  expect(shown).toHaveLength(4);
  expect(shown).toContain('本');
  const semantic = new Set(['ノート', '文', '作文', '切手']);
  expect(shown.filter(text => semantic.has(text))).toHaveLength(2);
  const ids = shown.map(text => words.find(item => item.text === text)!.id);
  await page.getByRole('button', { name: 'Choose writing ' + shown.find(text => text !== '本'), exact: true }).click();
  await expect.poll(async () => (await history(page)).length).toBe(3);
  const miss = (await history(page)).find(attempt => attempt.id !== first.id && attempt.id !== second.id)!;
  expect(miss.choiceIds).toEqual(ids);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.choices .written-answer')).toHaveText(shown);
  await page.getByRole('button', { name: 'Choose writing 本', exact: true }).click();
  await expect.poll(async () => (await history(page)).length).toBe(4);
  const correction = (await history(page)).find(attempt => attempt.context?.retryOf === miss.id)!;
  expect(correction.choiceIds.slice().sort()).toEqual(ids.slice().sort());
  await page.reload();
  const saved = await history(page);
  expect(saved.find(attempt => attempt.id === miss.id)).toEqual(miss);
  expect(saved.find(attempt => attempt.id === correction.id)).toEqual(correction);
});

test('Dev review uses simulated mastery to change actual picture alternatives without saving progress', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => .999; });
  await page.goto('./');
  const before = await history(page);
  async function choicesAt(level: string) {
    await page.getByRole('button', { name: 'Dev review', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Words · Writing', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Clear levels', exact: true }).click();
    await page.getByRole('checkbox', { name: level, exact: true }).check();
    await page.getByRole('combobox', { name: 'Timer behavior', exact: true }).selectOption('untimed');
    await page.getByRole('button', { name: 'Start dev review', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Demo mastery' })).toContainText(level);
    await expect(page.locator('.choices')).toBeVisible();
    await expect(page.getByRole('button', { name: /Choose picture/ }).first()).toBeEnabled();
    const src = await page.locator('.app > audio').getAttribute('src');
    const target = words.find(item => item.audio.some(clip => src?.endsWith(clip.src)))!;
    expect(target.text).toBe('犬');
    const sources = await page.locator('.choices img').evaluateAll(images => images.map(image => (image as HTMLImageElement).src));
    return sources.map(source => words.find(item => source.endsWith(item.image.src))!.text).filter(text => text !== '犬');
  }
  const closeSounds = new Set(['一', '石', '糸', '色']);
  const newChoices = await choicesAt('New');
  expect(newChoices.some(text => closeSounds.has(text))).toBe(false);
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  const mastered = await choicesAt('Mastered');
  expect(mastered).toHaveLength(3);
  expect(mastered.every(text => closeSounds.has(text))).toBe(true);
  expect(await history(page)).toEqual(before);
});
