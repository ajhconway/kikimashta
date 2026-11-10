import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import type { ContextualBank } from '../src/content/contextual-types';
import type { PracticeAttempt } from '../src/types';

const bank = JSON.parse(readFileSync(new URL('../content/contextual/ja-simple-pilot.json', import.meta.url), 'utf8')) as ContextualBank;
const context = bank.contexts.find(context => context.id === 'ja-ctx-simple-ue-01')!;
const question = context.questions.find(question => question.kind === 'target')!;
const accepted = JSON.parse(readFileSync(new URL('../content/contextual/accepted-media.json', import.meta.url), 'utf8')) as {
  contexts: { contextId: string; recordings: { voice: string; sentenceSrc: string; questionSrcs: Record<string, string> }[] }[];
};
const recording = accepted.contexts.find(entry => entry.contextId === context.id)!.recordings.find(recording => recording.voice === 'otani')!;

interface MediaState {
  last: HTMLMediaElement | null;
}
type ObservedWindow = Window & { contextualMedia: MediaState };

async function observeNativeMedia(page: Page) {
  await page.addInitScript(() => {
    const state: MediaState = { last: null };
    (window as unknown as ObservedWindow).contextualMedia = state;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      state.last = this;
      // Observe the native decoder/events/clock without substituting playback.
      return play.call(this);
    };
  });
}

async function history(page: Page, incoming?: PracticeAttempt[]) {
  return page.evaluate(async incoming => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (incoming) await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('attempts', 'readwrite');
        incoming.forEach(attempt => tx.objectStore('attempts').put(attempt));
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
      return await new Promise<PracticeAttempt[]>((resolve, reject) => {
        const request = db.transaction('attempts').objectStore('attempts').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, incoming);
}

test('contextual library redirects old links, retries native audio and cancels on navigation without saving', async ({ page }) => {
  test.setTimeout(60000);
  await observeNativeMedia(page);
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeEnabled();
  const baseline: PracticeAttempt[] = [{ id: 'before-contextual-library', sessionId: 'legacy', itemId: context.targetItemId, language: 'ja-JP',
    choiceIds: [context.targetItemId], selectedId: context.targetItemId, correct: true, startedAt: 1000, answeredAt: 2000, responseMs: 1000 }];
  await history(page, baseline);
  await page.goto('./?review=contextual');
  await expect(page).toHaveURL(/\/vocabulary\/\?.*view=contextual/);
  const views = page.getByRole('group', { name: 'Library content', exact: true });
  const words = views.getByRole('button', { name: 'Words', exact: true });
  const contextual = views.getByRole('button', { name: 'Contextual questions', exact: true });
  await expect(contextual).toHaveAttribute('aria-pressed', 'true');
  await expect(words).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(contextual).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: '← Listening practice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'kikimashta', exact: true })).toBeVisible();
  await page.goBack();
  await expect(contextual).toHaveAttribute('aria-pressed', 'true');
  const gallery = page.locator('#contextual-library');
  await gallery.getByRole('combobox', { name: 'Context stage', exact: true }).selectOption('simple');
  await gallery.getByRole('combobox', { name: 'Context target', exact: true }).selectOption(context.targetItemId);
  await gallery.getByRole('combobox', { name: 'Question kind', exact: true }).selectOption('target');
  await gallery.getByRole('combobox', { name: 'Answer format', exact: true }).selectOption('picture');
  await gallery.getByRole('combobox', { name: 'Context voice', exact: true }).selectOption('otani');
  await gallery.getByRole('searchbox', { name: 'Search contexts', exact: true }).fill(context.sentence.text);
  const card = gallery.locator(`article[data-question-id="${question.id}"]`);
  await expect(card).toBeVisible();
  await expect(card).toContainText(context.sentence.text);
  await expect(card).toContainText(context.sentence.meaning);
  await expect(card).toContainText(question.prompt.text);
  await expect(card).toContainText(question.prompt.meaning);
  await expect(card.getByRole('img')).toHaveCount(4);
  await expect.poll(() => card.getByRole('img').evaluateAll(images => images.every(image =>
    (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(card.getByRole('listitem')).toHaveCount(4);
  await expect(card.getByText('Correct answer', { exact: true })).toHaveCount(1);
  for (const option of question.options) {
    await expect(card).toContainText(option.text);
    await expect(card).toContainText(option.meaning);
  }
  const play = card.getByRole('button', { name: `Play Otani: ${question.id}`, exact: true });
  const unavailable = '**/' + recording.sentenceSrc;
  await page.route(unavailable, route => route.abort());
  await play.click();
  await expect(gallery.getByRole('alert')).toBeVisible({ timeout: 20000 });
  await expect(gallery.getByRole('alert')).toContainText(/replay|retry/i);
  await page.unroute(unavailable);
  await play.click();
  await expect(gallery.getByRole('alert')).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as unknown as ObservedWindow).contextualMedia.last?.currentTime ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as ObservedWindow).contextualMedia.last?.paused)).toBe(false);
  await words.click();
  await expect(words).toHaveAttribute('aria-pressed', 'true');
  await expect(gallery).toBeHidden();
  await expect(page.getByLabel('Search words', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as ObservedWindow).contextualMedia.last?.paused)).toBe(true);
  expect(await history(page)).toEqual(baseline);
  await page.reload();
  await expect(words).toHaveAttribute('aria-pressed', 'true');
  expect(await history(page)).toEqual(baseline);
});
