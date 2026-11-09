import { selectWordPractice } from './practice-selection';
import { expectReadableHomeText } from './contrast';
import { expect, test, type Page } from './fixtures';
import { readFileSync } from 'node:fs';
import starter from '../content/ja.json' with { type: 'json' };
import pool from '../content/practice-pool.json' with { type: 'json' };
import type { Exercise, WordItem } from '../src/types';

const catalogue = JSON.parse(readFileSync(new URL('../content/catalog/ja.json', import.meta.url), 'utf8')) as { items: WordItem[] };
test.beforeEach(async ({ page }) => { await selectWordPractice(page); });

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

async function checkMobilePracticeSizes(page: Page, pictureSelector: string) {
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
  // Keep native playback, storage and automatic advancement on the running clock.
  // Rendered save/playback indicators can settle before React registers its
  // advance timer; advancing a paused clock here can strand that later timer.
  const exercise = await page.locator('.quiz').getAttribute('data-exercise');
  const choice = exercise === 'audio-text'
    ? page.getByRole('button', { name: 'Choose writing ' + target.text, exact: true })
    : page.getByRole('button', { name: /choose picture/i }).filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) });
  await choice.click();
  await expect(page.locator('.feedback')).toContainText('Correct answer.');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(completedBefore + 1));
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.app')).not.toHaveAttribute('data-answer', 'correct');
}

async function chooseWithAnimationChecks(page: Page) {
  const { target } = await heardWord(page);
  // Clicking may scroll the page; compare document coordinates for layout stability.
  const bounds = () => page.locator('.choices').evaluate(grid => {
    const box = grid.getBoundingClientRect();
    return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height };
  });
  const before = await bounds();
  const completedBefore = Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'));
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  try {
    await page.getByRole('button', { name: /choose picture/i }).filter({
      has: page.getByRole('img', { name: target.image.alt, exact: true }),
    }).click();
    await expect(page.locator('.feedback')).toContainText('Correct answer.');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(completedBefore + 1));
    await expectAnswerPictures(page, [target.image.alt], 'fly');
    await expectDeparturesFinished(page, 3);
    expect(await bounds()).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await page.clock.resume();
  }
}

test('correct feedback finishes its animation, preserves layout, and advances to the next audible word', async ({ page }) => {
  await page.clock.install();
  await startReview(page);
  const { source } = await heardWord(page);
  await chooseWithAnimationChecks(page);
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
  // Both formats of the same levels keep this lesson's five/five sample balanced.
  await page.evaluate(() => localStorage.setItem('kikimashta-card-packs-v1', JSON.stringify([
    'ja-wanikani-2-pictures', 'ja-wanikani-2-writing', 'ja-wanikani-3-pictures', 'ja-wanikani-3-writing',
  ])));
  await page.reload();
  await expect(page.getByRole('status', { name: 'Review density' })).toContainText('Minimal');
  await expect.poll(() => page.evaluate(() => Array.from(document.fonts).some(face => face.family.includes('Kikimashta Noto Sans JP') && face.status === 'loaded'))).toBe(true);
  const homeColor = await backgroundColor(page);
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: /begin lesson/i }).click();
  await expect(page.getByRole('heading', { name: /lesson time!/i })).toBeVisible();
  await expect.poll(() => backgroundColor(page)).not.toBe(homeColor);
  if (testInfo.project.use.isMobile) await checkMobilePracticeSizes(page, '.preview-picture');
  const introduced: { item: WordItem; exercise: string }[] = [];
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
    }
    await page.getByRole('button', { name: i === 9 ? /mini-quiz/i : /next card/i }).click();
  }
  const introducedIds = introduced.map(card => JSON.stringify([card.item.language, card.item.id, card.exercise]));
  expect(new Set(introducedIds).size).toBe(10);
  expect(introduced.filter(card => card.exercise === 'audio-text')).toHaveLength(5);
  expect(introduced.filter(card => card.exercise === 'audio-picture')).toHaveLength(5);
  if (testInfo.project.use.isMobile) await checkMobilePracticeSizes(page, '.choices');
  const seen = new Set<string>();
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
    }
    await chooseHeardAnswer(page, target);
  }
  await expect(page.getByRole('heading', { name: /nice round!/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /learn more/i })).toBeEnabled();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.reload();
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(10);
  const saved = await savedAttempts(page);
  expect(saved.map(attempt => JSON.stringify([bank.language, attempt.itemId, attempt.context?.exercise])).sort()).toEqual(introducedIds.sort());
  expect(saved.every(item => item.correct && item.context?.phase === 'lesson' && item.context.recordingSrc && item.choiceIds.length === 4)).toBe(true);
});

