import { expect, test, type Page } from './fixtures';
import { readFileSync } from 'node:fs';
import catalogue from '../content/catalog/ja.json' with { type: 'json' };
import starter from '../content/ja.json' with { type: 'json' };
import { authoredContextualQuestion } from './contextual-content';
import { selectWordPractice } from './practice-selection';

const overrides = JSON.parse(readFileSync(new URL('../content/catalog/review-overrides.json', import.meta.url), 'utf8')) as Record<string, { image?: { alt: string } }>;

async function storedHistory(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction('attempts').objectStore('attempts').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
}

test('writing Dev review reports matching endings and scoped fallbacks without saving history', async ({ page }) => {
  await selectWordPractice(page, ['ja-wanikani-5-writing']);
  await page.addInitScript(() => { Math.random = () => .999; });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Dev review', exact: true })).toBeEnabled();
  const before = await storedHistory(page);
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  await page.getByRole('button', { name: 'Clear levels' }).click();
  await page.getByRole('checkbox', { name: 'Familiar', exact: true }).check();
  await page.getByRole('combobox', { name: 'Timer behavior', exact: true }).selectOption('untimed');
  await page.getByRole('button', { name: 'Start dev review', exact: true }).click();
  for (const text of ['考古学', '牛肉']) {
    await expect(page.getByRole('status', { name: 'Writing distractor matching' })).toHaveCount(0);
    const source = await page.locator('.app > audio').getAttribute('src');
    await page.getByRole('button', { name: `Choose writing ${text}`, exact: true }).click();
    await expect(page.locator('.app > audio')).not.toHaveAttribute('src', source!);
  }
  await expect(page.getByRole('button', { name: 'Choose writing 青い', exact: true })).toBeEnabled();
  const choices = await page.locator('.choices .written-answer').allTextContents();
  const matching = choices.filter(text => text !== '青い' && /\p{Script=Han}/u.test(text) && text.match(/[\p{Script=Hiragana}]+$/u)?.[0] === 'い').length;
  await expect(page.getByRole('status', { name: 'Writing distractor matching' })).toHaveText(`Kana ending “い”: ${matching} matching, ${3 - matching} fallback.`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await storedHistory(page)).toEqual(before);
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dev review', exact: true })).toBeEnabled();
  expect(await storedHistory(page)).toEqual(before);
});

