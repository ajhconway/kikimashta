import { expectReadableHomeText } from './contrast';
import { expect, test, type Page } from './fixtures';
import { readFileSync } from 'node:fs';
import starter from '../content/ja.json' with { type: 'json' };
import pool from '../content/practice-pool.json' with { type: 'json' };
import type { Exercise, WordItem } from '../src/types';

const catalogue = JSON.parse(readFileSync(new URL('../content/catalog/ja.json', import.meta.url), 'utf8')) as { items: WordItem[] };
const allWords = [...starter.items, ...catalogue.items] as WordItem[];
// Six active WaniKani words keep the existing session journeys bounded.
const bank = { ...starter, items: [
  ...starter.items.filter(item => catalogue.items.some(entry => entry.id === item.id)),
  ...pool.itemIds.slice(0, 4).map(id => catalogue.items.find(item => item.id === id)!),
] as WordItem[] };

async function seedAttempts(page: Page, ids = bank.items.map(item => item.id), exercise?: Exercise) {
  await page.evaluate(async ({ itemIds, exercise }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onupgradeneeded = () => { const store = request.result.createObjectStore('attempts', { keyPath: 'id' }); store.createIndex('language', 'language'); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction('attempts', 'readwrite');
      itemIds.forEach((itemId, i) => transaction.objectStore('attempts').put({ id: 'legacy-' + itemId, sessionId: 'legacy', itemId, language: 'ja-JP', choiceIds: itemIds, selectedId: itemId, correct: true, startedAt: Date.now() - 86_400_000 - i, answeredAt: Date.now() - 86_400_000 - i, responseMs: 0,
        ...(exercise ? { context: { phase: 'lesson', exercise, recordingSrc: 'audio/fixture.mp3', replays: 0, schedulerVersion: 'fsrs-6-v1' } } : {}),
      }));
      await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    } finally { db.close(); }
  }, { itemIds: ids, exercise });
}

async function startReview(page: Page) {
  await page.goto('./'); await seedAttempts(page); await page.reload();
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: /begin review/i }).click();
}

async function savedAttempts(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('kikimashta-v0', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      return await new Promise<{itemId:string; id:string;context?:{phase:string;exercise:string;recordingSrc:string;replays:number;retryOf?:string};correct:boolean;choiceIds:string[]}[]>((resolve, reject) => { const request = db.transaction('attempts').objectStore('attempts').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    } finally { db.close(); }
  });
}

const backgroundColor = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
const screenColor = (page: Page) => page.evaluate(() => document.documentElement.style.getPropertyValue('--screen-background').trim());

async function captureScreen(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  // WebKit rebuilds font faces when screenshot capture temporarily disables CSS
  // animation. Restore only faces that were already loaded before capture.
  const loaded = await page.evaluate(() => Array.from(document.fonts).filter(face => face.status === 'loaded').map(face => ({ family: face.family.replace(/["']/g, ''), weight: face.weight })));
  try {
    await page.screenshot({ path: 'test-results/' + name + '.png', fullPage: true, animations: 'disabled' });
  } finally {
    await page.evaluate(fonts => Promise.all(fonts.map(font => document.fonts.load(`${font.weight} 24px "${font.family}"`, '犬りんご'))), loaded);
  }
}

async function expectCompanionMotion(page: Page) {
  await expect.poll(() => page.locator('.quiz-companion').evaluate(companion => {
    const picture = companion.querySelector('img')!;
    const motions = picture.getAnimations();
    const motion = motions[0];
    const timing = motion?.effect?.getComputedTiming();
    return companion.getAnimations().length === 0 && motions.length === 1
      && motion instanceof CSSAnimation && motion.animationName === 'companion-listen'
      && motion.playState === 'running' && typeof timing?.duration === 'number' && timing.duration >= 2100 && timing.duration <= 2400 && timing.iterations === Infinity;
  }), { message: 'Kiku has one slow image sway and a stationary outer wrapper' }).toBe(true);
}

async function captureCorrectResponse(page: Page, name: string) {
  // Let the ordinary button-press release settle before inspecting feedback motion.
  await expect(page.locator('.choices .picture-choice.correct')).toHaveCSS('transform', 'none');
  const inspection = await page.locator('.app').evaluateHandle(app => {
    const cards = Array.from(app.querySelectorAll<HTMLElement>('.departing-card[data-exit="fly"]')).map(element => {
      const animations = element.getAnimations().filter(animation => animation instanceof CSSAnimation);
      const flight = animations[0];
      if (animations.length !== 1 || !(flight instanceof CSSAnimation) || flight.animationName !== 'card-fly-out') throw new Error('Each outgoing card needs one direct flight.');
      return { element, flight };
    });
    const glow = app.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSAnimation && animation.animationName === 'correct-glow');
    const animations = [...glow, ...Array.from(app.querySelectorAll('.companion-spark, .firework-star')).flatMap(effect => effect.getAnimations()), ...cards.map(card => card.flight)];
    const snapshots = animations.map(animation => ({ animation, time: animation.currentTime, state: animation.playState }));
    for (const animation of animations) { animation.pause(); animation.currentTime = 0; }
    return { snapshots, cards, correct: app.querySelector<HTMLElement>('.choices .picture-choice.correct')!, grid: app.querySelector<HTMLElement>('.choices')! };
  });
  try {
    const motion = await inspection.evaluate(({ cards, correct, grid }) => {
      const center = grid.getBoundingClientRect();
      function transform(element: HTMLElement) {
        const value = getComputedStyle(element).transform;
        const matrix = value === 'none' ? new DOMMatrix() : new DOMMatrix(value);
        return { x: matrix.e, y: matrix.f, a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, opacity: getComputedStyle(element).opacity };
      }
      return {
        correctAnimations: correct.getAnimations().filter(animation => animation instanceof CSSAnimation).length,
        cards: cards.map(({ element, flight }) => {
          const timing = flight.effect!.getComputedTiming();
          // Offset geometry ignores the flight transform. Allow rounding of the
          // layout offsets when comparing the direction at the original radius.
          const radial = { x: element.offsetLeft + element.offsetWidth / 2 - (center.left + center.right) / 2,
            y: element.offsetTop + element.offsetHeight / 2 - (center.top + center.bottom) / 2 };
          const samples = [0, .25, .5, .75, 1].map(fraction => {
            flight.currentTime = Number(timing.duration) * fraction;
            return { moving: transform(element), stationary: transform(correct) };
          });
          return { radial, delay: timing.delay, duration: timing.duration, samples };
        }),
      };
    });
    expect(motion.cards).toHaveLength(3);
    expect(motion.correctAnimations, 'the correct rectangle stays still').toBe(0);
    for (const card of motion.cards) {
      expect(card.delay).toBe(0);
      expect(Number(card.duration)).toBeGreaterThanOrEqual(700);
      expect(Number(card.duration)).toBeLessThanOrEqual(900);
      const distances = card.samples.map(({ moving }) => Math.hypot(moving.x, moving.y));
      expect(distances[0]).toBeLessThan(.1);
      const steps = distances.slice(1).map((distance, i) => distance - distances[i]!);
      for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThan(steps[i - 1]! + 1);
      for (const [i, { moving, stationary }] of card.samples.entries()) {
        expect(stationary).toMatchObject({ x: 0, y: 0, a: 1, b: 0, c: 0, d: 1 });
        expect(moving).toMatchObject({ a: 1, b: 0, c: 0, d: 1, opacity: '1' });
        if (i > 0) {
          expect(moving.x * card.radial.x + moving.y * card.radial.y, 'flight points away from the actual grid center').toBeGreaterThan(0);
          const perpendicular = Math.abs(card.radial.x * moving.y - card.radial.y * moving.x) / distances[i]!;
          expect(perpendicular, 'flight stays radial within layout rounding').toBeLessThan(1);
        }
      }
    }
    await inspection.evaluate(({ snapshots, cards }) => {
      for (const { animation } of snapshots) animation.currentTime = 360;
      for (const { flight } of cards) flight.currentTime = Number(flight.effect!.getComputedTiming().duration) * .35;
    });
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true, animations: 'allow' });
  } finally {
    try {
      await inspection.evaluate(({ snapshots }) => {
        for (const { animation, time, state } of snapshots) {
          animation.currentTime = time;
          if (state === 'finished') animation.finish();
          else animation.play();
        }
      });
    } finally { await inspection.dispose(); }
  }
}

async function captureFallingCards(page: Page, name: string) {
  const departures = await page.locator('.answer-departures').evaluateHandle(layer => {
    const animations = layer.getAnimations({ subtree: true });
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 220;
    }
    return animations;
  });
  try {
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true, animations: 'allow' });
  } finally {
    try {
      await departures.evaluate(animations => animations.forEach(animation => animation.play()));
    } finally {
      await departures.dispose();
    }
  }
}

