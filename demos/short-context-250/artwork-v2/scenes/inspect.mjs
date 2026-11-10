// Manual artwork review capture; not part of the routine app test suite.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(new URL('./review.html', import.meta.url).href);
  await page.locator('img').evaluateAll(async images => {
    await Promise.all(images.map(image => image.decode()));
    if (images.some(image => !image.complete || !image.naturalWidth)) throw new Error('Undecodable scene image');
  });
  await page.screenshot({ path: fileURLToPath(new URL('./review-145px.png', import.meta.url)), fullPage: true });
  console.log(JSON.stringify({ imagesDecoded: await page.locator('img').count(), previewSize: 145, backgrounds: ['#fff', '#fff2c5', '#fff0f5', '#f6efff'] }));
} finally {
  await browser.close();
}
