import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import type { ContextualBank } from '../src/content/contextual-types';
import type { PracticeAttempt } from '../src/types';
import { advanceSchedule, deriveSchedules, schedulerVersion, type ScheduledWord } from '../src/core/scheduler';
import { deriveContextualUnlocks } from '../src/core/contextual-progression';

const banks = ['ja-pilot.json', 'ja-simple-pilot.json', 'ja-simple-expansion.json'].map(file =>
  JSON.parse(readFileSync(new URL('../content/contextual/' + file, import.meta.url), 'utf8')) as ContextualBank);
const contexts = banks.flatMap(bank => bank.contexts);
const allQuestions = contexts.flatMap(context => context.questions);
const media = JSON.parse(readFileSync(new URL('../content/contextual/accepted-media.json', import.meta.url), 'utf8'));
const upper = contexts.find(context => context.id === 'ja-ctx-simple-ue-01')!;

async function stored(page: Page, attempts?: PracticeAttempt[]): Promise<PracticeAttempt[]> {
  return page.evaluate(async incoming => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('attempts', { keyPath: 'id' }).createIndex('language', 'language'); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      if (incoming) await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('attempts', 'readwrite'); incoming.forEach(attempt => tx.objectStore('attempts').put(attempt));
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
      return await new Promise<PracticeAttempt[]>((resolve, reject) => {
        const request = db.transaction('attempts').objectStore('attempts').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, attempts);
}

test('contextual dev review covers the full pilot, plays both clips, filters and preserves browser history', async ({ page }) => {
  await page.goto('./');
  const baseline: PracticeAttempt[] = [{ id: 'before-dev', sessionId: 'legacy', itemId: upper.targetItemId, language: 'ja-JP', choiceIds: ['a', 'b'], selectedId: 'a', correct: true, startedAt: 1, answeredAt: 2, responseMs: 1 }];
  await stored(page, baseline);
  await page.goto('./?review=contextual');
  const jump = page.getByLabel('Jump to question');
  await expect(jump.locator('option')).toHaveCount(80);
  const ids = await jump.locator('option').allTextContents();
  for (const question of allQuestions) expect(ids.some(label => label.endsWith(question.id))).toBe(true);
  await page.getByRole('combobox', { name: 'Voice', exact: true }).selectOption('otani');
  await page.getByRole('button', { name: 'Replay sentence and question' }).click();
  const audio = page.locator('.contextual-quiz audio');
  await expect(audio).toHaveAttribute('src', /otani\/sentence\.mp3$/);
  await expect(page.getByRole('heading', { name: 'Sentence', exact: true })).toHaveCount(0);
  await expect(audio).toHaveAttribute('src', /otani\/ja-ctx-simple-ue-01-target\.mp3$/, { timeout: 10000 });
  await page.getByRole('button', { name: /Choose writing/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Sentence', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Stage', exact: true }).selectOption('simple');
  await expect(jump.locator('option')).toHaveCount(40);
  await page.getByLabel('Question kind').selectOption('detail');
  await expect(jump.locator('option')).toHaveCount(20);
  await jump.selectOption('19');
  await expect(page.getByText('Audio awaiting listening approval.')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sentence', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Choose writing/ }).first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review complete' })).toBeVisible();
  expect(await stored(page)).toEqual(baseline);
  await page.reload();
  expect(await stored(page)).toEqual(baseline);
});