async function expectAnswerPictures(page: Page, retainedAlts: string[], exit: 'fly' | 'fall') {
  const choices = page.getByRole('button', { name: /choose picture/i });
  const departingCount = 4 - retainedAlts.length;
  await expect(choices).toHaveCount(retainedAlts.length);
  expect(await choices.locator('img').evaluateAll(images => images.map(image => image.getAttribute('alt')).sort())).toEqual([...retainedAlts].sort());
  for (const choice of await choices.all()) {
    await expect(choice).toBeVisible();
    await expect(choice).toBeDisabled();
  }
  await expect(page.locator('.choices .picture-choice:disabled')).toHaveCount(4);
  const hiddenSlots = page.locator('.choices .choice-slot.is-departing[aria-hidden="true"]');
  await expect(hiddenSlots).toHaveCount(departingCount);
  for (const slot of await hiddenSlots.all()) await expect(slot).toBeHidden();
  await expect(page.locator('.answer-departures')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator(`.answer-departures .departing-card[data-exit="${exit}"]`)).toHaveCount(departingCount);
  await expect(page.locator('.answer-departures button')).toHaveCount(0);
  const departedAlts = await page.locator('.answer-departures img').evaluateAll(images => images.map(image => image.getAttribute('alt')));
  expect(new Set(departedAlts).size).toBe(departingCount);
  expect(departedAlts.every(alt => !retainedAlts.includes(alt!))).toBe(true);
}

async function expectDeparturesFinished(page: Page, count: number) {
  // Computed end times include any delay on wrong-answer falls. A paused advance
  // timer must not conceal exits that exceed the earliest 1.2-second advance.
  const timings = await page.locator('.answer-departures').evaluate(layer =>
    Array.from(layer.querySelectorAll('.departing-card'), card => card.getAnimations().map(animation => Number(animation.effect?.getComputedTiming().endTime))),
  );
  expect(timings).toHaveLength(count);
  for (const endTimes of timings) {
    expect(endTimes.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...endTimes), 'every outgoing animation fits within the answer beat').toBeLessThanOrEqual(1200);
  }
  const result = await page.locator('.answer-departures').evaluate(async (layer, expectedCount) => {
    const animations = layer.getAnimations({ subtree: true });
    const results = await Promise.allSettled(animations.map(animation => animation.finished));
    const cards = Array.from(layer.querySelectorAll('.departing-card'));
    return {
      connected: layer.isConnected,
      finished: results.every(result => result.status === 'fulfilled'),
      gone: cards.length === expectedCount && cards.every(card => {
        const style = getComputedStyle(card);
        const box = card.getBoundingClientRect();
        return style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0
          || box.right <= 0 || box.left >= innerWidth || box.bottom <= 0 || box.top >= innerHeight;
      }),
    };
  }, count);
  expect(result, 'outgoing cards finish leaving before the quiz moves on').toEqual({ connected: true, finished: true, gone: true });
}

