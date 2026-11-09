import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { savedAttempts } from './saved-attempts';
import { advanceSchedule } from '../src/core/scheduler';
import type { ContextualBank } from '../src/content/contextual-types';

const bank = JSON.parse(readFileSync(new URL('../content/contextual/ja-wanikani-1-draft.json', import.meta.url), 'utf8')) as ContextualBank;
const policy = JSON.parse(readFileSync(new URL('../content/contextual/pack-1/practice-policy.json', import.meta.url), 'utf8')) as {
  writingOnlyItemIds: string[]; contextualOnlyItemIds: string[];
};
const manifestPath = new URL('../content/contextual/pack-1/generated-media.json', import.meta.url);
const hasGeneratedAudio = existsSync(manifestPath);
const acceptedAudio = existsSync(new URL('../content/contextual/pack-1/acceptance.json', import.meta.url));
const staged = hasGeneratedAudio ? JSON.parse(readFileSync(manifestPath, 'utf8')) : undefined;

async function attempts(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise(resolve => {
        const request = db.transaction('attempts').objectStore('attempts').getAll();
        request.onsuccess = () => resolve(request.result);
      });
    } finally { db.close(); }
  });
}

test('pack 1 library retains 232 questions and separates semantic focus without changing practice history', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeEnabled();
  const before = await attempts(page);
  await page.goto('./vocabulary/?view=contextual&contextPack=1');
  const gallery = page.locator('#contextual-library');
  await expect(gallery.getByRole('combobox', { name: 'Context collection' })).toHaveValue(bank.id);
  await expect(gallery.locator('.context-results-status')).toHaveText('232 contextual questions');
  await expect(gallery.locator('article')).toHaveCount(12);
  await gallery.getByRole('combobox', { name: 'Question kind' }).selectOption('target');
  await expect(gallery.locator('.context-results-status')).toHaveText('116 contextual questions');
  await gallery.getByRole('combobox', { name: 'Question kind' }).selectOption('detail');
  await expect(gallery.locator('.context-results-status')).toHaveText('116 contextual questions');
  await gallery.getByRole('combobox', { name: 'Question kind' }).selectOption('all');
  await gallery.getByRole('combobox', { name: 'Context collection' }).selectOption('all');
  await expect(gallery.locator('.context-results-status')).toHaveText('312 contextual questions');
  expect(await attempts(page)).toEqual(before);
});

test('staged pack 1 audio plays both native voices while remaining separately marked for listening acceptance', async ({ page }) => {
  test.skip(!hasGeneratedAudio, 'Run after the staged audio manifest is available.');
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const state: { src: string; time: number }[] = [];
    (window as unknown as { pack1Ended: typeof state }).pack1Ended = state;
    const observed = new WeakSet<HTMLMediaElement>();
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!observed.has(this)) {
        observed.add(this);
        this.addEventListener('ended', () => state.push({ src: this.currentSrc || this.src, time: this.currentTime }));
      }
      return nativePlay.call(this);
    };
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeEnabled();
  const before = await attempts(page);
  await page.goto('./vocabulary/?view=contextual&contextPack=1');
  const gallery = page.locator('#contextual-library');
  const context = bank.contexts[0]!; const question = context.questions[0]!;
  await gallery.getByRole('searchbox', { name: 'Search contexts' }).fill(question.id);
  const card = gallery.locator(`article[data-question-id="${question.id}"]`);
  await expect(card).toHaveCount(1);
  await expect(card.locator('.context-review-state')).toHaveText(`Text approved · Audio ${acceptedAudio ? 'approved' : 'awaiting review'}`);
  for (const voice of ['otani', 'morioki']) {
    const ended = () => page.evaluate(() => (window as unknown as { pack1Ended: { src: string; time: number }[] }).pack1Ended);
    const count = (await ended()).length;
    await card.getByRole('button', { name: `Play ${voice[0]!.toUpperCase() + voice.slice(1)}: ${question.id}`, exact: true }).click();
    await expect.poll(async () => (await ended()).length, { timeout: 25000 }).toBe(count + 2);
    const clips = (await ended()).slice(-2);
    expect(clips.every(clip => clip.time > 0)).toBe(true);
    const recording = staged.contexts.find((entry: { contextId: string }) => entry.contextId === context.id).recordings.find((row: { voice: string }) => row.voice === voice);
    const appBase = new URL('../', page.url());
    expect(clips.map(clip => new URL(clip.src).pathname)).toEqual([new URL(recording.sentenceSrc, appBase).pathname,
      new URL(recording.questionSrcs[question.id], appBase).pathname]);
  }
  expect(await attempts(page)).toEqual(before);
});

