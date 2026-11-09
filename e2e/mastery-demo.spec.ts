import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import starter from '../content/ja.json' with { type: 'json' };
import type { WordItem } from '../src/types';

const catalogue = JSON.parse(readFileSync(new URL('../content/catalog/ja.json', import.meta.url), 'utf8')) as { items: WordItem[] };

test('level-up animation fits the original layout without moving cards', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => .5; });
  await page.clock.install();
  await page.goto('./');
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  await page.getByRole('button', { name: 'Clear levels', exact: true }).click();
  await page.getByRole('checkbox', { name: 'New', exact: true }).check();
  await page.getByRole('button', { name: 'Start dev review', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).ended)).toBe(true);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const context = page.getByRole('status', { name: 'Demo mastery' });
  await expect(context.locator('.question-mastery-label')).toHaveText('New');
  await expect(context.locator('.question-mastery-timer')).toHaveText('Untimed');
  const contextLabel = (await context.locator('.question-mastery-label').boundingBox())!;
  const contextTimer = (await context.locator('.question-mastery-timer').boundingBox())!;
  const before = await page.locator('.choices').boundingBox();
  expect(contextLabel.y).toBeGreaterThan(before!.y + before!.height);
  const source = await page.locator('audio').getAttribute('src');
  const target = [...starter.items, ...catalogue.items].find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  const exercise = await page.locator('.quiz').getAttribute('data-exercise');
  const correct = exercise === 'audio-text' ? page.getByRole('button', { name: 'Choose writing ' + target.text, exact: true })
    : page.getByRole('button', { name: /choose picture/i }).filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) });
  await correct.click();
  const badge = page.getByRole('img', { name: 'Mastery increased to Learning', exact: true });
  await expect(badge).toBeVisible();
  await expect(page.locator('.question-mastery')).toBeHidden();
  await expect(badge.locator('.mastery-arrow')).toHaveText('↑');
  const fits = await badge.evaluate(element => {
    const animation = element.getAnimations().find(animation => animation instanceof CSSAnimation && animation.animationName === 'mastery-pop')!;
    animation.pause();
    const duration = Number(animation.effect!.getTiming().duration);
    const feedback = element.parentElement!.getBoundingClientRect();
    const cards = document.querySelector('.choices')!.getBoundingClientRect();
    const samples = [0, .55, 1].map(fraction => {
      animation.currentTime = duration * fraction;
      const badge = element.getBoundingClientRect();
      // The badge can use the gap above feedback and the 8px gap before Continue.
      return badge.top >= cards.bottom - 1 && badge.bottom <= feedback.bottom + 4
        && badge.left >= 0 && badge.right <= innerWidth;
    });
    animation.currentTime = duration;
    return samples.every(Boolean);
  });
  expect(fits).toBe(true);
  const overlay = (await badge.boundingBox())!;
  for (const text of [contextLabel, contextTimer]) {
    expect(overlay.x).toBeLessThanOrEqual(text.x);
    expect(overlay.x + overlay.width).toBeGreaterThanOrEqual(text.x + text.width);
    expect(overlay.y).toBeLessThanOrEqual(text.y);
    expect(overlay.y + overlay.height).toBeGreaterThanOrEqual(text.y + text.height);
  }
  const after = await page.locator('.choices').boundingBox();
  expect(after).toEqual(before);
});
