import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import type { ContextualBank, ContextualOption } from '../src/content/contextual-types';
import type { Exercise, PracticeAttempt, WordItem } from '../src/types';

const banks = ['ja-pilot.json', 'ja-simple-pilot.json', 'ja-simple-expansion.json'].map(file =>
  JSON.parse(readFileSync(new URL('../content/contextual/' + file, import.meta.url), 'utf8')) as ContextualBank);
const authored = banks.flatMap(bank => bank.contexts.flatMap(context => context.questions.map(question => ({ context, question }))));
const media = JSON.parse(readFileSync(new URL('../content/contextual/accepted-media.json', import.meta.url), 'utf8')) as {
  contexts: { contextId: string; recordings: { sentenceSrc: string; questionSrcs: Record<string, string> }[] }[];
};
const catalogue = JSON.parse(readFileSync(new URL('../content/catalog/ja.json', import.meta.url), 'utf8')) as { items: WordItem[] };
const overrides = JSON.parse(readFileSync(new URL('../content/catalog/review-overrides.json', import.meta.url), 'utf8')) as Record<string, Partial<WordItem>>;
const words = new Map(catalogue.items.map(word => [word.id, { ...word, ...overrides[word.id] }]));

async function stored(page: Page, incoming?: PracticeAttempt[]): Promise<PracticeAttempt[]> {
  return page.evaluate(async attempts => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('attempts', { keyPath: 'id' }).createIndex('language', 'language'); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      if (attempts) await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('attempts', 'readwrite');
        attempts.forEach(attempt => tx.objectStore('attempts').put(attempt));
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
      return await new Promise<PracticeAttempt[]>((resolve, reject) => {
        const request = db.transaction('attempts').objectStore('attempts').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, incoming);
}

function choice(page: Page, option: ContextualOption, exercise: Exercise) {
  const quiz = page.locator('.contextual-quiz');
  if (exercise.endsWith('text')) return quiz.getByRole('button', { name: 'Choose writing ' + option.text, exact: true });
  return quiz.getByRole('button', { name: /Choose picture/ }).filter({
    has: page.getByRole('img', { name: words.get(option.imageItemId!)!.image.alt, exact: true }),
  });
}

test('contextual practice demo uses real session feedback and retries without changing guest history', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem('kikimashta-card-packs-v1', '[]');
    Math.random = () => 0;
  });
  await page.clock.install();
  await page.goto('./');
  const baseline: PracticeAttempt[] = [{ id: 'before-contextual-demo', sessionId: 'legacy', itemId: authored[0]!.context.targetItemId,
    language: 'ja-JP', choiceIds: ['a', 'b'], selectedId: 'a', correct: true, startedAt: 1, answeredAt: 2, responseMs: 1 }];
  await stored(page, baseline);
  await expect(page.getByRole('button', { name: /^Start/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Contextual practice demo', exact: true }).click();
  await expect(page.locator('.contextual-practice')).toBeVisible();
  await expect(page.getByText('Practice demo. Progress is not saved.', { exact: true })).toBeVisible();
  await expect(page.locator('.contextual-dev-review')).toHaveCount(0);
  expect(await stored(page)).toEqual(baseline);
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();

  await page.goto('./?demo=contextual');
  await expect(page.getByRole('heading', { name: 'Contextual practice demo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Begin review' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4');
  await expect(page.locator('.contextual-dev-controls, .contextual-dev-jump')).toHaveCount(0);

  let missed: { questionId: string; sentenceSrc: string; questionSrc: string } | undefined;
  const presentations = [
    { exercise: 'context-simple-picture', kind: 'target', miss: true },
    { exercise: 'context-simple-text', kind: 'detail', miss: false },
    { exercise: 'context-simple-picture', kind: 'target', miss: false, retry: true },
    { exercise: 'context-contrastive-picture', kind: 'target', miss: false },
    { exercise: 'context-contrastive-text', kind: 'detail', miss: false },
  ] as const;
  for (const [index, presentation] of presentations.entries()) {
    const exercise = presentation.exercise;
    const quiz = page.locator('.contextual-quiz');
    await expect(page.locator('.contextual-practice')).toHaveAttribute('data-exercise', exercise);
    await expect(page.locator('.quiz-timer-fill')).toHaveCount(0);
    const questionId = (await quiz.getAttribute('data-question-id'))!;
    const { context, question } = authored.find(entry => entry.question.id === questionId)!;
    expect(question.kind).toBe(presentation.kind);
    const audio = quiz.locator('audio');
    await quiz.getByRole('button', { name: 'Replay sentence and question', exact: true }).click();
    await expect(audio).toHaveAttribute('src', /sentence\.mp3$/);
    const source = (await audio.getAttribute('src'))!;
    const recording = media.contexts.find(entry => entry.contextId === context.id)!.recordings
      .find(recording => source.endsWith(recording.sentenceSrc))!;
    expect(recording).toBeDefined();
    const snapshot = { questionId, sentenceSrc: recording.sentenceSrc, questionSrc: recording.questionSrcs[questionId]! };
    if (index === 0) {
      missed = snapshot;
      await expect(audio).toHaveAttribute('src', '/' + snapshot.questionSrc, { timeout: 15000 });
      await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).ended)).toBe(true);
    }
    if ('retry' in presentation) expect(snapshot).toEqual(missed);
    await expect(page.getByRole('heading', { name: 'Sentence', exact: true })).toHaveCount(0);
    const option = question.options.find(option => presentation.miss ? option.id !== question.correctOptionId : option.id === question.correctOptionId)!;
    await choice(page, option, exercise).click();
    await expect(page.getByText(presentation.miss ? 'Keep going' : 'Correct', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sentence', exact: true })).toBeVisible();
    await expect(page.getByText(question.prompt.meaning, { exact: true })).toBeVisible();
    await page.clock.fastForward(10000);
    await expect(quiz).toHaveAttribute('data-question-id', questionId);
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
    expect(await stored(page)).toEqual(baseline);
    if (index === 0) await page.evaluate(() => { Math.random = () => .99; });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Contextual practice demo complete', exact: true })).toBeVisible();
  expect(await stored(page)).toEqual(baseline);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'kikimashta', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Start/ })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Contextual practice demo', exact: true })).toBeVisible();
  expect(await stored(page)).toEqual(baseline);
});