async function checkMobilePracticeSizes(page: Page, pictureSelector: string, name: string) {
  const original = page.viewportSize()!;
  for (const viewport of [{ width: 390, height: 664 }, { width: 430, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(selector => {
      const app = document.querySelector('.app')!.getBoundingClientRect();
      const picture = document.querySelector(selector)!.getBoundingClientRect();
      const actions = document.querySelector('.practice-actions')!.getBoundingClientRect();
      const action = document.querySelector('.practice-actions .primary')?.getBoundingClientRect() ?? actions;
      const progress = document.querySelector('.quiz .quiz-progress')?.getBoundingClientRect();
      const bottomControl = progress ?? action;
      return Math.abs(app.height - innerHeight) <= 1
        && document.documentElement.scrollHeight <= innerHeight + 1
        && document.documentElement.scrollWidth <= innerWidth
        && picture.width >= innerWidth - 48 && picture.height >= innerHeight * .35
        && bottomControl.bottom <= innerHeight && bottomControl.bottom >= innerHeight - 48
        && (!progress || (picture.bottom <= actions.top + 1 && actions.bottom <= progress.top + 1 && action.bottom <= progress.top + 1));
    }, pictureSelector), { message: 'practice fills the phone viewport with large pictures; quiz feedback sits above bottom progress, and lesson actions stay reachable' }).toBe(true);
    await captureScreen(page, name + '-' + viewport.width);
  }
  await page.setViewportSize(original);
}

async function heardWord(page: Page) {
  await expect(page.getByRole('button', { name: /choose (picture|writing)/i }).first()).toBeEnabled();
  for (const image of await page.locator('img').all()) {
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  const audio = page.locator('audio');
  await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime), {
    message: 'each word plays, including words presented without a new user gesture',
  }).toBeGreaterThan(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const source = await audio.getAttribute('src');
  const target = allWords.find(item => item.audio.some(recording => source?.endsWith(recording.src)));
  expect(target, 'the current recording belongs to the word bank').toBeDefined();
  const exercise = (await page.locator('.quiz').getAttribute('data-exercise'))!;
  return { source: source!, target: target!, exercise, cardId: JSON.stringify([target!.language, target!.id, exercise]) };
}

async function chooseHeardAnswer(page: Page, target: WordItem) {
  const completedBefore = Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'));
  // Session journeys keep native playback and real storage, but skip the answer
  // beat. Detailed motion and the ordinary timer are checked in a focused test.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  try {
    const exercise = await page.locator('.quiz').getAttribute('data-exercise');
    const choice = exercise === 'audio-text'
      ? page.getByRole('button', { name: 'Choose writing ' + target.text, exact: true })
      : page.getByRole('button', { name: /choose picture/i }).filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) });
    await choice.click();
    await expect(page.locator('.feedback')).toHaveText('Got it!');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(completedBefore + 1));
    await expect(page.getByRole('alert')).toHaveCount(0);
    // The app starts the advance timer only after playback and saving finish.
    // Native media is not governed by the Playwright clock.
    await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).ended)).toBe(true);
    await expect(page.getByRole('button', { name: /replay word/i })).toHaveText('Replay');
    await expect(page.locator('.feedback').getByText('Saving…', { exact: true })).toHaveCount(0);
    await page.clock.fastForward(1200);
    await expect(page.locator('.app')).not.toHaveAttribute('data-answer', 'correct');
  } finally {
    await page.clock.resume();
  }
}

async function chooseWithAnimationChecks(page: Page, pressScreenshot: string, responseScreenshot: string) {
  const { target } = await heardWord(page);
  await expectCompanionMotion(page);
  const completedBefore = Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'));
  const beforeAnswer = await page.locator('.choices').evaluate(grid => {
    const bounds = grid.getBoundingClientRect();
    return { pageHeight: document.documentElement.scrollHeight, gridWidth: bounds.width, gridHeight: bounds.height };
  });
  const choice = page.getByRole('button', { name: /choose picture/i }).filter({
    has: page.getByRole('img', { name: target.image.alt, exact: true }),
  });
  // Inspect transient feedback without racing the app's 1.2-second advance timer.
  // CSS animations and native audio keep running; resume timers before waiting
  // for the next question so autoplay and the normal answer delay remain tested.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  try {
    await choice.hover();
    await expect(choice).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const card = await choice.boundingBox();
    expect(card).not.toBeNull();
    await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2);
    await page.mouse.down();
    try {
      await page.screenshot({ path: `test-results/${pressScreenshot}.png`, fullPage: true, animations: 'disabled' });
    } finally {
      // Releasing the real press answers normally while its advance timer is paused.
      await page.mouse.up();
    }
    await expect(page.locator('.feedback')).toHaveText('Got it!');
    // Opaque approved JPEGs must not reveal a rectangle during feedback (#92).
    for (const card of await page.locator('.choices .picture-choice').all()) {
      await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    }
    await expect(choice.locator('.choice-badge')).toHaveText('✓');
    await expect(page.locator('.app')).toHaveAttribute('data-answer', 'correct');
    await expectCompanionMotion(page);
    await expect.poll(() => screenColor(page)).toBe('#e9b6ff');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(completedBefore + 1));
    await expect(page.locator('.progress-bead.is-complete')).toHaveCount(completedBefore + 1);
    await expectAnswerPictures(page, [target.image.alt], 'fly');
    await expect(page.locator('.quiz-starburst')).toHaveAttribute('aria-hidden', 'true');
    await expect.poll(() => page.evaluate(() => {
      const cards = document.querySelector('.choices')!.getBoundingClientRect();
      const burst = document.querySelector('.quiz-starburst svg')!.getBoundingClientRect();
      return Math.abs((cards.left + cards.right - burst.left - burst.right) / 2) <= 1
        && Math.abs((cards.top + cards.bottom - burst.top - burst.bottom) / 2) <= 1;
    }), { message: 'the star firework originates at the center of the card grid' }).toBe(true);
    await expect.poll(() => page.evaluate(before => {
      const choices = document.querySelector('.choices')!.getBoundingClientRect();
      const feedback = document.querySelector('.feedback')!.getBoundingClientRect();
      const cards = Array.from(document.querySelectorAll('.choices .choice-slot:not(.is-departing) .picture-choice'), card => card.getBoundingClientRect());
      return document.documentElement.scrollWidth <= innerWidth
        && document.documentElement.scrollHeight <= before.pageHeight
        && Math.abs(choices.width - before.gridWidth) <= 1 && Math.abs(choices.height - before.gridHeight) <= 1
        && cards.every(card => card.left >= choices.left - 10 && card.right <= choices.right + 10
          && card.bottom <= feedback.top);
    }, beforeAnswer), { message: 'feedback keeps the grid stable; retained pictures fit and departures add no page overflow' }).toBe(true);
    await captureCorrectResponse(page, responseScreenshot);
    // Native CSS animations finish while JavaScript timers remain paused.
    await expectDeparturesFinished(page, 3);
  } finally {
    await page.clock.resume();
  }
}

