import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import starter from '../content/ja.json' with { type: 'json' };
import type { PracticeAttempt, WordItem } from '../src/types';

const catalogue = JSON.parse(readFileSync(new URL('../content/catalog/ja.json', import.meta.url), 'utf8')) as { items: WordItem[] };

test('mastery demo covers every level, shows arrows, and leaves real progress untouched', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { Math.random = () => .5; });
  await page.clock.install();
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Mastery demo', exact: true })).toBeEnabled();
  const history = () => page.evaluate(async () => {
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
  const original = await history();
  await page.getByRole('button', { name: 'Mastery demo', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '8');
  for (const label of ['New', 'Learning', 'Improving', 'Familiar', 'Steady', 'Strong', 'Confident', 'Mastered', 'Learning']) {
    await expect(page.getByRole('status', { name: 'Demo mastery' })).toContainText(label + ' ·');
    await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).ended)).toBe(true);
    const source = await page.locator('audio').getAttribute('src');
    const target = [...starter.items, ...catalogue.items].find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
    const exercise = await page.locator('.quiz').getAttribute('data-exercise');
    const choices = page.getByRole('button', { name: /choose (picture|writing)/i });
    const correct = exercise === 'audio-text' ? page.getByRole('button', { name: 'Choose writing ' + target.text, exact: true })
      : choices.filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) });
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    if (label === 'Strong') {
      const wrong = exercise === 'audio-text' ? choices.filter({ hasNotText: target.text }).first()
        : choices.filter({ hasNot: page.getByRole('img', { name: target.image.alt, exact: true }) }).first();
      await wrong.click();
      await expect(page.getByLabel('Mastery decreased to Learning')).toContainText('Learning');
      await expect(page.locator('.mastery-caption')).toHaveText('Level down');
      await expect(page.locator('.mastery-down')).toHaveCSS('animation-name', 'none');
      await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeInViewport();
      await page.screenshot({ path: `test-results/mastery-demo-${testInfo.project.name}.png` });
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    } else {
      await correct.click();
      if (label === 'New') {
        await expect(page.getByLabel('Mastery increased to Learning')).toContainText('Learning');
        await expect(page.locator('.mastery-caption')).toHaveText('Level up');
        await expect(page.locator('.mastery-up')).toHaveCSS('animation-name', 'none');
        await expect(page.locator('.mastery-sparks')).toBeHidden();
      }
      await expect(page.getByText(/^(Got it!|Try this one\.|Got it — take your time\.)$/)).toHaveCount(0);
      await expect(page.locator('.app')).toHaveAttribute('data-answer', /correct|partial/);
      await page.clock.fastForward(1200);
      await expect(page.locator('.app')).not.toHaveAttribute('data-answer', /correct|partial/);
    }
    await page.clock.resume();
  }
  await expect(page.getByRole('heading', { name: 'Mastery demo complete' })).toBeVisible();
  expect(await history()).toEqual(original);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await expect(page.getByRole('status', { name: 'Demo mastery' })).toHaveCount(0);
  expect(await history()).toEqual(original);
});

test('level-up animation fits the feedback space without moving cards', async ({ page }, testInfo) => {
  await page.addInitScript(() => { Math.random = () => .5; });
  await page.clock.install();
  await page.goto('./');
  await page.getByRole('button', { name: 'Mastery demo', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).ended)).toBe(true);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const before = await page.locator('.choices').boundingBox();
  const source = await page.locator('audio').getAttribute('src');
  const target = [...starter.items, ...catalogue.items].find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  const exercise = await page.locator('.quiz').getAttribute('data-exercise');
  const correct = exercise === 'audio-text' ? page.getByRole('button', { name: 'Choose writing ' + target.text, exact: true })
    : page.getByRole('button', { name: /choose picture/i }).filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) });
  await correct.click();
  const badge = page.getByRole('img', { name: 'Mastery increased to Learning', exact: true });
  await expect(badge).toBeVisible();
  await expect(badge.locator('.mastery-caption')).toHaveText('Level up');
  await expect(badge.locator('.mastery-arrow')).toHaveText('↑');
  await expect(badge).toHaveCSS('animation-name', 'mastery-pop');
  await expect(badge.locator('.mastery-arrow')).toHaveCSS('animation-name', 'mastery-arrow-up');
  await expect(badge.locator('.mastery-sparks i')).toHaveCount(6);
  const fits = await badge.evaluate(element => {
    const badge = element.getBoundingClientRect(), feedback = element.parentElement!.getBoundingClientRect();
    return badge.height <= feedback.height && badge.width <= innerWidth;
  });
  expect(fits).toBe(true);
  const after = await page.locator('.choices').boundingBox();
  expect(after).toEqual(before);
  await page.screenshot({ path: `test-results/mastery-level-up-${testInfo.project.name}.png`, animations: 'disabled' });
  await expect(page.getByText(/^(Got it!|Try this one\.|Got it — take your time\.)$/)).toHaveCount(0);
});
