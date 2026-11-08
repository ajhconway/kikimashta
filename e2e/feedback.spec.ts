import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from './fixtures';

async function downloadFeedback(page: Page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /export feedback/i }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^kikimashta-feedback-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  return JSON.parse(await readFile(path!, 'utf8'));
}

test('card feedback survives paging, filters and reload; export includes hidden notes', async ({ page }) => {
  await page.goto('./vocabulary/');
  await expect(page.locator('.card')).toHaveCount(24);
  const above = page.locator('article[data-exercise="audio-picture"]').filter({ has: page.getByRole('heading', { name: '上', exact: true }) });
  await above.locator('.card-feedback summary').click();
  await above.getByLabel('Your notes').fill('Show more space above the shelf.\n余白');
  await expect(above.locator('.feedback-status')).toHaveText('Saved on this device.');
  await above.screenshot({ path: `test-results/card-feedback-${test.info().project.name}.png` });
  await page.getByRole('button', { name: 'Next →', exact: true }).click();
  await page.getByRole('button', { name: '← Previous', exact: true }).click();
  await above.locator('.card-feedback summary').click();
  await expect(above.getByLabel('Your notes')).toHaveValue('Show more space above the shelf.\n余白');
  await page.getByLabel('Card pack').selectOption('ja-wanikani-2-pictures');
  await page.getByLabel('Search words').fill('Dog');
  const dog = page.locator('article[data-exercise="audio-picture"]').filter({ has: page.getByRole('heading', { name: '犬', exact: true }) });
  await dog.locator('.card-feedback summary').click();
  await dog.getByLabel('Your notes').fill('Cedar sounds good. <keep this text>');
  await page.reload();
  await page.getByLabel('Search words').fill('Dog');
  await expect(dog.locator('.card-feedback summary')).toHaveText('Your feedback · Has notes');
  await dog.locator('.card-feedback summary').click();
  await expect(dog.getByLabel('Your notes')).toHaveValue('Cedar sounds good. <keep this text>');
  const exported = await downloadFeedback(page);
  expect(exported).toMatchObject({ format: 'kikimashta-card-feedback', version: 1, language: 'ja' });
  expect(exported.notes).toHaveLength(2);
  expect(exported.notes).toContainEqual(expect.objectContaining({ itemId: 'ja-dog', text: '犬', reading: 'いぬ', meaning: 'Dog', sourceLevel: 2, feedback: 'Cedar sounds good. <keep this text>' }));
  expect(exported.notes).toContainEqual(expect.objectContaining({ text: '上', feedback: 'Show more space above the shelf.\n余白' }));
  await expect(dog.getByLabel('Your notes')).toHaveValue('Cedar sounds good. <keep this text>');
  await dog.getByLabel('Your notes').fill('');
  await expect(dog.locator('.feedback-status')).toHaveText('Feedback cleared.');
  await expect(page.getByRole('button', { name: 'Export feedback (1)', exact: true })).toBeEnabled();
  await page.reload();
  await page.getByLabel('Search words').fill('Dog');
  await expect(dog.locator('.card-feedback summary')).toHaveText('Your feedback');
  await dog.locator('.card-feedback summary').click();
  await expect(dog.getByLabel('Your notes')).toHaveValue('');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('failed saves keep an editable draft across navigation and allow export', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('kikimashta:card-feedback:')) throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('./vocabulary/');
  const above = page.locator('article[data-exercise="audio-picture"]').filter({ has: page.getByRole('heading', { name: '上', exact: true }) });
  await above.locator('.card-feedback summary').click();
  await above.getByLabel('Your notes').fill('Unsaved feedback 日本語');
  await expect(above.locator('.feedback-status')).toContainText('Could not save');
  await page.getByRole('button', { name: 'Next →', exact: true }).click();
  await page.getByRole('button', { name: '← Previous', exact: true }).click();
  await above.locator('.card-feedback summary').click();
  await expect(above.getByLabel('Your notes')).toHaveValue('Unsaved feedback 日本語');
  await expect(above.locator('.feedback-status')).toContainText('Could not save');
  const exported = await downloadFeedback(page);
  expect(exported.notes).toEqual([expect.objectContaining({ text: '上', feedback: 'Unsaved feedback 日本語' })]);
});