test('correct feedback finishes its animation, preserves layout, and advances to the next audible word', async ({ page }, testInfo) => {
  await page.clock.install();
  await startReview(page);
  const { source } = await heardWord(page);
  await chooseWithAnimationChecks(page, 'adaptive-pressed-' + testInfo.project.name, 'adaptive-correct-' + testInfo.project.name);
  // Leave the clock running here: exercise the normal answer delay and autoplay
  // rather than advancing timers as the longer session journeys do.
  await expect(page.locator('.app')).not.toHaveAttribute('data-answer', 'correct');
  const nextWord = await heardWord(page);
  expect(nextWord.source).not.toBe(source);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
});

test('learn mixed picture and writing cards, complete their quiz, and retain both after reload', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await page.goto('./');
  await expect(page.getByRole('status', { name: 'Review density' })).toContainText('Minimal');
  await page.waitForFunction(() => Array.from(document.fonts).some(face => face.family.includes('Kikimashta Noto Sans JP') && face.status === 'loaded'));
  const homeColor = await backgroundColor(page);
  await captureScreen(page, 'adaptive-home-' + testInfo.project.name);
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: /begin lesson/i }).click();
  await expect(page.getByRole('heading', { name: /lesson time!/i })).toBeVisible();
  await expect.poll(() => backgroundColor(page)).not.toBe(homeColor);
  if (testInfo.project.use.isMobile) await checkMobilePracticeSizes(page, '.preview-picture', 'adaptive-lesson');
  const introduced: { item: WordItem; exercise: string }[] = [];
  const previewSizes: { length: number; fontSize: number }[] = [];
  for (let i = 0; i < 10; i++) {
    await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
    const source = await page.locator('audio').getAttribute('src');
    const item = allWords.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
    const exercise = (await page.locator('.preview').getAttribute('data-exercise'))!;
    introduced.push({ item, exercise });
    if (exercise === 'audio-picture') {
      const picture = page.locator('.preview-picture img');
      await expect(picture).toHaveAttribute('alt', item.image.alt);
      await expect.poll(() => picture.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    } else {
      await expect(page.locator('.preview-picture img')).toHaveCount(0);
      await expect(page.locator('.preview-picture')).toHaveText(item.text);
      await expect(page.locator('.preview-picture .written-answer')).toHaveAttribute('data-font', 'noto-sans');
      previewSizes.push({ length: Array.from(item.text).length, fontSize: await page.locator('.preview-picture .written-answer').evaluate(label => parseFloat(getComputedStyle(label).fontSize)) });
      if (introduced.filter(card => card.exercise === 'audio-text').length === 1) await captureScreen(page, 'writing-lesson-' + testInfo.project.name);
    }
    await page.getByRole('button', { name: i === 9 ? /mini-quiz/i : /next card/i }).click();
  }
  const singleSizes = previewSizes.filter(sample => sample.length === 1).map(sample => sample.fontSize);
  const longerSizes = previewSizes.filter(sample => sample.length > 1).map(sample => sample.fontSize);
  expect(Math.min(...singleSizes), 'single characters are large in lesson previews').toBeGreaterThan(60);
  expect(Math.min(...singleSizes)).toBeGreaterThan(Math.max(...longerSizes));
  const introducedIds = introduced.map(card => JSON.stringify([card.item.language, card.item.id, card.exercise]));
  expect(new Set(introducedIds).size).toBe(10);
  expect(introduced.filter(card => card.exercise === 'audio-text')).toHaveLength(5);
  expect(introduced.filter(card => card.exercise === 'audio-picture')).toHaveLength(5);
  if (testInfo.project.use.isMobile) await checkMobilePracticeSizes(page, '.choices', 'adaptive-quiz');
  const seen = new Set<string>();
  let writingCaptured = false;
  for (let i = 0; i < 10; i++) {
    await expect(page.getByRole('button', { name: /choose (picture|writing)/i })).toHaveCount(4);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(i));
    const { target, exercise, cardId } = await heardWord(page);
    expect(introducedIds).toContain(cardId);
    expect(seen.has(cardId)).toBe(false); seen.add(cardId);
    await expect(page.locator('.choices img')).toHaveCount(exercise === 'audio-picture' ? 4 : 0);
    if (exercise === 'audio-text') {
      for (const label of await page.locator('.choices .written-answer').all()) await expect(label).toHaveAttribute('data-font', 'noto-sans');
      const writingFits = await page.locator('.choices .written-answer').evaluateAll(labels => labels.every(label => {
        const box = label.getBoundingClientRect();
        const card = label.parentElement!.getBoundingClientRect();
        return box.left >= card.left && box.right <= card.right && box.top >= card.top && box.bottom <= card.bottom;
      }));
      expect(writingFits, 'written options fit their cards').toBe(true);
      if (!writingCaptured) { await captureScreen(page, 'writing-quiz-' + testInfo.project.name); writingCaptured = true; }
    }
    await chooseHeardAnswer(page, target);
  }
  await expect(page.getByRole('heading', { name: /nice round!/i })).toBeVisible();
  await captureScreen(page, 'adaptive-chunk-end-' + testInfo.project.name);
  await expect(page.getByRole('button', { name: /learn more/i })).toBeEnabled();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.reload();
  await expect(page.getByText('10 answers saved on this device')).toBeVisible();
  const saved = await savedAttempts(page);
  expect(saved.map(attempt => JSON.stringify([bank.language, attempt.itemId, attempt.context?.exercise])).sort()).toEqual(introducedIds.sort());
  expect(saved.every(item => item.correct && item.context?.phase === 'lesson' && item.context.recordingSrc && item.choiceIds.length === 4)).toBe(true);
});

