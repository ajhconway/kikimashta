import { selectWordPractice } from './practice-selection';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { advanceSchedule } from '../src/core/scheduler';
import { quizTimeLimit } from '../src/core/quiz-timer';
import type { Exercise, PracticeAttempt, WordItem } from '../src/types';

const catalogue = JSON.parse(readFileSync(new URL('../content/catalog/ja.json', import.meta.url), 'utf8')) as { items: WordItem[] };
const target = catalogue.items.find(item => item.id === 'ja-dog')!;
test.beforeEach(async ({ page }) => { await selectWordPractice(page, ['ja-wanikani-2-pictures', 'ja-wanikani-2-writing']); });

async function history(page: Page): Promise<PracticeAttempt[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<PracticeAttempt[]>((resolve, reject) => {
        const request = db.transaction('attempts').objectStore('attempts').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
}

for (const [exercise, reducedMotion] of [
  ['audio-picture', false], ['audio-text', false], ['audio-picture', true],
] as const) {
  test(`late ${exercise} answer completes with partial feedback and persists${reducedMotion ? ' with reduced motion' : ''}`, async ({ page }) => {
    if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
    const first: PracticeAttempt = {
      id: 'learn', sessionId: 'seed', itemId: target.id, language: target.language,
      choiceIds: [target.id], selectedId: target.id, correct: true,
      startedAt: Date.now() - 30 * 86_400_000, answeredAt: Date.now() - 30 * 86_400_000, responseMs: 0,
      context: { phase: 'lesson', exercise: exercise as Exercise, recordingSrc: target.audio[0]!.src, replays: 0, schedulerVersion: 'fsrs-6-v1' },
    };
    const learning = await advanceSchedule(undefined, first);
    const second = { ...first, id: 'graduate', startedAt: learning.dueAt, answeredAt: learning.dueAt };
    const limit = quizTimeLimit(await advanceSchedule(learning, second))!;
    expect(limit).toBeGreaterThan(0);
    await page.clock.install();
    await page.goto('./');
    await page.evaluate(async attempts => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('kikimashta-v0', 1);
        request.onupgradeneeded = () => { const store = request.result.createObjectStore('attempts', { keyPath: 'id' }); store.createIndex('language', 'language'); };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        const tx = db.transaction('attempts', 'readwrite');
        attempts.forEach(attempt => tx.objectStore('attempts').put(attempt));
        await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
      } finally { db.close(); }
    }, [first, second]);
    await page.reload();
    await page.getByRole('button', { name: /^start/i }).click();
    await page.getByRole('button', { name: /begin review/i }).click();
    const fill = page.locator('.quiz-timer-fill');
    await expect(fill).toBeAttached();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.clock.runFor(limit / 2);
    const smooth = await fill.evaluate(element => {
      const animations = element.getAnimations();
      if (animations.length !== 1) throw new Error('The timer needs one native animation.');
      const animation = animations[0]!;
      const timing = animation.effect!.getTiming();
      animation.pause();
      const samples = [0, 10, 20, 30].map(time => {
        animation.currentTime = time;
        return new DOMMatrix(getComputedStyle(element).transform).d;
      });
      animation.currentTime = Number(timing.duration) / 2;
      return { duration: timing.duration, easing: timing.easing, samples };
    });
    expect(smooth.duration).toBe(limit);
    expect(smooth.easing).toBe('linear');
    for (let i = 1; i < smooth.samples.length; i++) {
      expect(smooth.samples[i]).toBeGreaterThan(smooth.samples[i - 1]!);
    }
    const halfway = await fill.evaluate(element => ({ fraction: new DOMMatrix(getComputedStyle(element).transform).d,
      origin: getComputedStyle(element).transformOrigin, color: getComputedStyle(element).backgroundColor }));
    expect(halfway.fraction).toBeCloseTo(.5, 5);
    expect(halfway.origin).toMatch(/ 0px$/);
    expect(halfway.color).toBe('rgb(255, 219, 153)');
    const caughtUp = await fill.evaluate(element => {
      const animation = element.getAnimations()[0]!;
      animation.currentTime = 0;
      document.dispatchEvent(new Event('visibilitychange'));
      return Number(animation.currentTime);
    });
    expect(caughtUp).toBeGreaterThanOrEqual(limit / 2);
    expect(caughtUp).toBeLessThan(limit);

    await page.getByRole('button', { name: 'Replay word' }).click();
    await page.clock.runFor(limit / 2);
    await expect(fill).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await expect(page.getByText(/correct answer still counts as partial success/i)).toBeAttached();
    expect(await history(page)).toHaveLength(2);
    const answer = exercise === 'audio-text'
      ? page.getByRole('button', { name: 'Choose writing ' + target.text, exact: true })
      : page.getByRole('button', { name: /choose picture/i }).filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) });
    await expect(answer).toBeEnabled();
    await answer.click();
    await expect(page.locator('.app')).toHaveAttribute('data-answer', 'partial');
    await expect(page.getByLabel('Partial success', { exact: true })).toBeVisible();
    await expect(page.locator('.quiz-starburst')).toHaveCount(0);
    const motion = await page.locator('.answer-choice.partial').evaluate(element => element.getAnimations().filter(a => a instanceof CSSAnimation).map(a => (a as CSSAnimation).animationName));
    expect(motion).toEqual(reducedMotion ? [] : ['partial-wobble']);
    const drifting = page.locator('.departing-card[data-exit="drift"]');
    await expect(drifting).toHaveCount(3);
    if (reducedMotion) {
      await expect(page.locator('.answer-departures')).toBeHidden();
    } else {
      const departures = await drifting.first().evaluate(element => {
        const animations = element.getAnimations().filter(a => a instanceof CSSAnimation);
        const names = animations.map(a => (a as CSSAnimation).animationName).sort();
        const durations = animations.map(a => Number(a.effect!.getComputedTiming().duration));
        animations.forEach(a => a.pause());
        const samples = [0, 275, 550, 825, 1100].map(time => {
          animations.forEach(a => { a.currentTime = time; });
          const style = getComputedStyle(element);
          const transform = new DOMMatrix(style.transform);
          const gravity = Number.parseFloat(style.translate.split(' ')[1] ?? '0');
          return { x: transform.e, gravity, opacity: Number(style.opacity) };
        });
        const flyX = Number.parseFloat((element as HTMLElement).style.getPropertyValue('--fly-x'));
        animations.forEach(a => a.play());
        return { names, durations, samples, flyX };
      });
      expect(departures.names).toEqual(['card-drift-down', 'card-drift-out']);
      for (const duration of departures.durations) {
        expect(duration).toBeGreaterThan(800);
        expect(duration).toBeLessThanOrEqual(1200);
      }
      expect(departures.samples[0]).toMatchObject({ x: 0, gravity: 0, opacity: 1 });
      expect(departures.samples[1]!.x * departures.flyX).toBeGreaterThan(0);
      const falls = departures.samples.map(sample => sample.gravity);
      expect(falls[4]! - falls[3]!).toBeGreaterThan(falls[1]! - falls[0]!);
      expect(departures.samples[4]!.opacity).toBe(0);
    }

    await expect.poll(async () => (await history(page)).length).toBe(3);
    const saved = await history(page);
    const partial = saved.find(attempt => attempt.outcome === 'partial')!;
    expect(partial).toMatchObject({ correct: true, timer: { limitMs: limit }, context: { replays: 1, exercise, schedulerVersion: 'fsrs-6-v2' } });
    expect(partial.answeredAt - partial.timer!.startedAt).toBeGreaterThanOrEqual(limit);
    await expect.poll(() => page.locator('audio').evaluate(element => (element as HTMLAudioElement).ended)).toBe(true);
    await expect(page.getByRole('button', { name: 'Replay word' })).toHaveText('Replay');
    await expect(page.locator('.feedback').getByText('Saving…', { exact: true })).toHaveCount(0);
    await page.clock.fastForward(1200);
    await expect(page.getByRole('heading', { name: 'Nice reviewing!' })).toBeVisible();
    await expect(page.getByText('1 partial success', { exact: true })).toBeVisible();
    await page.clock.resume();
    await page.reload();
    expect(await history(page)).toEqual(saved);
  });
}