test('writing scales by displayed length and card size across Japanese scripts', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  const texts = ['犬', '五十', 'りんご', 'ホテル', 'コーヒー', 'テーブルの上'];
  expect(texts.every(text => allWords.some(item => item.text === text))).toBe(true);
  // Exercise the production stylesheet and self-hosted font without replaying a
  // session for each layout sample. Real writing journeys cover CardFace and saves.
  const fontLoaded = await page.evaluate(async () => {
    const app = document.createElement('div');
    app.className = 'app app-quiz';
    app.innerHTML = '<main><section class="practice quiz" data-exercise="audio-text"><div class="quiz-top"></div>'
      + '<div class="quiz-cards"><div class="choices"></div></div>'
      + '<div class="practice-actions"><div class="feedback"></div></div>'
      + '<div class="quiz-progress"><div class="round-progress"><div class="progress-beads"><span class="progress-bead"></span></div></div></div>'
      + '</section></main>';
    for (let index = 0; index < 4; index++) {
      const slot = document.createElement('div'); slot.className = 'choice-slot';
      const button = document.createElement('button'); button.className = 'answer-choice text-choice';
      const label = document.createElement('span'); label.className = 'written-answer';
      label.lang = 'ja-JP'; label.dataset.font = 'noto-sans';
      button.append(label); slot.append(button); app.querySelector('.choices')!.append(slot);
    }
    document.body.replaceChildren(app);
    const fonts = await document.fonts.load('600 32px "Kikimashta Noto Sans JP"');
    return fonts.some(font => font.family.includes('Kikimashta Noto Sans JP'));
  });
  expect(fontLoaded, 'the production writing font is available in the layout fixture').toBe(true);
  const viewports = [{ width: 320, height: 664 }, { width: 430, height: 900 }, { width: 1280, height: 900 }];
  const samples = new Map<string, number>();
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const text of texts) {
      const metrics = await page.locator('.written-answer').first().evaluate((element, text) => {
        element.textContent = text;
        const length = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length;
        (element as HTMLElement).style.setProperty('--writing-length', String(length));
        const box = element.getBoundingClientRect();
        const card = element.parentElement!.getBoundingClientRect();
        return { fontSize: parseFloat(getComputedStyle(element).fontSize), fits: box.left >= card.left && box.right <= card.right && box.top >= card.top && box.bottom <= card.bottom };
      }, text);
      expect(metrics.fits, text + ' fits at ' + viewport.width + 'px').toBe(true);
      samples.set(viewport.width + '/' + text, metrics.fontSize);
    }
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
});

test('reviews a mixed starting snapshot, preserves its writing retry and defers later due work', async ({ page }) => {
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
  const laterWord = catalogue.items.find(item => item.text === '山')!;
  await seedAttempts(page, [laterWord.id]);
  const original = await savedAttempts(page);
  const completed = new Set<string>();
  let writingMissed = false;
  let firstWritingFont = '';
  for (let turn = 0; turn < 3; turn++) {
    const { target, exercise, cardId } = await heardWord(page);
    expect(target.id).toBe(bank.items[0]!.id);
    expect(completed.has(cardId)).toBe(false);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(completed.size));
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
      await expect(page.locator('.feedback')).toContainText('Incorrect answer.');
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(completed.size));
      await expect(page.getByRole('status', { name: 'Mistakes', exact: true })).toContainText('1 incorrect answer');
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
  expect(saved).toHaveLength(original.length + 3);
  for (const attempt of original) expect(saved.find(record => record.id === attempt.id)).toEqual(attempt);
  const reviews = saved.filter(attempt => attempt.context?.phase === 'review');
  expect(reviews).toHaveLength(3);
  expect(reviews.filter(attempt => !attempt.context?.retryOf).map(attempt => attempt.context!.exercise).sort()).toEqual(['audio-picture', 'audio-text']);
  const miss = saved.find(attempt => attempt.context?.exercise === 'audio-text' && !attempt.correct)!;
  expect(miss).toBeDefined();
  expect(saved.filter(attempt => attempt.context?.retryOf)).toHaveLength(1);
  expect(saved.find(attempt => attempt.context?.retryOf === miss.id)).toMatchObject({
    itemId: miss.itemId, correct: true, context: { exercise: 'audio-text', phase: 'review' },
  });
  await page.reload();
  expect(await savedAttempts(page)).toEqual(saved);
  await page.getByRole('button', { name: /^start/i }).click();
  await expect(page.getByText('1 card', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /begin review/i }).click();
  expect((await heardWord(page)).target.id).toBe(laterWord.id);
});