test('writing scales by displayed length and card size across Japanese scripts', async ({ page }, testInfo) => {
  await page.clock.install();
  await page.addInitScript(() => { Math.random = () => 0.5; });
  await page.goto('./');
  const words = ['犬', '五十', 'りんご', 'ホテル', 'コーヒー', 'テーブルの上'].map(text => allWords.find(item => item.text === text)!);
  expect(words.every(Boolean)).toBe(true);
  await seedAttempts(page, words.map(item => item.id), 'audio-text');
  await page.reload();
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: /begin review/i }).click();
  const original = page.viewportSize()!;
  const viewports = [{ width: 320, height: 664 }, { width: 430, height: 900 }, { width: 1280, height: 900 }];
  const samples = new Map<string, number>();
  for (let i = 0; i < words.length; i++) {
    const { target, exercise } = await heardWord(page);
    expect(exercise).toBe('audio-text');
    expect(words.some(item => item.id === target.id)).toBe(true);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const label = page.getByRole('button', { name: 'Choose writing ' + target.text, exact: true }).locator('.written-answer');
      const metrics = await label.evaluate(element => {
        const box = element.getBoundingClientRect();
        const card = element.parentElement!.getBoundingClientRect();
        return { fontSize: parseFloat(getComputedStyle(element).fontSize), fits: box.left >= card.left && box.right <= card.right && box.top >= card.top && box.bottom <= card.bottom };
      });
      expect(metrics.fits, target.text + ' fits at ' + viewport.width + 'px').toBe(true);
      samples.set(viewport.width + '/' + target.text, metrics.fontSize);
      if (target.text === '犬') await captureScreen(page, 'writing-size-' + viewport.width + '-' + testInfo.project.name);
    }
    await page.setViewportSize(original);
    await chooseHeardAnswer(page, target);
  }
  for (const viewport of viewports) {
    const size = (text: string) => samples.get(viewport.width + '/' + text)!;
    expect(size('犬'), 'single kanji is prominent').toBeGreaterThan(40);
    expect(size('犬')).toBeGreaterThan(size('五十'));
    expect(size('五十')).toBeGreaterThan(size('りんご'));
    expect(size('りんご')).toBeCloseTo(size('ホテル'), 1);
    expect(size('ホテル')).toBeGreaterThan(size('コーヒー'));
    expect(size('コーヒー')).toBeGreaterThan(size('テーブルの上'));
    expect(size('テーブルの上')).toBeGreaterThanOrEqual(16);
  }
  expect(samples.get('430/りんご')!).toBeGreaterThan(samples.get('320/りんご')!);
  await expect(page.getByRole('heading', { name: /nice reviewing/i })).toBeVisible();
});