test('the twelve word prerequisites are writing-only throughout the real library', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeEnabled();
  const before = await attempts(page);
  await page.goto('./vocabulary/?pack=ja-wanikani-1-writing');
  for (const format of ['writing', 'pictures']) {
    await page.getByRole('combobox', { name: 'Card pack', exact: true }).selectOption('ja-wanikani-1-' + format);
    // Pack controls mount before the asynchronously fetched catalogue is ready.
    await expect(page.locator('#results-status')).toHaveText('37 cards · Showing 1–24');
    const labels = new Map<string, string>();
    while (true) {
      for (const row of await page.locator('article.card').evaluateAll(cards => cards.map(card => ({
        id: (card as HTMLElement).dataset.itemId!, text: card.querySelector('.card-mastery')!.textContent!,
      })))) labels.set(row.id, row.text);
      const next = page.getByRole('button', { name: 'Next →', exact: true });
      if (await next.isDisabled()) break;
      await next.click();
    }
    for (const id of policy.writingOnlyItemIds) expect(labels.get(id)).toBe(format === 'writing' ? 'Mastery: New' : 'Writing practice only');
    for (const id of policy.contextualOnlyItemIds) expect(labels.get(id)).toBe('Contextual practice only');
  }
  expect(await attempts(page)).toEqual(before);
});

test('accepted pack 1 directly introduces three targets, retains word lessons and restores their later reviews', async ({ page }) => {
  test.setTimeout(90000);
  const direct = policy.contextualOnlyItemIds;
  const questions = bank.contexts.flatMap(context => context.questions.map(question => ({ context, question })));
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeEnabled();
  expect(await savedAttempts(page)).toEqual([]);
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByRole('button', { name: 'Begin lesson', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Begin review', exact: true }).click();
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    const quiz = page.locator('.contextual-quiz');
    await expect(quiz).toBeVisible();
    const id = await quiz.getAttribute('data-question-id');
    const authored = questions.find(row => row.question.id === id)!;
    expect(authored, 'actual approved pack1 question').toBeTruthy();
    expect(authored.context.stage).toBe('simple');
    expect(direct).toContain(authored.context.targetItemId);
    expect(seen).not.toContain(authored.context.targetItemId);
    seen.push(authored.context.targetItemId);
    const correct = authored.question.options.find(option => option.id === authored.question.correctOptionId)!;
    await quiz.getByRole('button', { name: `Choose writing ${correct.text}`, exact: true }).click();
    await expect.poll(async () => (await savedAttempts(page)).length).toBe(i + 1);
    await expect(page.locator(`.contextual-quiz[data-question-id="${id}"]`)).toHaveCount(0, { timeout: 25000 });
  }
  expect(seen.sort()).toEqual([...direct].sort());
  const introduced = await savedAttempts(page);
  expect(introduced.every(attempt => attempt.context?.phase === 'lesson' && attempt.context.exercise === 'context-simple-text')).toBe(true);
  await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
  await expect(page.locator('.preview')).toBeVisible();
  await expect(page.locator('.preview')).toHaveAttribute('data-exercise', /^(audio-picture|audio-text)$/);
  await expect(page.getByRole('heading', { name: 'Lesson time!' })).toBeVisible();
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await page.reload();
  expect(await savedAttempts(page)).toEqual(introduced);
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByRole('button', { name: 'Begin review', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Begin lesson', exact: true })).toBeVisible();
  // The real stored introductions return as independent due reviews without a word card.
  const scheduled = await Promise.all(introduced.map(attempt => advanceSchedule(undefined, attempt)));
  await page.clock.install({ time: Math.max(...scheduled.map(card => card.dueAt)) + 1000 });
  await page.goto('./');
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.getByRole('button', { name: 'Begin review', exact: true }).click();
  for (let index = 0; index < 3; index++) {
    const quiz = page.locator('.contextual-quiz');
    const id = await quiz.getAttribute('data-question-id');
    const authored = questions.find(row => row.question.id === id)!;
    expect(direct).toContain(authored.context.targetItemId);
    expect(authored.context.stage).toBe('simple');
    const correct = authored.question.options.find(option => option.id === authored.question.correctOptionId)!;
    await quiz.getByRole('button', { name: `Choose writing ${correct.text}`, exact: true }).click();
    await expect.poll(async () => (await savedAttempts(page)).length).toBe(4 + index);
    await expect(page.locator(`.contextual-quiz[data-question-id="${id}"]`)).toHaveCount(0, { timeout: 25000 });
  }
  const reviewed = await savedAttempts(page);
  expect(reviewed.filter(attempt => !introduced.some(old => old.id === attempt.id)).map(attempt => attempt.itemId).sort()).toEqual([...direct].sort());
  expect(reviewed.filter(attempt => !introduced.some(old => old.id === attempt.id)).every(attempt => attempt.context?.phase === 'review' && attempt.context.exercise === 'context-simple-text')).toBe(true);
  for (const original of introduced) expect(reviewed.find(attempt => attempt.id === original.id)).toEqual(original);
});
