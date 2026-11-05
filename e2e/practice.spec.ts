import { expect, test, type Page } from '@playwright/test';
import bank from '../content/ja.json' with { type: 'json' };

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
  const result = await page.locator('.answer-departures').evaluate(async (layer, expectedCount) => {
    const results = await Promise.allSettled(layer.getAnimations({ subtree: true }).map(animation => animation.finished));
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
  const target = bank.items.find(item => item.audio.some(recording => source?.endsWith(recording.src)));
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
  if (pressScreenshot) {
    await choice.hover();
    const card = await choice.boundingBox();
    expect(card).not.toBeNull();
    await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2);
    await page.mouse.down();
    try {
      await page.screenshot({ path: `test-results/${pressScreenshot}.png`, fullPage: true, animations: 'disabled' });
    } finally {
      // Releasing the real press answers normally; it does not alter quiz pacing.
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
  // Check completion in one browser evaluation, then wait directly for the next word.
  // All answer-state assertions above run before the longer flight finishes.
  await expectDeparturesFinished(page, 3);
}

test('preview, complete a short round, and retain real device progress after reload', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto('./');
  for (const image of await page.locator('img').all()) {
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  const homeColor = await backgroundColor(page);
  await captureScreen(page, 'home-' + testInfo.project.name);
  await page.getByRole('button', { name: /^start/i }).click();
  await expect(page.getByRole('heading', { name: /lesson time!/i })).toBeVisible();
  await expect.poll(() => backgroundColor(page)).not.toBe(homeColor);
  const lessonColor = await backgroundColor(page);
  await expect.poll(() => page.getByRole('img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await captureScreen(page, 'preview-' + testInfo.project.name);
  if (testInfo.project.use.isMobile) await checkMobilePracticeSizes(page, '.preview-picture', 'preview-mobile');
  for (let i = 0; i < bank.items.length - 1; i++) {
    await page.getByRole('button', { name: /next word/i }).click();
  }
  await page.getByRole('button', { name: /play a round/i }).click();
  await expect.poll(async () => [homeColor, lessonColor].includes(await backgroundColor(page))).toBe(false);
  const quizColor = await screenColor(page);
  await captureScreen(page, 'quiz-' + testInfo.project.name);
  if (testInfo.project.use.isMobile) await checkMobilePracticeSizes(page, '.choices', 'quiz-mobile');
  await expect(page.locator('.progress-bead')).toHaveCount(bank.items.length);
  await expect(page.locator('.quiz-companion')).toBeVisible();
  const originalAudio = await page.locator('audio').elementHandle();
  expect(originalAudio).not.toBeNull();
  let previousSource: string | null = null;
  for (let i = 0; i < bank.items.length; i++) {
    await expect(page.getByRole('button', { name: /choose picture/i }).first()).toBeEnabled();
    await expect(page.getByRole('button', { name: /choose picture/i })).toHaveCount(4);
    await expect(page.locator('.answer-departures, .quiz-starburst')).toHaveCount(0);
    await expect.poll(() => page.locator('.app').getAttribute('data-answer')).toBeNull();
    await expect.poll(() => screenColor(page)).toBe(quizColor);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(i));
    const source = (await heardWord(page)).source;
    expect(source).not.toBe(previousSource);
    previousSource = source;
    expect(await originalAudio!.evaluate(element => element === document.querySelector('audio'))).toBe(true);
    await chooseHeardPicture(page,
      i === 0 ? 'quiz-pressed-' + testInfo.project.name : undefined,
      i === 0 ? 'quiz-correct-' + testInfo.project.name : undefined,
    );
    // The next iteration waits for new enabled choices and actual audio playback.
    // No Replay/Next click is used, so Safari autoplay failures remain visible.
  }
  await expect(page.getByRole('heading', { name: /nice round!/i })).toBeVisible();
  await expect(page.getByText(`${bank.items.length} / ${bank.items.length}`, { exact: true })).toBeVisible();
  await captureScreen(page, 'summary-' + testInfo.project.name);
  await page.getByRole('button', { name: /back home/i }).click();
  await expect.poll(() => backgroundColor(page)).toBe(homeColor);
  await expect(page.getByText(`${bank.items.length} answers saved on this device`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`${bank.items.length} answers saved on this device`)).toBeVisible();
});

test('a miss waits for Continue and stays usable with reduced motion', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('./');
  await page.getByRole('button', { name: /skip to quiz/i }).click();
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
  await page.goto('./');
  await page.getByRole('button', { name: /skip to quiz/i }).click();
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
  await expect(page.getByText('1 answer saved on this device')).toBeVisible();
});

test('holding a picture acts as one button press on release', async ({ page }, testInfo) => {
  await page.goto('./');
  await page.getByRole('button', { name: /skip to quiz/i }).click();
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
  await expect(page.getByText('1 answer saved on this device')).toBeVisible();
});

test('an unavailable recording can be retried without recording a premature answer', async ({ page }) => {
  await page.route('**/audio/*.mp3', route => route.abort());
  await page.goto('./');
  await page.getByRole('button', { name: /skip to quiz/i }).click();
  await expect(page.getByRole('alert')).toContainText(/sound couldn't play/i);
  for (const choice of await page.getByRole('button', { name: /choose picture/i }).all()) await expect(choice).toBeDisabled();
  await page.unroute('**/audio/*.mp3');
  await page.getByRole('button', { name: /replay word/i }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await chooseHeardPicture(page);
  await page.getByRole('button', { name: /kikimashta home/i }).click();
  await page.reload();
  await expect(page.getByText('1 answer saved on this device')).toBeVisible();
});