test('reviews both saved formats of one word and preserves a writing retry after reload', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  await seedAttempts(page, [bank.items[0]!.id]);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('attempts', 'readwrite');
    const request = tx.objectStore('attempts').getAll();
    request.onsuccess = () => {
      const original = request.result[0];
      tx.objectStore('attempts').add({ ...original, id: 'saved-writing', context: {
        phase: 'lesson', exercise: 'audio-text', recordingSrc: 'audio/fixture.mp3', replays: 0, schedulerVersion: 'fsrs-6-v1',
      } });
    };
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  });
  await page.reload();
  await page.waitForFunction(() => ['Kikimashta Noto Sans JP', 'Kikimashta Noto Serif JP', 'Kikimashta Zen Maru Gothic', 'Kikimashta Klee One'].every(family => Array.from(document.fonts).some(face => face.family.includes(family) && face.status === 'loaded')));
  await page.getByRole('button', { name: /^start/i }).click();
  await expect(page.getByText('2 cards', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /begin review/i }).click();
  const completed = new Set<string>();
  let writingMissed = false;
  let firstWritingFont = '';
  for (let turn = 0; turn < 3; turn++) {
    const { target, exercise, cardId } = await heardWord(page);
    expect(target.id).toBe(bank.items[0]!.id);
    expect(completed.has(cardId)).toBe(false);
    await expect(page.locator('.choices img')).toHaveCount(exercise === 'audio-picture' ? 4 : 0);
    if (exercise === 'audio-text') {
      const fonts = await page.locator('.choices .written-answer').evaluateAll(labels => labels.map(label => label.getAttribute('data-font')));
      expect(new Set(fonts).size).toBe(1);
      expect(['noto-serif', 'zen-maru', 'klee']).toContain(fonts[0]);
      const families = await page.locator('.choices .written-answer').evaluateAll(labels => labels.map(label => getComputedStyle(label).fontFamily));
      expect(new Set(families).size).toBe(1);
      expect(families[0]).toContain('Kikimashta');
      if (writingMissed) expect(fonts[0]).not.toBe(firstWritingFont);
      else {
        firstWritingFont = fonts[0]!;
        await page.getByRole('button', { name: 'Replay word', exact: true }).click();
        expect(await page.locator('.choices .written-answer').first().getAttribute('data-font')).toBe(firstWritingFont);
      }
    }
    if (exercise === 'audio-text' && !writingMissed) {
      writingMissed = true;
      await page.getByRole('button', { name: /choose writing/i }).filter({ hasNot: page.getByText(target.text, { exact: true }) }).first().click();
      await expect(page.locator('.choices .written-answer').first()).toHaveAttribute('data-font', firstWritingFont);
      for (const label of await page.locator('.answer-departures .written-answer').all()) await expect(label).toHaveAttribute('data-font', firstWritingFont);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    } else {
      await chooseHeardAnswer(page, target);
      completed.add(cardId);
    }
  }
  expect(completed.size).toBe(2);
  await expect(page.getByRole('heading', { name: /nice reviewing/i })).toBeVisible();
  const saved = await savedAttempts(page);
  expect(saved).toHaveLength(5);
  const miss = saved.find(attempt => attempt.context?.exercise === 'audio-text' && !attempt.correct)!;
  expect(miss).toBeDefined();
  expect(saved.find(attempt => attempt.context?.retryOf === miss.id)).toMatchObject({
    itemId: miss.itemId, correct: true, context: { exercise: 'audio-text', phase: 'review' },
  });
  await page.reload();
  expect(await savedAttempts(page)).toEqual(saved);
  await expect(page.getByText('5 answers saved on this device')).toBeVisible();
});

test('home centers a larger Kiku and fills the viewport with the current intensity', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('./');
  const density = page.getByRole('status', { name: 'Review density' });
  await expect(density).toContainText('Minimal');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  // Check the real foreground styles against every full-screen intensity fill.
  const textColors = await page.locator('.home-intensity, footer a, .home .text-button').evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).color));
  for (const control of await page.locator('footer a, .home .text-button').all()) {
    await control.hover();
    textColors.push(await control.evaluate(element => getComputedStyle(element).color));
  }
  expectReadableHomeText(textColors);
  await expect.poll(() => backgroundColor(page)).toBe('rgb(217, 193, 244)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#d9c1f4');
  const picture = density.locator('img');
  await expect.poll(() => picture.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  for (const size of [{ width: 390, height: 664 }, { width: 320, height: 568 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    const bounds = (await picture.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(200);
    expect(Math.abs(bounds.x + bounds.width / 2 - size.width / 2)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: /^start/i })).toBeInViewport();
  }
  await page.setViewportSize({ width: 390, height: 664 });
  await captureScreen(page, 'home-intensity-' + testInfo.project.name);
  await page.reload();
  await expect(density).toContainText('Minimal');
  await expect.poll(() => backgroundColor(page)).toBe('rgb(217, 193, 244)');
});

test('Dev review practices six random cards and a missed-word retry without saving progress', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await page.goto('./');
  await expect(page.getByRole('status', { name: 'Review density' })).toContainText('Minimal');
  expect(await savedAttempts(page)).toEqual([]);
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  const completed = new Set<string>();
  const presented: string[] = [];
  let missedId = '';
  for (let turn = 0; turn < 7 && completed.size < 6; turn++) {
    const { target, exercise, cardId } = await heardWord(page);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '6');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(completed.size));
    expect(completed.has(cardId), 'correct targets are unique within the dev round').toBe(false);
    presented.push(cardId);
    if (turn === 0) {
      missedId = cardId;
      await page.getByRole('button', { name: /choose (picture|writing)/i }).filter({
        hasNot: exercise === 'audio-picture' ? page.getByRole('img', { name: target.image.alt, exact: true }) : page.getByText(target.text, { exact: true }),
      }).first().click();
      await expect(page.locator('.feedback')).toHaveText('Try this one.');
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
      const mistakes = page.getByRole('status', { name: 'Mistakes', exact: true });
      await expect(mistakes).toContainText('1 incorrect answer');
      await expect(mistakes.locator('.mistake-icon')).toHaveCount(1);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    } else {
      await chooseHeardAnswer(page, target);
      completed.add(cardId);
    }
    if (completed.size < 6) await expect(page.getByRole('heading', { name: 'Dev review complete', exact: true })).toHaveCount(0);
  }
  expect(completed.size).toBe(6);
  expect(presented.filter(id => id === missedId)).toHaveLength(2);
  await expect(page.getByRole('heading', { name: 'Dev review complete', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /begin lesson|learn more/i })).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Review density' })).toHaveCount(0);
  expect(await savedAttempts(page)).toEqual([]);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Review density' })).toContainText('Minimal');
  // Finishing the sandbox restores the ordinary adaptive flow without reload.
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: /begin lesson/i }).click();
  await expect(page.getByRole('heading', { name: /lesson time!/i })).toBeVisible();
  await page.getByRole('button', { name: /kikimashta home/i }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dev review', exact: true })).toBeEnabled();
  expect(await savedAttempts(page)).toEqual([]);
});

