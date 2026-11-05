import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import bank from '../content/ja.json' with { type: 'json' };
import type { WordItem } from '../src/types';

const catalogue = JSON.parse(readFileSync(new URL('../content/catalog/ja.json', import.meta.url), 'utf8')) as { items: WordItem[] };
const allWords = [...bank.items, ...catalogue.items] as WordItem[];

async function addLegacy(page: Page, ids = bank.items.map(item => item.id)) {
  await page.evaluate(async itemIds => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onupgradeneeded = () => { const store = request.result.createObjectStore('attempts', { keyPath: 'id' }); store.createIndex('language', 'language'); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction('attempts', 'readwrite');
      itemIds.forEach((itemId, i) => transaction.objectStore('attempts').put({ id: 'legacy-' + itemId, sessionId: 'legacy', itemId, language: 'ja-JP', choiceIds: itemIds, selectedId: itemId, correct: true, startedAt: Date.now() - 86_400_000 - i, answeredAt: Date.now() - 86_400_000 - i, responseMs: 0 }));
      await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    } finally { db.close(); }
  }, ids);
}

async function startReview(page: Page) {
  await page.goto('./'); await addLegacy(page); await page.reload();
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: /begin review/i }).click();
}

async function savedAttempts(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('kikimashta-v0', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      return await new Promise<{itemId:string; context?:{phase:string;recordingSrc:string;replays:number};correct:boolean;choiceIds:string[]}[]>((resolve, reject) => { const request = db.transaction('attempts').objectStore('attempts').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    } finally { db.close(); }
  });
}

const backgroundColor = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
const screenColor = (page: Page) => page.evaluate(() => document.documentElement.style.getPropertyValue('--screen-background').trim());

async function captureScreen(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/' + name + '.png', fullPage: true, animations: 'disabled' });
}

async function captureCorrectResponse(page: Page, name: string) {
  const decorations = await page.locator('.app').evaluateHandle(app => {
    const glow = app.getAnimations({ subtree: true }).filter(candidate =>
      candidate instanceof CSSAnimation && candidate.animationName === 'correct-glow',
    );
    const animations = [...glow, ...Array.from(app.querySelectorAll('.companion-spark, .firework-star')).flatMap(effect => effect.getAnimations())];
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 360;
    }
    return animations;
  });
  try {
    // Hold only the decorative effects for review; quiz/audio timing continues normally.
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true, animations: 'allow' });
  } finally {
    try {
      await decorations.evaluate(animations => animations.forEach(animation => animation.play()));
    } finally {
      await decorations.dispose();
    }
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
  // Computed end times include each card's stagger delay. A paused advance
  // timer must not conceal exits that exceed the earliest 1.2-second advance.
  const endTimes = await page.locator('.answer-departures').evaluate(layer =>
    layer.getAnimations({ subtree: true }).map(animation => Number(animation.effect?.getComputedTiming().endTime)),
  );
  expect(endTimes).toHaveLength(count);
  expect(Math.max(...endTimes), 'every exit including stagger fits within the answer beat').toBeLessThanOrEqual(1200);
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
      const progress = document.querySelector('.quiz > .round-progress')?.getBoundingClientRect();
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
  await expect(page.getByRole('button', { name: /choose picture/i }).first()).toBeEnabled();
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
  return { source: source!, target: target! };
}

async function chooseHeardPicture(page: Page, pressScreenshot?: string, responseScreenshot?: string) {
  const { target } = await heardWord(page);
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
    if (pressScreenshot) {
      await choice.hover();
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
    } else {
      await choice.click();
    }
    await expect(page.locator('.feedback')).toHaveText('Got it!');
    await expect(page.locator('.app')).toHaveAttribute('data-answer', 'correct');
    await expect.poll(() => screenColor(page)).toBe('#e9b6ff');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(completedBefore + 1));
    await expect(page.locator('.progress-bead.is-complete')).toHaveCount(completedBefore + 1);
    await expectAnswerPictures(page, [target.image.alt], 'fly');
    await expect(page.locator('.quiz-starburst')).toHaveAttribute('aria-hidden', 'true');
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
    if (responseScreenshot) await captureCorrectResponse(page, responseScreenshot);
    // Native CSS animations finish while JavaScript timers remain paused.
    await expectDeparturesFinished(page, 3);
  } finally {
    await page.clock.resume();
  }
}