test('Home remains readable with reachable controls at phone and desktop sizes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('./');
  const density = page.getByRole('status', { name: 'Review density' });
  await expect(density).toContainText('Minimal');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  // Include the download controls exposed by the offline disclosure.
  await page.getByText('Offline practice', { exact: true }).click();
  // Check the real foreground styles against every full-screen intensity fill.
  const textColors = await page.locator('.home-intensity, footer a, .home .text-button').evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).color));
  for (const control of await page.locator('footer a, .home .text-button').all()) {
    await control.hover();
    textColors.push(await control.evaluate(element => getComputedStyle(element).color));
  }
  expectReadableHomeText(textColors);
  await page.getByText('Offline practice', { exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
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
  await page.reload();
  await expect(density).toContainText('Minimal');
});

for (const key of ['Enter', 'Space']) {
  test(`picture choices announce their contents and activate once with ${key}`, async ({ page, browserName }) => {
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
    // WebKit uses Option-Tab to include buttons in its default navigation.
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
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

test('a failed answer can be retried from Home and persists exactly once after reload', async ({ page }) => {
  await startReview(page);
  const original = await savedAttempts(page);
  // Fail one real browser storage request; the retry uses native IndexedDB.
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      if (this.name === 'attempts') {
        IDBObjectStore.prototype.add = add;
        sessionStorage.setItem('failed-save-attempt', JSON.stringify(value));
        throw new DOMException('Storage temporarily unavailable', 'QuotaExceededError');
      }
      return add.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: /choose picture/i }).first().click();
  await expect(page.getByRole('alert')).toContainText("This answer hasn't been saved yet.");
  const expected = await page.evaluate(() => JSON.parse(sessionStorage.getItem('failed-save-attempt')!));
  await page.getByRole('button', { name: /kikimashta home/i }).click();
  await expect(page.getByRole('button', { name: /^start/i })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText("This answer hasn't been saved yet.");
  expect(await savedAttempts(page)).toEqual(original);
  await page.getByRole('button', { name: /retry saving/i }).click();
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(7);
  const saved = await savedAttempts(page);
  expect(saved).toHaveLength(original.length + 1);
  expect(saved.filter(attempt => attempt.id === expected.id)).toEqual([expected]);
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
  await expect(page.locator('.feedback')).toContainText('Incorrect answer.');
  await expect(page.getByLabel('Mastery increased to Learning')).toContainText('Learning');
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

test('a miss drops only uninvolved pictures without shifting the grid or adding answers', async ({ page }) => {
  await startReview(page);
  const { target, source } = await heardWord(page);
  const beforeGrid = await page.locator('.choices').boundingBox();
  const beforeHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const wrongChoice = page.getByRole('button', { name: /choose picture/i }).filter({
    hasNot: page.getByRole('img', { name: target.image.alt, exact: true }),
  }).first();
  const selectedAlt = await wrongChoice.locator('img').getAttribute('alt');
  await wrongChoice.click();
  await expect(page.locator('.feedback')).toContainText('Incorrect answer.');
  await expectAnswerPictures(page, [target.image.alt, selectedAlt!], 'fall');
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
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(7);
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
  } finally {
    await page.mouse.up();
  }
  await expect(page.locator('.feedback')).toContainText('Correct answer.');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  for (const button of await page.getByRole('button', { name: /choose picture/i }).all()) await expect(button).toBeDisabled();
  await page.getByRole('button', { name: /kikimashta home/i }).click();
  await page.reload();
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(7);
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
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(7);
});