for (const key of ['Enter', 'Space']) {
  test(`picture choices announce their contents and activate once with ${key}`, async ({ page }) => {
    await startReview(page);
    const choices = page.getByRole('button', { name: /choose picture/i });
    await expect(choices).toHaveCount(4);
    const names: string[] = [];
    for (let index = 0; index < 4; index++) {
      const choice = choices.nth(index);
      const description = await choice.getByRole('img').getAttribute('alt');
      expect(description?.trim()).toBeTruthy();
      const name = `Choose picture ${index + 1}: ${description}`;
      await expect(choice).toHaveAccessibleName(name);
      names.push(name);
    }
    await page.getByRole('button', { name: names[0]!, exact: true }).focus();
    await page.keyboard.press('Tab');
    const choice = page.getByRole('button', { name: names[1]!, exact: true });
    await expect(choice).toBeFocused();
    await page.keyboard.press(key);
    await expect(choice).toBeDisabled();
    await expect.poll(async () => (await savedAttempts(page)).length).toBe(7);
    const answers = (await savedAttempts(page)).filter(attempt => attempt.context);
    expect(answers).toHaveLength(1);
    expect(answers[0]!.choiceIds).toHaveLength(4);
  });
}

test('a session reviews only its starting snapshot and preserves legacy history', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.clock.install();
  await startReview(page);
  const laterWord = catalogue.items.find(item => item.text === '山')!;
  await seedAttempts(page, [laterWord.id]);
  const completed = new Set<string>();
  const presentations: string[] = [];
  let missedId = '';
  let misses = 0;
  let previousMissIndex = -1;
  for (let turn = 0; turn < 8 && completed.size < 6; turn++) {
    const { target } = await heardWord(page);
    expect(bank.items.some(item => item.id === target.id), 'later due words stay outside the starting snapshot').toBe(true);
    expect(completed.has(target.id), 'correctly completed words are not repeated').toBe(false);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '6');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(completed.size));
    if (!missedId) missedId = target.id;
    if (target.id === missedId && previousMissIndex >= 0 && completed.size < 5) {
      expect(presentations.slice(previousMissIndex + 1).some(id => id !== missedId), 'a missed word returns after another word when one is available').toBe(true);
    }
    presentations.push(target.id);
    if (target.id === missedId && misses < 2) {
      const wrongChoice = page.getByRole('button', { name: /choose picture/i }).filter({
        hasNot: page.getByRole('img', { name: target.image.alt, exact: true }),
      }).first();
      await wrongChoice.click();
      misses++;
      previousMissIndex = presentations.length - 1;
      await expect(page.locator('.feedback')).toHaveText('Try this one.');
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(completed.size));
      const mistakes = page.getByRole('status', { name: 'Mistakes', exact: true });
      await expect(mistakes).toContainText(`${misses} incorrect ${misses === 1 ? 'answer' : 'answers'}`);
      await expect(mistakes.locator('.mistake-icon')).toHaveCount(misses);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    } else {
      await chooseHeardAnswer(page, target);
      completed.add(target.id);
    }
    if (completed.size < 6) await expect(page.getByRole('heading', { name: /nice reviewing!/i })).toHaveCount(0);
  }
  expect(misses).toBe(2);
  expect(presentations.filter(id => id === missedId)).toHaveLength(3);
  expect([...completed].sort()).toEqual(bank.items.map(item => item.id).sort());
  await expect(page.getByRole('heading', { name: /nice reviewing!/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /begin lesson/i })).toBeEnabled();
  await captureScreen(page, 'adaptive-review-end-' + testInfo.project.name);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.reload();
  await expect(page.getByText('15 answers saved on this device')).toBeVisible();
  const saved = await savedAttempts(page);
  expect(saved.filter(item => !item.context)).toHaveLength(7);
  const reviews = saved.filter(item => item.context?.phase === 'review');
  expect(reviews).toHaveLength(8);
  const firstMiss = reviews.find(item => item.itemId === missedId && !item.context?.retryOf)!;
  expect(firstMiss.correct).toBe(false);
  const retries = reviews.filter(item => item.context?.retryOf);
  expect(retries).toHaveLength(2);
  expect(retries.every(item => item.itemId === missedId && item.context?.retryOf === firstMiss.id)).toBe(true);
  expect(retries.filter(item => item.correct)).toHaveLength(1);
  expect(reviews.filter(item => !item.context?.retryOf).map(item => item.itemId).sort()).toEqual(bank.items.map(item => item.id).sort());
  await page.getByRole('button', { name: /^start/i }).click();
  await expect(page.getByText('1 card', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /begin review/i }).click();
  expect((await heardWord(page)).target.id).toBe(laterWord.id);
});

