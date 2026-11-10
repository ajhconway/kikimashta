import { expect, test } from './fixtures';
import catalog from '../content/catalog/ja.json' with { type: 'json' };

const voiceNames = ['Otani', 'Morioki', 'Goro', 'Tsuki', 'Takeshi', 'Lime', 'Ritsuto', 'Itsuki'];

test('browse picture packs, search cards, and retry a voice recording', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: /card library/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vocabulary cards');
  await expect(page.locator('#results-status')).toContainText('880 cards');
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
  for (const voice of voiceNames) {
    const accent = ['Goro', 'Tsuki'].includes(voice) ? 'Kansai' : ['Takeshi', 'Lime'].includes(voice) ? 'Kyushu' : ['Ritsuto', 'Itsuki'].includes(voice) ? 'Anime (standard)' : 'Tokyo (standard)';
    const button = voices.getByRole('button', { name: `${voice}: Dog`, exact: true });
    await expect(button).toBeEnabled();
    await expect(button.locator('.voice-accent')).toHaveText(accent);
    await expect(button).toHaveAccessibleDescription(accent);
    await expect(page.getByRole('checkbox', { name: voice, exact: true })).toHaveAccessibleDescription(accent);
  }
  await voices.getByRole('button', { name: 'Otani: Dog', exact: true }).click();
  await expect(page.locator('#audio-status')).toContainText('Otani');
  await expect(voices.getByRole('button', { name: 'Stop Otani: Dog', exact: true }).locator('.voice-accent')).toHaveText('Tokyo (standard)');
  await voices.getByRole('button', { name: 'Stop Otani: Dog', exact: true }).click();
  await expect(voices.getByRole('button', { name: 'Otani: Dog', exact: true }).locator('.voice-accent')).toHaveText('Tokyo (standard)');
  const retryRecording = catalog.items.find(item => item.id === 'ja-dog')?.audio.find(clip => clip.voice === 'morioki');
  expect(retryRecording, 'Dog has a Morioki recording to retry').toBeDefined();
  const retryRoute = `**/${retryRecording!.src}`;
  await page.route(retryRoute, route => route.abort());
  await voices.getByRole('button', { name: 'Morioki: Dog', exact: true }).click();
  await expect(page.locator('#audio-error')).toBeVisible();
  await expect(page.locator('#audio-error')).toContainText('Morioki');
  await expect(voices.getByRole('button', { name: 'Morioki: Dog', exact: true }).locator('.voice-accent')).toHaveText('Tokyo (standard)');
  await page.unroute(retryRoute);
  await voices.getByRole('button', { name: 'Morioki: Dog', exact: true }).click();
  await expect(page.locator('#audio-error')).toBeHidden();
  await page.getByLabel('Card pack').selectOption('all');
  await page.getByLabel('Search words').fill('～形');
  await expect(page.locator('#results-status')).toContainText('No matching words.');
  await expect(page.locator('.card')).toHaveCount(0);
  await page.getByLabel('Search words').fill('りんご');
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['リンゴ', 'リンゴ']);
  await expect(page.locator('.card-writing')).toHaveText('リンゴ');
  await expect(page.locator('.card-image')).toHaveAttribute('src', /images\/approved\/ja-apple-[a-f0-9]+\.jpg$/);
  await expect.poll(() => page.locator('.card-image').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(640);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
