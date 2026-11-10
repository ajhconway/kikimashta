import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import type { ContextualBank } from '../src/content/contextual-types';
import type { PracticeAttempt } from '../src/types';
import { advanceSchedule, deriveSchedules, schedulerVersion, type ScheduledWord } from '../src/core/scheduler';
import { deriveContextualUnlocks } from '../src/core/contextual-progression';
import { withAnswerAmendments, type ContextualAnswerAmendments } from '../src/content/contextual-answers';
import answerAmendments from '../content/contextual/answer-amendments.json' with { type: 'json' };

// Expected answers/revisions include the shipped four-choice amendments, while
// approved speech inputs retain their original authored revisions.
const banks = withAnswerAmendments(['ja-pilot.json', 'ja-simple-pilot.json', 'ja-simple-expansion.json'].map(file =>
  JSON.parse(readFileSync(new URL('../content/contextual/' + file, import.meta.url), 'utf8')) as ContextualBank), answerAmendments as ContextualAnswerAmendments);
const contexts = banks.flatMap(bank => bank.contexts);
const allQuestions = contexts.flatMap(context => context.questions);
const media = JSON.parse(readFileSync(new URL('../content/contextual/accepted-media.json', import.meta.url), 'utf8'));


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

async function unlockedWordHistory(itemId: string) {
  let schedule: ScheduledWord | undefined;
  const history: PracticeAttempt[] = [];
  for (let i = 0; i < 12; i++) {
    const at = schedule?.dueAt ?? Date.UTC(2026, 0, 1);
    const attempt: PracticeAttempt = { id: 'word-' + i, sessionId: 'word', itemId, language: 'ja-JP',
      choiceIds: [itemId, 'other'], selectedId: itemId, correct: true, startedAt: at, answeredAt: at, responseMs: 0,
      context: { phase: i ? 'review' : 'lesson', exercise: 'audio-picture', recordingSrc: 'audio/fixture.mp3', replays: 0, schedulerVersion } };
    history.push(attempt); schedule = await advanceSchedule(schedule, attempt);
    if (i && schedule.dueAt - at > 7 * 86400000) break;
  }
  return { history, schedule: schedule! };
}