test('a miss waits for Continue and stays usable with reduced motion', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await startReview(page);
  const { target, source } = await heardWord(page);
  const quizColor = await screenColor(page);
  const wrongChoice = page.getByRole('button', { name: /choose picture/i }).filter({
    hasNot: page.getByRole('img', { name: target.image.alt, exact: true }),
  }).first();
  const selectedAlt = await wrongChoice.locator('img').getAttribute('alt');
  // Native button activation still works from the keyboard.
  await wrongChoice.focus();
  await page.keyboard.press('Space');
  await expect(page.getByText('Try this one.', { exact: true })).toBeVisible();
  await expect(page.locator('.feedback')).toHaveText('Try this one.');
  await expect(page.locator('.app')).toHaveAttribute('data-answer', 'incorrect');
  for (const card of await page.locator('.choices .picture-choice').all()) {
    await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  }
  await expect(wrongChoice.locator('.choice-badge.wrong')).toBeVisible();
  await expect.poll(() => screenColor(page)).toBe('#b8a4cf');
  await expectAnswerPictures(page, [target.image.alt, selectedAlt!], 'fall');
  await expect(page.locator('.answer-departures')).toHaveCSS('display', 'none');
  await expect(page.locator('.quiz-starburst')).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await page.clock.fastForward(5000);
  await expect(page.locator('audio')).toHaveAttribute('src', source);
  await expect(page.getByRole('button', { name: /choose picture/i }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  if (testInfo.project.use.isMobile) {
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeInViewport({ ratio: 1 });
    await expect.poll(() => page.evaluate(() => {
      const action = document.querySelector('.quiz .practice-actions .primary')!.getBoundingClientRect();
      const progress = document.querySelector('.quiz .quiz-progress')!.getBoundingClientRect();
      return action.bottom <= progress.top + 1 && progress.bottom <= innerHeight;
    }), { message: 'Continue remains fully reachable above the bottom progress row' }).toBe(true);
  }
  await expect.poll(() => page.locator('.quiz-companion, .quiz-companion *, .progress-bead, .picture-choice, .choice-slot, .choices').evaluateAll(elements =>
    elements.every(element => getComputedStyle(element).animationName === 'none'),
  )).toBe(true);
  await captureScreen(page, 'quiz-miss-' + testInfo.project.name);
  await page.getByRole('button', { name: /replay word/i }).click();
  await expect.poll(() => page.locator('audio').evaluate(element => (element as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  await expect(page.locator('audio')).toHaveAttribute('src', source);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const nextWord = await heardWord(page);
  expect(nextWord.source).not.toBe(source);
  await expect(page.getByRole('button', { name: /choose picture/i })).toHaveCount(4);
  await expect(page.locator('.answer-departures, .quiz-starburst')).toHaveCount(0);
  await expect.poll(() => page.locator('.app').getAttribute('data-answer')).toBeNull();
  await expect.poll(() => screenColor(page)).toBe(quizColor);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});

test('a miss drops only uninvolved pictures without shifting the grid or adding answers', async ({ page }, testInfo) => {
  await startReview(page);
  const { target, source } = await heardWord(page);
  const beforeGrid = await page.locator('.choices').boundingBox();
  const beforeHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const wrongChoice = page.getByRole('button', { name: /choose picture/i }).filter({
    hasNot: page.getByRole('img', { name: target.image.alt, exact: true }),
  }).first();
  const selectedAlt = await wrongChoice.locator('img').getAttribute('alt');
  await wrongChoice.click();
  await expect(page.locator('.feedback')).toHaveText('Try this one.');
  await expectCompanionMotion(page);
  await expectAnswerPictures(page, [target.image.alt, selectedAlt!], 'fall');
  await captureFallingCards(page, 'quiz-falling-' + testInfo.project.name);
  await expectDeparturesFinished(page, 2);
  await expectAnswerPictures(page, [target.image.alt, selectedAlt!], 'fall');
  await expect(page.locator('audio')).toHaveAttribute('src', source);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  const afterGrid = await page.locator('.choices').boundingBox();
  expect(Math.abs(afterGrid!.height - beforeGrid!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(afterGrid!.width - beforeGrid!.width)).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(height => document.documentElement.scrollWidth <= innerWidth
    && document.documentElement.scrollHeight <= height, beforeHeight), {
    message: 'falling cards stay in a clipped layer and add no scrollbars',
  }).toBe(true);
  await page.getByRole('button', { name: /kikimashta home/i }).click();
  await page.reload();
  await expect(page.getByText('7 answers saved on this device')).toBeVisible();
});

test('holding a picture acts as one button press on release', async ({ page }, testInfo) => {
  await startReview(page);
  const { target } = await heardWord(page);
  const choice = page.getByRole('button', { name: /choose picture/i }).filter({
    has: page.getByRole('img', { name: target.image.alt, exact: true }),
  });
  await choice.hover();
  const protections = await choice.evaluate(button => {
    const image = button.querySelector('img')!;
    return {
      tag: button.tagName,
      selection: getComputedStyle(button).userSelect,
      callout: getComputedStyle(button).getPropertyValue('-webkit-touch-callout'),
      calloutSupported: CSS.supports('-webkit-touch-callout', 'none'),
      imagePointerEvents: getComputedStyle(image).pointerEvents,
      imageDrag: getComputedStyle(image).getPropertyValue('-webkit-user-drag'),
      draggable: image.draggable,
    };
  });
  expect(protections).toMatchObject({ tag: 'BUTTON', selection: 'none', imagePointerEvents: 'none', imageDrag: 'none', draggable: false });
  if (testInfo.project.use.isMobile && protections.calloutSupported) expect(protections.callout).toBe('none');
  const card = await choice.boundingBox();
  expect(card).not.toBeNull();
  await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2);
  await page.mouse.down();
  try {
    // Actual gesture duration is the behavior under test, rather than a wait for app state.
    await page.waitForTimeout(1000);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    await expect.poll(() => page.locator('.app').getAttribute('data-answer')).toBeNull();
    expect(await choice.evaluate(button => button.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
    })))).toBe(false);
    await page.screenshot({ path: `test-results/quiz-long-hold-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' });
  } finally {
    await page.mouse.up();
  }
  await expect(page.getByText('Got it!', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  for (const button of await page.getByRole('button', { name: /choose picture/i }).all()) await expect(button).toBeDisabled();
  await page.getByRole('button', { name: /kikimashta home/i }).click();
  await page.reload();
  await expect(page.getByText('7 answers saved on this device')).toBeVisible();
});

test('an unavailable recording can be retried without recording a premature answer', async ({ page }) => {
  await page.clock.install();
  const audioRequests = /\/audio\/.*\.mp3(?:\?.*)?$/;
  await page.route(audioRequests, route => route.abort());
  await startReview(page);
  await expect(page.getByRole('alert')).toContainText(/sound couldn't play/i);
  for (const choice of await page.getByRole('button', { name: /choose picture/i }).all()) await expect(choice).toBeDisabled();
  await page.unroute(audioRequests);
  await page.getByRole('button', { name: /replay word/i }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await chooseHeardAnswer(page, (await heardWord(page)).target);
  await page.getByRole('button', { name: /kikimashta home/i }).click();
  await page.reload();
  await expect(page.getByText('7 answers saved on this device')).toBeVisible();
});
