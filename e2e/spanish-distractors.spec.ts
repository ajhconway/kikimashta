import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { savedAttempts } from './saved-attempts';
import { advanceSchedule, schedulerVersion } from '../src/core/scheduler';
import { cardMastery } from '../src/core/mastery';
import type { PracticeAttempt, WordItem } from '../src/types';

const food = JSON.parse(readFileSync(new URL('../content/es-419-food-1.json', import.meta.url), 'utf8')) as { items: WordItem[] };
const exclusions = JSON.parse(readFileSync(new URL('../content/spanish-picture-exclusions.json', import.meta.url), 'utf8')) as { pairs: { ids: string[] }[] };
const prepared = JSON.parse(readFileSync(new URL('../content/semantic-neighbors/es-runtime.json', import.meta.url), 'utf8')) as {
  ids: string[]; semantic: number[][]; pronunciation: number[][]; pronunciationKeys: string[];
};
const rice = food.items.find(item => item.id === 'es-419-travel-rice')!;

async function foodScope(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('kikimashta-learning-language-v1', 'es-419');
    localStorage.setItem('kikimashta-card-packs-v1:es-419', JSON.stringify(['es-419-food-1-pictures']));
    Math.random = () => .999;
  });
}

function idFromImage(source: string): string {
  const item = food.items.find(item => source.endsWith(item.image.src));
  expect(item, `Choice must use an approved Food picture: ${source}`).toBeDefined();
  return item!.id;
}

async function shownIds(page: Page) {
  return (await page.locator('.choices img').evaluateAll(images => images.map(image => (image as HTMLImageElement).src))).map(idFromImage);
}

function nearest(target: WordItem, kind: 'semantic' | 'pronunciation') {
  const index = prepared.ids.indexOf(target.id);
  expect(index).toBeGreaterThanOrEqual(0);
  return prepared[kind][index]!.map(value => prepared.ids[value]!).filter(id => {
    const item = food.items.find(item => item.id === id);
    if (!item || item.image.src === target.image.src) return false;
    if (prepared.pronunciationKeys[prepared.ids.indexOf(id)] === prepared.pronunciationKeys[index]) return false;
    return !target.pictureDistractorExclusions?.includes(id) && !item.pictureDistractorExclusions?.includes(target.id) &&
      !exclusions.pairs.some(pair => pair.ids.includes(id) && pair.ids.includes(target.id));
  }).slice(0, 6);
}

