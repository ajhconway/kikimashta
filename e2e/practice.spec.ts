import { expect, test, type Page } from '@playwright/test';
import bank from '../content/ja.json' with { type: 'json' };

async function chooseHeardPicture(page: Page) {
  for (const image of await page.locator('img').all()) {
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  const audio = page.locator('audio');
  await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(2);
  const source = await audio.getAttribute('src');
  const target = bank.items.find(item => source?.endsWith(item.audio.src));
  expect(target, 'the current recording belongs to the word bank').toBeDefined();
  const choice = page.getByRole('button', { name: /choose picture/i }).filter({
    has: page.getByRole('img', { name: target!.image.alt, exact: true }),
  });
  await choice.click();
  await expect(page.getByText('You found it.', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const choices = document.querySelector('.choices')!.getBoundingClientRect();
    const feedback = document.querySelector('.feedback')!.getBoundingClientRect();
    const cards = Array.from(document.querySelectorAll('.picture-choice'), card => card.getBoundingClientRect());
    return document.documentElement.scrollWidth <= innerWidth
      && cards.every(card => card.left >= choices.left - 1 && card.right <= choices.right + 1
        && card.bottom <= feedback.top && Math.abs(card.width - card.height) <= 1);
  }), { message: 'picture cards fit the viewport and leave feedback unobscured' }).toBe(true);
}

test('preview, complete a short round, and retain real device progress after reload', async ({ page }, testInfo) => {
  await page.goto('./');
  for (const image of await page.locator('img').all()) {
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.screenshot({ path: 'test-results/home-' + testInfo.project.name + '.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: /let's listen/i }).click();
  await expect(page.getByRole('heading', { name: /look. listen. let it sink in/i })).toBeVisible();
  await expect.poll(() => page.locator('img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/preview-' + testInfo.project.name + '.png', fullPage: true, animations: 'disabled' });
  for (let i = 0; i < bank.items.length - 1; i++) {
    await page.getByRole('button', { name: /next little word/i }).click();
  }
  await page.getByRole('button', { name: /play a round/i }).click();
  for (let i = 0; i < bank.items.length; i++) {
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(i));
    await chooseHeardPicture(page);
    if (i === 0) await page.screenshot({ path: 'test-results/quiz-' + testInfo.project.name + '.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: i + 1 === bank.items.length ? /see how you did/i : /next sound/i }).click();
  }
  await expect(page.getByRole('heading', { name: /nicely listened/i })).toBeVisible();
  await expect(page.getByText(`${bank.items.length} / ${bank.items.length}`, { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/summary-' + testInfo.project.name + '.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: /back to the beginning/i }).click();
  await expect(page.getByText(`${bank.items.length} answers tucked away on this device`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`${bank.items.length} answers tucked away on this device`)).toBeVisible();
});

test('an unavailable recording can be retried without recording a premature answer', async ({ page }) => {
  await page.route('**/audio/*.mp3', route => route.abort());
  await page.goto('./');
  await page.getByRole('button', { name: /jump into a round/i }).click();
  await expect(page.getByRole('alert')).toContainText(/sound couldn't play/i);
  for (const choice of await page.getByRole('button', { name: /choose picture/i }).all()) await expect(choice).toBeDisabled();
  await page.unroute('**/audio/*.mp3');
  await page.getByRole('button', { name: /replay word/i }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await chooseHeardPicture(page);
  await page.getByRole('button', { name: /kikimashta home/i }).click();
  await page.reload();
  await expect(page.getByText('1 answer tucked away on this device')).toBeVisible();
});
