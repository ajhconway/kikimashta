import { expect, test, type Page } from '@playwright/test';
import bank from '../content/ja.json' with { type: 'json' };

const backgroundColor = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

async function captureScreen(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/' + name + '.png', fullPage: true, animations: 'disabled' });
}

async function checkMobilePracticeSizes(page: Page, pictureSelector: string, name: string) {
  const original = page.viewportSize()!;
  for (const viewport of [{ width: 390, height: 664 }, { width: 430, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(selector => {
      const app = document.querySelector('.app')!.getBoundingClientRect();
      const picture = document.querySelector(selector)!.getBoundingClientRect();
      const action = document.querySelector('.practice-actions .primary')!.getBoundingClientRect();
      return Math.abs(app.height - innerHeight) <= 1
        && document.documentElement.scrollHeight <= innerHeight + 1
        && document.documentElement.scrollWidth <= innerWidth
        && picture.width >= innerWidth - 48 && picture.height >= innerHeight * .35
        && action.bottom <= innerHeight && action.bottom >= innerHeight - 48;
    }, pictureSelector), { message: 'practice fills the phone viewport with large pictures and a reachable bottom action' }).toBe(true);
    await captureScreen(page, name + '-' + viewport.width);
  }
  await page.setViewportSize(original);
}

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
  await expect(page.getByText('Got it!', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const choices = document.querySelector('.choices')!.getBoundingClientRect();
    const feedback = document.querySelector('.feedback')!.getBoundingClientRect();
    const cards = Array.from(document.querySelectorAll('.picture-choice'), card => card.getBoundingClientRect());
    return document.documentElement.scrollWidth <= innerWidth
      && cards.every(card => card.left >= choices.left - 1 && card.right <= choices.right + 1
        && card.bottom <= feedback.top);
  }), { message: 'picture cards fit the viewport and leave feedback unobscured' }).toBe(true);
}

test('preview, complete a short round, and retain real device progress after reload', async ({ page }, testInfo) => {
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
  for (let i = 0; i < bank.items.length; i++) {
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(i));
    const beforeAnswer = i === 0 && testInfo.project.use.isMobile ? await page.locator('.choices').boundingBox() : null;
    await chooseHeardPicture(page);
    if (i === 0) {
      await captureScreen(page, 'quiz-' + testInfo.project.name);
      if (testInfo.project.use.isMobile) {
        const afterAnswer = await page.locator('.choices').boundingBox();
        expect(Math.abs(afterAnswer!.height - beforeAnswer!.height), 'answer feedback keeps the picture grid stable').toBeLessThanOrEqual(1);
        await checkMobilePracticeSizes(page, '.choices', 'quiz-mobile');
        await expect(page.getByRole('button', { name: /next sound/i })).toBeInViewport({ ratio: 1 });
      }
    }
    await page.getByRole('button', { name: i + 1 === bank.items.length ? /see results/i : /next sound/i }).click();
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