test('contextual scheduled reviews persist explicit answers and retain the same retry recordings', async ({ page }) => {
  const reviewed = contexts.find(context => context.id === 'ja-ctx-simple-mizu-01')!;
  await page.addInitScript(() => { Math.random = () => 0; });
  let wordSchedule: ScheduledWord | undefined;
  const history: PracticeAttempt[] = [];
  for (let i = 0; i < 12; i++) {
    const at = wordSchedule?.dueAt ?? Date.UTC(2026, 0, 1);
    const attempt: PracticeAttempt = { id: 'word-' + i, sessionId: 'word', itemId: reviewed.targetItemId, language: 'ja-JP',
      choiceIds: [reviewed.targetItemId, 'other'], selectedId: reviewed.targetItemId, correct: true, startedAt: at, answeredAt: at, responseMs: 0,
      context: { phase: i ? 'review' : 'lesson', exercise: 'audio-picture', recordingSrc: 'audio/fixture.mp3', replays: 0, schedulerVersion } };
    history.push(attempt); wordSchedule = await advanceSchedule(wordSchedule, attempt);
    if (i && wordSchedule.dueAt - at > 7 * 86400000) break;
  }
  const recording = media.contexts.find((entry: { contextId: string }) => entry.contextId === reviewed.id).recordings[0];
  const question = reviewed.questions[0]!;
  const at = wordSchedule!.lastReviewedAt + 60_000;
  history.push({ id: 'context-lesson', sessionId: 'lesson', itemId: reviewed.targetItemId, language: 'ja-JP',
    choiceIds: question.options.map(option => option.id), selectedId: question.correctOptionId, correct: true, startedAt: at, answeredAt: at, responseMs: 0,
    context: { phase: 'lesson', exercise: 'context-simple-text', recordingSrc: recording.sentenceSrc, replays: 0, schedulerVersion,
      contextual: { stage: 'simple', contextId: reviewed.id, contextRevision: reviewed.revision, questionId: question.id, questionRevision: question.revision,
        kind: question.kind, correctOptionId: question.correctOptionId, sentenceSrc: recording.sentenceSrc, questionSrc: recording.questionSrcs[question.id] } } });
  const contextSchedule = await advanceSchedule(undefined, history.at(-1)!);
  const reviewAt = contextSchedule.dueAt + 1000;
  expect(wordSchedule!.dueAt).toBeGreaterThan(reviewAt);
  await page.clock.install({ time: new Date(reviewAt) });
  await page.goto('./'); await stored(page, history); await page.reload();
  expect(await deriveContextualUnlocks(history, 'ja-JP')).toContain(JSON.stringify(['ja-JP', reviewed.targetItemId, 'context-simple-text']));
  expect((await deriveSchedules(history, 'ja-JP')).filter(schedule => schedule.dueAt <= reviewAt).map(schedule => schedule.exercise)).toEqual(['context-simple-text']);
  expect((await stored(page)).length).toBe(history.length);
  expect(Math.abs(await page.evaluate(() => Date.now()) - reviewAt)).toBeLessThan(5000);
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.getByRole('button', { name: 'Begin review' }).click();
  const quiz = page.locator('.contextual-quiz');
  const id = await quiz.getAttribute('data-question-id');
  const authored = allQuestions.find(question => question.id === id)!;
  const correct = authored.options.find(option => option.id === authored.correctOptionId)!;
  await expect(page.getByRole('heading', { name: 'Sentence', exact: true })).toHaveCount(0);
  await expect(quiz.getByRole('button', { name: /Choose writing/ })).toHaveCount(4);
  await page.getByRole('button', { name: 'Choose writing お茶', exact: true }).click();
  await expect.poll(async () => (await stored(page)).length).toBe(history.length + 1);
  const miss = (await stored(page)).find(attempt => !history.some(old => old.id === attempt.id))!;
  expect(miss.itemId).toBe(reviewed.targetItemId);
  expect(miss.context!.exercise).toBe('context-simple-text');
  expect(miss.context!.contextual!.questionId).toBe(id);
  expect(miss.context!.contextual!.questionRevision).toBe(2);
  expect(miss.choiceIds).toHaveLength(4);
  expect(miss.choiceIds).toContain('tea');
  expect(miss.selectedId).toBe('tea');
  expect(miss.correct).toBe(false);
  await page.clock.fastForward(10000);
  await expect(quiz).toHaveAttribute('data-question-id', id!);
  await expect(quiz.locator('.contextual-transcript:visible')).toHaveCount(0);
  const japanese = page.getByRole('button', { name: 'Show Japanese', exact: true });
  await japanese.click();
  const details = page.getByRole('dialog', { name: 'Japanese', exact: true });
  await expect(details.getByText(authored.prompt.text, { exact: true })).toBeVisible();
  await expect(details.getByText(authored.prompt.meaning, { exact: true })).toBeHidden();
  const initialDetailsBounds = await details.boundingBox();
      await details.getByRole('button', { name: 'Show English', exact: true }).click();
      expect(await details.boundingBox()).toEqual(initialDetailsBounds);
  await expect(details.getByText(authored.prompt.meaning, { exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'Close Japanese', exact: true }).click();
  await expect(japanese).toBeFocused();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(quiz).toHaveAttribute('data-question-id', id!);
  await page.getByRole('button', { name: /Choose writing/ }).filter({ has: page.getByText(correct.text, { exact: true }) }).click();
  await expect.poll(async () => (await stored(page)).length).toBe(history.length + 2);
  const retry = (await stored(page)).find(attempt => attempt.context?.retryOf === miss.id)!;
  expect(retry.context!.contextual).toEqual(miss.context!.contextual);
  expect(retry.context!.recordingSrc).toBe(miss.context!.recordingSrc);
  expect(retry.correct).toBe(true);
  expect([...retry.choiceIds].sort()).toEqual([...miss.choiceIds].sort());
  await expect(quiz.locator('.contextual-transcript')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show Japanese', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
  await page.clock.fastForward(1500);
  await expect(page.getByRole('heading', { name: 'Nice reviewing!' })).toBeVisible();
  await page.reload();
  const saved = await stored(page);
  expect(saved).toHaveLength(history.length + 2);
  for (const original of history) expect(saved.find(attempt => attempt.id === original.id)).toEqual(original);
});


test('every contextual writing and picture question renders exactly four usable choices', async ({ page }) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  await page.goto('./?review=contextual');
  const jump = page.getByLabel('Jump to question');
  const quiz = page.locator('.contextual-quiz');
  for (const format of ['text', 'picture'] as const) {
    await page.getByRole('combobox', { name: 'Answer format', exact: true }).selectOption(format);
    const count = allQuestions.filter(question => question.formats.includes(format)).length;
    await expect(jump.locator('option')).toHaveCount(count);
    for (let index = 0; index < count; index++) {
      await jump.selectOption(String(index));
      const choices = quiz.getByRole('button', { name: format === 'picture' ? /Choose picture/ : /Choose writing/ });
      await expect(choices).toHaveCount(4);
      if (format === 'picture') await expect.poll(() => choices.locator('img').evaluateAll(images =>
        images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    }
  }
});