test('contextual first encounters retain explicit retry answers and restore their scheduled card after reload', async ({ page }) => {
  test.setTimeout(60000);
  const reviewed = contexts.find(context => context.id === 'ja-ctx-simple-mizu-01')!;
  const { history, schedule: wordSchedule } = await unlockedWordHistory(reviewed.targetItemId);
  const startAt = wordSchedule.lastReviewedAt + 60_000;
  await page.addInitScript(() => {
    Math.random = () => 0;
    localStorage.setItem('kikimashta-card-packs-v1', JSON.stringify(['ja-wanikani-2-writing']));
  });
  await page.clock.install({ time: new Date(startAt) });
  await page.goto('./'); await stored(page, history); await page.reload();
  await expect(page.getByRole('link', { name: 'Card library · 1 pack selected' })).toBeVisible();
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByRole('button', { name: 'Begin lesson', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Begin review', exact: true }).click();
  const quiz = page.locator('.contextual-quiz');
  await expect(page.locator('.contextual-practice')).toHaveAttribute('data-exercise', 'context-simple-text');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1');
  await expect(page.locator('.preview')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sentence', exact: true })).toHaveCount(0);
  await expect(quiz.getByRole('button', { name: /Choose writing/ })).toHaveCount(4);
  await expect(quiz.locator('.contextual-transcript')).toHaveCount(0);
  const questionId = (await quiz.getAttribute('data-question-id'))!;
  const question = allQuestions.find(question => question.id === questionId)!;
  const correct = question.options.find(option => option.id === question.correctOptionId)!;
  const replay = quiz.getByRole('button', { name: 'Replay sentence and question', exact: true });
  const audio = quiz.locator('audio');
  await replay.click();
  await expect(audio).toHaveAttribute('src', /sentence\.mp3$/);
  const sentenceSrc = (await audio.getAttribute('src'))!;
  const recording = media.contexts.flatMap((entry: { recordings: { sentenceSrc: string; questionSrcs: Record<string, string> }[] }) => entry.recordings)
    .find((recording: { sentenceSrc: string }) => sentenceSrc === '/' + recording.sentenceSrc)!;
  const questionSrc = '/' + recording.questionSrcs[questionId];
  await expect(audio).toHaveAttribute('src', questionSrc, { timeout: 15000 });
  await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).ended), { intervals: [50] }).toBe(true);
  await quiz.getByRole('button', { name: 'Choose writing お茶', exact: true }).click();
  await expect.poll(async () => (await stored(page)).length).toBe(history.length + 1);
  const miss = (await stored(page)).find(attempt => !history.some(original => original.id === attempt.id))!;
  expect(miss.itemId).toBe(reviewed.targetItemId);
  expect(miss.correct).toBe(false);
  expect(miss.context!.exercise).toBe('context-simple-text');
  expect(miss.context!.phase).toBe('lesson');
  expect(miss.context!.retryOf).toBeUndefined();
  expect(miss.context!.contextual!.questionId).toBe(questionId);
  expect(miss.context!.contextual!.questionRevision).toBe(question.revision);
  expect(miss.choiceIds).toHaveLength(4);
  expect(miss.choiceIds).toContain('tea');
  expect(miss.selectedId).toBe('tea');
  expect(miss.context!.contextual!.sentenceSrc).toBe(sentenceSrc.slice(1));
  expect(miss.context!.contextual!.questionSrc).toBe(questionSrc.slice(1));
  await page.clock.fastForward(10000);
  await expect(quiz).toHaveAttribute('data-question-id', questionId);
  await expect(quiz.locator('.contextual-transcript:visible')).toHaveCount(0);
  const japanese = quiz.getByRole('button', { name: 'Show Japanese', exact: true });
  await japanese.click();
  const details = page.getByRole('dialog', { name: 'Japanese', exact: true });
  await expect(details.getByText(question.prompt.text, { exact: true })).toBeVisible();
  await expect(details.getByText(question.prompt.meaning, { exact: true })).toBeHidden();
  const detailsBounds = await details.boundingBox();
  await details.getByRole('button', { name: 'Show English', exact: true }).click();
  await expect(details.getByText(question.prompt.meaning, { exact: true })).toBeVisible();
  expect(await details.boundingBox()).toEqual(detailsBounds);
  await details.getByRole('button', { name: 'Close Japanese', exact: true }).click();
  await expect(japanese).toBeFocused();
  await quiz.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(quiz).toHaveAttribute('data-question-id', questionId);
  // The first pass already completed the native sentence/question pair. Retry
  // identity is observable without listening to that complete pair a second time.
  await expect(audio).toHaveAttribute('src', sentenceSrc);
  await quiz.getByRole('button', { name: 'Choose writing ' + correct.text, exact: true }).click();
  await expect.poll(async () => (await stored(page)).length).toBe(history.length + 2);
  const introduced = await stored(page);
  const retry = introduced.find(attempt => attempt.context?.retryOf === miss.id)!;
  expect(retry.correct).toBe(true);
  expect(retry.context!.phase).toBe('lesson');
  expect(retry.context!.contextual).toEqual(miss.context!.contextual);
  expect(retry.context!.recordingSrc).toBe(miss.context!.recordingSrc);
  expect([...retry.choiceIds].sort()).toEqual([...miss.choiceIds].sort());
  await expect(quiz.locator('.contextual-transcript')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show Japanese', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
  const initialized = (await deriveSchedules(introduced, 'ja-JP')).find(card => card.exercise === 'context-simple-text')!;
  expect(initialized.lastReviewedAt).toBe(miss.answeredAt);
  expect(await deriveContextualUnlocks(introduced, 'ja-JP')).not.toContain(JSON.stringify(['ja-JP', reviewed.targetItemId, 'context-contrastive-text']));
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await page.reload();
  expect(await stored(page)).toEqual(introduced);
  for (const original of history) expect(introduced.find(attempt => attempt.id === original.id)).toEqual(original);

  await page.clock.setSystemTime(new Date(initialized.dueAt + 1000));
  await page.reload();
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.getByRole('button', { name: 'Begin review', exact: true }).click();
  await expect(page.locator('.contextual-practice')).toHaveAttribute('data-exercise', 'context-simple-text');
  await expect(quiz.locator('.contextual-transcript')).toHaveCount(0);
  const laterId = (await quiz.getAttribute('data-question-id'))!;
  const laterQuestion = allQuestions.find(question => question.id === laterId)!;
  expect(laterQuestion).toBeDefined();
  expect(await stored(page)).toEqual(introduced);
});