test('Dev review opens options, simulates selected writing mastery and leaves real browser history untouched', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Dev review', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Mastery demo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Contextual dev review', exact: true })).toHaveCount(0);
  const before = await storedHistory(page);
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dev review options' })).toBeFocused();
  await expect(page.locator('.quiz')).toHaveCount(0);
  await expect(page.locator('audio')).not.toHaveAttribute('src');
  await page.getByRole('checkbox', { name: 'Words · Pictures', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Clear levels' }).click();
  await expect(page.getByRole('button', { name: 'Start dev review' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Confident', exact: true }).check();
  for (const name of ['Questions', 'Timer behavior']) {
    expect((await page.getByRole('combobox', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByLabel('Questions', { exact: true }).selectOption('6');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Start dev review' }).click();
  await expect(page.locator('.quiz')).toHaveAttribute('data-exercise', 'audio-text');
  await expect(page.locator('.choices')).toHaveClass(/choices-audio-first/);
  const current = page.getByRole('status', { name: 'Demo mastery' });
  await expect(current).toContainText('Confident');
  await expect(current).toContainText('1.5s');
  const source = await page.locator('.app > audio').getAttribute('src');
  // Practice retains starter writing (e.g. りんご) ahead of catalogue variants (リンゴ).
  const target = [...starter.items, ...catalogue.items].find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  const replay = page.getByRole('button', { name: 'Replay word' });
  await replay.click();
  await expect(page.locator('.app > audio')).toHaveAttribute('src', source!);
  await page.getByRole('button', { name: `Choose writing ${target.text}`, exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-answer');
  expect(await storedHistory(page)).toEqual(before);
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dev review', exact: true })).toBeEnabled();
  expect(await storedHistory(page)).toEqual(before);
});

test('contextual samples use selected mastery timers and keep real progress unchanged', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Dev review', exact: true })).toBeEnabled();
  const before = await storedHistory(page);
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Words · Pictures', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Words · Writing', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Simple contexts · Pictures', exact: true }).check();
  await page.getByRole('button', { name: 'Clear levels' }).click();
  await page.getByRole('checkbox', { name: 'Strong', exact: true }).check();
  await page.getByRole('button', { name: 'Start dev review' }).click();
  await expect(page.locator('.contextual-practice')).toHaveAttribute('data-exercise', 'context-simple-picture');
  await expect(page.getByRole('status', { name: 'Demo mastery' })).toContainText('Strong');
  await expect(page.getByRole('status', { name: 'Demo mastery' })).toContainText('3s');
  await expect(page.locator('.quiz-timer-fill')).toHaveCount(0);
  await expect(page.locator('.contextual-choices')).toHaveClass(/choices-audio-first/);
  await expect(page.locator('.contextual-choices')).toBeHidden();
  const quiz = page.locator('.contextual-quiz');
  const questionId = await quiz.getAttribute('data-question-id');
  const question = authoredContextualQuestion(questionId);
  const wrong = question.options.find(option => option.id !== question.correctOptionId)!;
  const imageId = wrong.imageItemId!;
  const alt = overrides[imageId]?.image?.alt ?? catalogue.items.find(item => item.id === imageId)!.image.alt;
  await quiz.getByRole('button', { name: /Choose picture/ }).filter({ has: page.getByRole('img', { name: alt, exact: true }) }).click();
  const badge = page.getByRole('img', { name: 'Mastery decreased to Learning', exact: true });
  await expect(badge).toHaveCount(1);
  await expect(badge).toBeVisible();
  const japanese = page.getByRole('button', { name: 'Show Japanese', exact: true });
  await expect(japanese).toBeVisible();
  const control = (await japanese.boundingBox())!;
  expect(control.width).toBeGreaterThanOrEqual(44);
  expect(control.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await japanese.click();
  const details = page.getByRole('dialog', { name: 'Japanese', exact: true });
  await expect(details.getByText(question.prompt.meaning, { exact: true })).toBeHidden();
  const popup = await details.boundingBox();
  await details.getByRole('button', { name: 'Show English', exact: true }).click();
  await expect(details.getByText(question.prompt.meaning, { exact: true })).toBeVisible();
  expect(await details.boundingBox()).toEqual(popup);
  await details.getByRole('button', { name: 'Close Japanese', exact: true }).click();
  await expect(japanese).toBeFocused();
  expect(await storedHistory(page)).toEqual(before);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.contextual-practice')).toHaveAttribute('data-exercise', 'context-simple-picture');
  await expect(badge).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Demo mastery' })).toContainText('Strong');
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  expect(await storedHistory(page)).toEqual(before);
  await page.reload();
  expect(await storedHistory(page)).toEqual(before);
});

test('options respect language and handle empty selected packs', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  const types = page.getByRole('group', { name: 'Review types', exact: true });
  await expect(types.getByRole('checkbox')).toHaveCount(2);
  await expect(types.getByRole('checkbox', { name: 'Words · Pictures', exact: true })).toBeVisible();
  await types.getByRole('checkbox', { name: 'Simple contexts · Pictures', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Start dev review' }).click();
  await expect(page.locator('.quiz')).toHaveAttribute('data-exercise', 'audio-picture');
  await expect(page.locator('.app > audio')).toHaveAttribute('src', /es-419/);
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('kikimashta-card-packs-v1:es-419', '[]'));
  await page.reload();
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Review types', exact: true }).getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start dev review' })).toBeDisabled();
  const libraryLink = page.getByRole('link', { name: 'Card library', exact: true });
  await expect(libraryLink).toHaveAttribute('href', /language=es-419/);
  const library = await page.context().newPage();
  await library.goto(new URL((await libraryLink.getAttribute('href'))!, page.url()).href);
  await library.getByRole('checkbox', { name: 'Travel level 1 · Pictures' }).check();
  await library.close();
  await page.bringToFront();
  await expect(types.getByRole('checkbox')).toHaveAccessibleName('Words · Pictures');
  await expect(page.getByRole('button', { name: 'Start dev review' })).toBeEnabled();
});

test('contextual countdown starts after paired audio, survives replay and gives partial credit after expiry', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  const before = await storedHistory(page);
  for (const name of ['Words · Pictures', 'Words · Writing']) await page.getByRole('checkbox', { name, exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Simple contexts · Writing', exact: true }).check();
  await page.getByRole('button', { name: 'Clear levels' }).click();
  await page.getByRole('checkbox', { name: 'Confident', exact: true }).check();
  await page.getByRole('button', { name: 'Start dev review' }).click();
  await expect(page.getByRole('status', { name: 'Demo mastery' })).toContainText('1.5s');
  await expect(page.locator('.quiz-timer-fill')).toHaveCount(0);
  await expect(page.locator('.contextual-choices')).toHaveClass(/choices-audio-first/);
  await expect(page.locator('.contextual-choices')).toBeHidden();
  const quiz = page.locator('.contextual-quiz');
  // Wait for the native sentence and question playback to finish.
  await expect(page.locator('.quiz-timer-fill')).toBeAttached({ timeout: 20000 });
  await expect(page.locator('.contextual-choices')).toBeVisible();
  await expect(page.locator('.contextual-choices .choice-slot').first()).toHaveCSS('transform', 'none');
  const questionId = await quiz.getAttribute('data-question-id');
  const current = authoredContextualQuestion(questionId);
  const correct = current.options.find(option => option.id === current.correctOptionId)!;
  await page.getByRole('button', { name: 'Replay sentence and question', exact: true }).click();
  await expect(page.getByText('Take your time. A correct answer still counts as partial success.', { exact: true })).toBeAttached();
  await quiz.getByRole('button', { name: `Choose writing ${correct.text}`, exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-answer', 'partial');
  await expect(page.getByLabel('Partial success', { exact: true })).toHaveText('≈');
  expect(await storedHistory(page)).toEqual(before);
});