test('Spanish Dev review uses Food-scoped semantic and phoneme borders without saving progress', async ({ page }) => {
  await foodScope(page);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Dev review', exact: true })).toBeEnabled();
  const before = await savedAttempts(page, 'es-419');
  for (const [level, semanticCount, pronunciationCount] of [['Familiar', 2, 0], ['Strong', 2, 1]] as const) {
    await page.getByRole('button', { name: 'Dev review', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Review types', exact: true }).getByRole('checkbox')).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear levels', exact: true }).click();
    await page.getByRole('checkbox', { name: level, exact: true }).check();
    await page.getByRole('combobox', { name: 'Timer behavior', exact: true }).selectOption('untimed');
    await page.getByRole('button', { name: 'Start dev review', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Demo mastery' })).toContainText(level);
    await expect(page.getByRole('button', { name: /Choose picture/ }).first()).toBeEnabled();
    await expect(page.getByRole('group', { name: 'Word choice border legend' })).toBeVisible();
    const source = await page.locator('.app > audio').getAttribute('src');
    const target = food.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
    expect(target).toBeDefined();
    const ids = await shownIds(page);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toContain(target.id);
    const counts = { correct: 1, semantic: semanticCount, pronunciation: pronunciationCount, broad: 3 - semanticCount - pronunciationCount };
    const styles = { correct: 'solid', semantic: 'dashed', pronunciation: 'double', broad: 'dotted' };
    for (const kind of ['correct', 'semantic', 'pronunciation', 'broad'] as const) {
      const slots = page.locator(`.choice-slot[data-dev-choice-kind="${kind}"]`);
      await expect(slots).toHaveCount(counts[kind]);
      for (const slot of await slots.all()) {
        await expect(slot.getByRole('button')).toHaveCSS('border-top-style', styles[kind]);
        await expect(slot.getByRole('button')).toHaveAttribute('aria-describedby', 'dev-choice-' + kind);
        if (kind === 'semantic' || kind === 'pronunciation') {
          const image = await slot.locator('img').getAttribute('src');
          expect(nearest(target, kind)).toContain(idFromImage(image!));
        }
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
    expect(await savedAttempts(page, 'es-419')).toEqual(before);
  }
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dev review', exact: true })).toBeEnabled();
  expect(await savedAttempts(page, 'es-419')).toEqual(before);
  expect(await savedAttempts(page, 'ja-JP')).toEqual([]);
});

test('Spanish saved mastery keeps canonical shared-word choices through a miss, retry and reload', async ({ page }) => {
  const at = Date.UTC(2026, 0, 1);
  const first: PracticeAttempt = { id: 'spanish-rice-learn', sessionId: 'seed', itemId: rice.id, language: 'es-419',
    choiceIds: [rice.id], selectedId: rice.id, correct: true, startedAt: at, answeredAt: at, responseMs: 0,
    context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: rice.audio[0]!.src, replays: 0, schedulerVersion } };
  const learned = await advanceSchedule(undefined, first);
  const second: PracticeAttempt = { ...first, id: 'spanish-rice-review', startedAt: learned.dueAt, answeredAt: learned.dueAt,
    context: { ...first.context!, phase: 'review' } };
  const familiar = await advanceSchedule(learned, second);
  expect(cardMastery(familiar).label).toBe('Familiar');
  await page.clock.install({ time: new Date(familiar.dueAt + 1000) });
  await foodScope(page);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Dev review', exact: true })).toBeEnabled();
  await page.evaluate(async attempts => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('attempts', 'readwrite');
        for (const attempt of attempts) tx.objectStore('attempts').put(attempt);
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, [first, second]);
  await page.reload();
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.getByRole('button', { name: 'Begin review', exact: true }).click();
  await expect(page.locator('.quiz')).toHaveAttribute('data-exercise', 'audio-picture');
  await expect(page.locator('.choice-slot[data-dev-choice-kind]')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Word choice border legend' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Choose picture/ }).first()).toBeEnabled();
  const ids = await shownIds(page);
  expect(ids).toContain(rice.id);
  expect(ids.filter(id => nearest(rice, 'semantic').includes(id))).toHaveLength(2);
  await expect(page.getByRole('img', { name: rice.image.alt, exact: true })).toHaveJSProperty('src', new URL(rice.image.src, page.url()).href);
  const wrong = food.items.find(item => ids.includes(item.id) && item.id !== rice.id)!;
  await page.getByRole('button', { name: /Choose picture/ }).filter({ has: page.getByRole('img', { name: wrong.image.alt, exact: true }) }).click();
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(3);
  const miss = (await savedAttempts(page, 'es-419')).find(attempt => attempt.id !== first.id && attempt.id !== second.id)!;
  expect(miss.choiceIds).toEqual(ids);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  expect(await shownIds(page)).toEqual(ids);
  await page.getByRole('button', { name: /Choose picture/ }).filter({ has: page.getByRole('img', { name: rice.image.alt, exact: true }) }).click();
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(4);
  const correction = (await savedAttempts(page, 'es-419')).find(attempt => attempt.context?.retryOf === miss.id)!;
  expect(correction.choiceIds).toEqual(ids);
  expect(correction.itemId).toBe(rice.id);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dev review', exact: true })).toBeEnabled();
  const saved = await savedAttempts(page, 'es-419');
  expect(saved.find(attempt => attempt.id === miss.id)).toEqual(miss);
  expect(saved.find(attempt => attempt.id === correction.id)).toEqual(correction);
  expect(saved.find(attempt => attempt.id === first.id)).toEqual(first);
  expect(await savedAttempts(page, 'ja-JP')).toEqual([]);
});