test('Dev review offers a random timer with simulated mastery and keeps partial success unsaved', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => .9; });
  await page.clock.install();
  await page.goto('./');
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  await page.getByLabel('Questions', { exact: true }).selectOption('6');
  await page.getByLabel('Timer behavior', { exact: true }).selectOption('random');
  await page.getByRole('button', { name: 'Start dev review', exact: true }).click();
  await expect(page.getByText('1.5 second timer started.', { exact: true })).toBeAttached();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.clock.runFor(3000);
  await expect(page.getByText(/correct answer still counts as partial success/i)).toBeAttached();
  const source = await page.locator('audio').getAttribute('src');
  const heard = catalogue.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  expect(heard).toBeDefined();
  const exercise = await page.locator('.quiz').getAttribute('data-exercise');
  const answer = exercise === 'audio-text'
    ? page.getByRole('button', { name: 'Choose writing ' + heard.text, exact: true })
    : page.getByRole('button', { name: /choose picture/i }).filter({ has: page.getByRole('img', { name: heard.image.alt, exact: true }) });
  await answer.click();
  await expect(page.getByLabel('Partial success', { exact: true })).toBeVisible();
  expect(await history(page)).toEqual([]);
  await expect(page.getByRole('button', { name: 'Replay word' })).toHaveText('Replay');
  await page.clock.fastForward(1200);
  await expect(page.locator('.app')).not.toHaveAttribute('data-answer', 'partial');
  await page.clock.resume();
  await page.getByRole('button', { name: 'Kikimashta home' }).click();
  await page.reload();
  expect(await history(page)).toEqual([]);
});