test('learn ten words, complete the mini-quiz, and retain lesson results after reload', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await page.goto('./');
  await expect(page.getByRole('status', { name: 'Review density' })).toContainText('Minimal');
  const homeColor = await backgroundColor(page);
  await captureScreen(page, 'adaptive-home-' + testInfo.project.name);
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: /begin lesson/i }).click();
  await expect(page.getByRole('heading', { name: /lesson time!/i })).toBeVisible();
  await expect.poll(() => backgroundColor(page)).not.toBe(homeColor);
  if (testInfo.project.use.isMobile) await checkMobilePracticeSizes(page, '.preview-picture', 'adaptive-lesson');
  const introduced: WordItem[] = [];
  for (let i = 0; i < 10; i++) {
    const picture = page.locator('.preview-picture img');
    await expect.poll(() => picture.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
    const src = await picture.getAttribute('src');
    introduced.push(allWords.find(item => src?.endsWith(item.image.src))!);
    await page.getByRole('button', { name: i === 9 ? /mini-quiz/i : /next word/i }).click();
  }
  expect(new Set(introduced.map(item => item.id)).size).toBe(10);
  if (testInfo.project.use.isMobile) await checkMobilePracticeSizes(page, '.choices', 'adaptive-quiz');
  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    await expect(page.getByRole('button', { name: /choose picture/i })).toHaveCount(4);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(i));
    const { target } = await heardWord(page);
    expect(introduced.some(item => item.id === target.id)).toBe(true);
    expect(seen.has(target.id)).toBe(false); seen.add(target.id);
    await chooseHeardPicture(page, i === 0 ? 'adaptive-pressed-' + testInfo.project.name : undefined, i === 0 ? 'adaptive-correct-' + testInfo.project.name : undefined);
  }
  await expect(page.getByRole('heading', { name: /nice round!/i })).toBeVisible();
  await captureScreen(page, 'adaptive-chunk-end-' + testInfo.project.name);
  await expect(page.getByRole('button', { name: /learn more/i })).toBeEnabled();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.reload();
  await expect(page.getByText('10 answers saved on this device')).toBeVisible();
  const saved = await savedAttempts(page);
  expect(saved.map(item => item.itemId).sort()).toEqual(introduced.map(item => item.id).sort());
  expect(saved.every(item => item.correct && item.context?.phase === 'lesson' && item.context.recordingSrc && item.choiceIds.length === 4)).toBe(true);
  const minimum = page.getByRole('listbox', { name: 'Minimum', exact: true });
  const maximum = page.getByRole('listbox', { name: 'Maximum', exact: true });
  await minimum.focus();
  await minimum.press('Home');
  await maximum.focus();
  await maximum.press('Home');
  await maximum.press('ArrowDown');
  await page.reload();
  for (const [wheel, label] of [[minimum, 'Minimal'], [maximum, 'Light']] as const) {
    const selected = wheel.getByRole('option', { name: label, exact: true });
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(wheel).toHaveAttribute('aria-activedescendant', (await selected.getAttribute('id'))!);
  }
});

