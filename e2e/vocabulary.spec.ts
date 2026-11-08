import { expect, test } from './fixtures';
import catalog from '../content/catalog/ja.json' with { type: 'json' };

const voiceNames = ['Otani', 'Morioki', 'Goro', 'Tsuki', 'Takeshi', 'Lime', 'Ritsuto', 'Itsuki'];

test('browse picture packs, search cards, and retry a voice recording', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: /card library/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vocabulary cards');
  await expect(page.locator('#results-status')).toContainText('440 cards');
  await expect(page.locator('.card')).toHaveCount(24);
  await page.getByLabel('Card pack').selectOption('ja-wanikani-2-pictures');
  await expect(page.locator('#results-status')).toContainText('79 cards');
  await page.getByLabel('Search words').fill('Dog');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('犬');
  await expect(page.locator('.card-image')).toHaveAttribute('src', /images\/approved\/ja-dog-[a-f0-9]+\.jpg$/);
  await expect.poll(() => page.locator('.card-image').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const voices = page.getByRole('group', { name: 'Japanese voices for Dog', exact: true });
  await expect(voices.getByRole('button')).toHaveCount(8);
  for (const voice of voiceNames) await expect(voices.getByRole('button', { name: `${voice}: Dog`, exact: true })).toBeEnabled();
  await voices.getByRole('button', { name: 'Otani: Dog', exact: true }).click();
  await expect(page.locator('#audio-status')).toContainText('Otani');
  await voices.getByRole('button', { name: 'Stop Otani: Dog', exact: true }).click();
  const retryRecording = catalog.items.find(item => item.id === 'ja-dog')?.audio.find(clip => clip.voice === 'morioki');
  expect(retryRecording, 'Dog has a Morioki recording to retry').toBeDefined();
  const retryRoute = `**/${retryRecording!.src}`;
  await page.route(retryRoute, route => route.abort());
  await voices.getByRole('button', { name: 'Morioki: Dog', exact: true }).click();
  await expect(page.locator('#audio-error')).toBeVisible();
  await expect(page.locator('#audio-error')).toContainText('Morioki');
  await page.unroute(retryRoute);
  await voices.getByRole('button', { name: 'Morioki: Dog', exact: true }).click();
  await expect(page.locator('#audio-error')).toBeHidden();
  await page.getByLabel('Card pack').selectOption('all');
  await page.getByLabel('Search words').fill('～形');
  await expect(page.locator('#results-status')).toContainText('No matching words.');
  await expect(page.locator('.card')).toHaveCount(0);
  await page.getByLabel('Search words').fill('りんご');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('リンゴ');
  await expect(page.locator('.card-image')).toHaveAttribute('src', /images\/approved\/ja-apple-[a-f0-9]+\.jpg$/);
  await expect.poll(() => page.locator('.card-image').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(640);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('render contact sheets for every vocabulary illustration', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One set of visual review sheets is sufficient.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('./vocabulary/');
  await expect(page.locator('.card')).toHaveCount(24);
  await page.addStyleTag({ content: 'main{max-width:1440px}.cards{grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.card-image{height:140px;padding:5px}.card-content{padding:6px}.japanese{font-size:18px}.reading,.meaning{font-size:12px;margin:2px}.picture-notes,.voices,.review-badge,.audio-status,.page-header p{display:none!important}.level-label{font-size:10px;margin:0}' });
  for (let level = 1; level <= 5; level++) {
    await page.getByLabel('Card pack').selectOption(`ja-wanikani-${level}-pictures`);
    let number = 1;
    while (true) {
      await page.locator('.card-image').evaluateAll(images => images.forEach(image => { (image as HTMLImageElement).loading = 'eager'; }));
      await expect.poll(() => page.locator('.card-image').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `test-results/catalog-level-${level}-page-${number}.png`, fullPage: true, animations: 'disabled' });
      if (await page.getByRole('button', { name: 'Next →', exact: true }).isDisabled()) break;
      await page.getByRole('button', { name: 'Next →', exact: true }).click();
      number++;
    }
  }
});

test('ten packs keep level membership and switch between pictures and writing', async ({ page }) => {
  await page.goto('./vocabulary/');
  const selector = page.getByLabel('Card pack');
  await expect(selector.locator('option')).toHaveCount(11);
  await expect(page.locator('.card')).toHaveCount(24);
  for (let level = 1; level <= 5; level++) {
    await selector.selectOption(`ja-wanikani-${level}-pictures`);
    const pictureCount = await page.locator('.card').count();
    expect(pictureCount).toBeGreaterThan(0);
    const headings = await page.locator('.card h2').allTextContents();
    await expect(page.locator('.card .level-label')).toHaveText(Array(pictureCount).fill(`Level ${level}`));
    await expect(page.locator('.card-image')).toHaveCount(pictureCount);
    await selector.selectOption(`ja-wanikani-${level}-writing`);
    await expect(page.locator('.card h2')).toHaveText(headings);
    await expect(page.locator('.card-writing')).toHaveText(headings);
    await expect(page.locator('.card-image, .picture-notes, .review-badge')).toHaveCount(0);
  }
  await selector.selectOption('ja-wanikani-2-writing');
  await page.getByRole('button', { name: 'Next →', exact: true }).click();
  await expect(page.locator('#page-status')).toContainText('Page 2');
  await page.getByLabel('Search words').fill('Dog');
  await expect(page.locator('#page-status')).toHaveText('Page 1 of 1');
  await expect(page.locator('.card-writing')).toHaveText('犬');
  const dog = page.getByRole('article', { name: '犬', exact: true });
  await dog.locator('.card-feedback summary').click();
  await dog.getByLabel('Your notes').fill('Check this pronunciation.');
  await expect(dog.locator('.feedback-status')).toHaveText('Saved on this device.');
  await selector.selectOption('ja-wanikani-2-pictures');
  await dog.locator('.card-feedback summary').click();
  await expect(dog.getByLabel('Your notes')).toHaveValue('Check this pronunciation.');
  await page.getByRole('button', { name: 'Otani: Dog', exact: true }).click();
  await expect(page.locator('#audio-status')).toContainText('Otani');
  await selector.selectOption('ja-wanikani-1-writing');
  await expect(page.locator('#audio-status')).toBeEmpty();
  await expect(page.locator('#results-status')).toContainText('No matching words');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next →', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '← Previous', exact: true })).toBeDisabled();
});