test('pace wheels scroll natively, keep valid bounds, and fit around Kiku on a phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('./');
  const minimum = page.getByRole('listbox', { name: 'Minimum', exact: true });
  const maximum = page.getByRole('listbox', { name: 'Maximum', exact: true });
  const density = page.getByRole('status', { name: 'Review density' });
  const pace = page.getByRole('group', { name: 'Practice pace' });
  await expect(pace.locator('.pace-kiku img')).toHaveCount(3);
  for (const column of await pace.locator('.pace-column').all()) {
    await expect(column.locator('.pace-heading')).toBeVisible();
    await expect(column.locator('.pace-kiku img')).toBeVisible();
    await expect.poll(() => column.locator('.pace-kiku img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(density).toContainText('Minimal');
  await expect(minimum.getByRole('option', { name: 'Light', exact: true })).toHaveAttribute('aria-selected', 'true');
  await minimum.hover();
  await page.mouse.wheel(0, 128);
  await expect(minimum.getByRole('option', { name: 'Moderate', exact: true })).toHaveAttribute('aria-selected', 'true');
  await maximum.hover();
  await page.mouse.wheel(0, 128);
  const selectedMaximum = maximum.getByRole('option', { name: 'Intense', exact: true });
  await expect(selectedMaximum).toHaveAttribute('aria-selected', 'true');
  await expect(maximum).toHaveAttribute('aria-activedescendant', (await selectedMaximum.getAttribute('id'))!);
  await expect.poll(() => page.evaluate(() => {
    const minimum = document.querySelector<HTMLElement>('[role="listbox"][aria-label="Minimum"]')!;
    const maximum = document.querySelector<HTMLElement>('[role="listbox"][aria-label="Maximum"]')!;
    const density = document.querySelector<HTMLElement>('[role="status"][aria-label="Review density"]')!;
    const levels = ['minimal', 'light', 'moderate', 'high', 'intense'];
    const selectedMinimum = minimum.querySelector<HTMLElement>('[aria-selected="true"]')!;
    const selectedMaximum = maximum.querySelector<HTMLElement>('[aria-selected="true"]')!;
    const left = minimum.getBoundingClientRect(), center = density.getBoundingClientRect(), right = maximum.getBoundingClientRect();
    const selected = selectedMaximum.getBoundingClientRect();
    return levels.indexOf(selectedMinimum.dataset.density!) <= levels.indexOf(selectedMaximum.dataset.density!)
      && left.right <= center.left && center.right <= right.left
      && Math.abs((left.top + left.bottom) / 2 - (right.top + right.bottom) / 2) < 2
      && Math.abs((selected.top + selected.bottom) / 2 - (right.top + right.bottom) / 2) < 2
      && left.left >= 0 && right.right <= innerWidth
      && document.documentElement.scrollWidth <= innerWidth;
  }), { message: 'the native wheel centers its selection and the three pace columns fit without overlap' }).toBe(true);
  await captureScreen(page, 'pace-phone-home-' + testInfo.project.name);
  await page.reload();
  await expect(minimum.getByRole('option', { name: 'Moderate', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(maximum.getByRole('option', { name: 'Intense', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('a session reviews only its starting snapshot and preserves legacy history', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.clock.install();
  await startReview(page);
  const laterWord = catalogue.items.find(item => item.text === '山')!;
  await addLegacy(page, [laterWord.id]);
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const { target } = await heardWord(page);
    expect(bank.items.some(item => item.id === target.id)).toBe(true);
    expect(seen.has(target.id)).toBe(false); seen.add(target.id);
    await chooseHeardPicture(page);
  }
  await expect(page.getByRole('heading', { name: /nice reviewing!/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /begin lesson/i })).toBeEnabled();
  await captureScreen(page, 'adaptive-review-end-' + testInfo.project.name);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.reload();
  await expect(page.getByText('13 answers saved on this device')).toBeVisible();
  const saved = await savedAttempts(page);
  expect(saved.filter(item => !item.context)).toHaveLength(7);
  expect(saved.filter(item => item.context?.phase === 'review').map(item => item.itemId).sort()).toEqual(bank.items.map(item => item.id).sort());
  await page.getByRole('button', { name: /^start/i }).click();
  await expect(page.getByText('1 word', { exact: true })).toBeVisible();
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
  await expect.poll(() => screenColor(page)).toBe('#b8a4cf');
  await expectAnswerPictures(page, [target.image.alt, selectedAlt!], 'fall');
  await expect(page.locator('.answer-departures')).toHaveCSS('display', 'none');
  await expect(page.locator('.quiz-starburst')).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await page.clock.fastForward(5000);
  await expect(page.locator('audio')).toHaveAttribute('src', source);
  await expect(page.getByRole('button', { name: /choose picture/i }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  if (testInfo.project.use.isMobile) {
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeInViewport({ ratio: 1 });
    await expect.poll(() => page.evaluate(() => {
      const action = document.querySelector('.quiz .practice-actions .primary')!.getBoundingClientRect();
      const progress = document.querySelector('.quiz > .round-progress')!.getBoundingClientRect();
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
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
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
  await expectAnswerPictures(page, [target.image.alt, selectedAlt!], 'fall');
  await captureFallingCards(page, 'quiz-falling-' + testInfo.project.name);
  await expectDeparturesFinished(page, 2);
  await expectAnswerPictures(page, [target.image.alt, selectedAlt!], 'fall');
  await expect(page.locator('audio')).toHaveAttribute('src', source);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
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
  await page.route('**/audio/*.mp3', route => route.abort());
  await startReview(page);
  await expect(page.getByRole('alert')).toContainText(/sound couldn't play/i);
  for (const choice of await page.getByRole('button', { name: /choose picture/i }).all()) await expect(choice).toBeDisabled();
  await page.unroute('**/audio/*.mp3');
  await page.getByRole('button', { name: /replay word/i }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await chooseHeardPicture(page);
  await page.getByRole('button', { name: /kikimashta home/i }).click();
  await page.reload();
  await expect(page.getByText('7 answers saved on this device')).toBeVisible();
});
