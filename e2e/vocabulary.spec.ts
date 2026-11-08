import { expect, test } from './fixtures';
import catalog from '../content/catalog/ja.json' with { type: 'json' };
import spanish from '../content/es-419.json' with { type: 'json' };

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

test('render contact sheets for every vocabulary illustration', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One set of visual review sheets is sufficient.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('./vocabulary/');
  await expect(page.locator('.card')).toHaveCount(24);
  await page.addStyleTag({ content: 'main{max-width:1440px}.cards{grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.card-image{height:140px;padding:5px}.card-content{padding:6px}.word-text{font-size:18px}.reading,.meaning{font-size:12px;margin:2px}.picture-notes,.voices,.review-badge,.audio-status,.page-header p{display:none!important}.pack-labels{font-size:10px;margin:0}' });
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
    const picturePackName = `WaniKani level ${level} · Pictures`;
    const writingPackName = `WaniKani level ${level} · Writing`;
    await expect(page.locator('.card .pack-labels span')).toHaveText(Array.from({ length: pictureCount }, () => picturePackName));
    await expect(page.locator('.level-label')).toHaveCount(0);
    await expect(page.locator('.card-image')).toHaveCount(pictureCount);
    await selector.selectOption(`ja-wanikani-${level}-writing`);
    await expect(page.locator('.card h2')).toHaveText(headings);
    await expect(page.locator('.card-writing')).toHaveText(headings);
    await expect(page.locator('.card .pack-labels span')).toHaveText(Array.from({ length: pictureCount }, () => writingPackName));
    await expect(page.locator('.card-image, .picture-notes, .review-badge')).toHaveCount(0);
  }
  await selector.selectOption('ja-wanikani-2-writing');
  await page.getByRole('button', { name: 'Next →', exact: true }).click();
  await expect(page.locator('#page-status')).toContainText('Page 2');
  await page.getByLabel('Search words').fill('Dog');
  await expect(page.locator('#page-status')).toHaveText('Page 1 of 1');
  await expect(page.locator('.card-writing')).toHaveText('犬');
  const dog = page.getByRole('article', { name: /^犬 (Pictures|Writing)$/ });
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


test('library mastery survives reload and stays specific to picture and writing cards', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('attempts', 'readwrite');
      tx.objectStore('attempts').put({
        id: 'library-picture-lesson', sessionId: 'library', itemId: 'ja-dog', language: 'ja-JP',
        choiceIds: ['ja-dog'], selectedId: 'ja-dog', correct: true,
        startedAt: 1000, answeredAt: 2000, responseMs: 1000,
        context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: 'dog.mp3', replays: 0, schedulerVersion: 'fsrs-6-v2' },
      });
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    } finally { db.close(); }
  });
  await page.goto('./vocabulary/');
  await page.getByLabel('Search words').fill('Dog');
  const picture = page.locator('article[data-item-id="ja-dog"][data-exercise="audio-picture"]');
  const writing = page.locator('article[data-item-id="ja-dog"][data-exercise="audio-text"]');
  await expect(picture.locator('.card-mastery')).toHaveText('Mastery: Learning');
  await expect(writing.locator('.card-mastery')).toHaveText('Mastery: New');
  await expect(page.locator('#pack option[value="ja-wanikani-2-pictures"]')).toContainText('Lowest: New · Average: New');
  await picture.locator('.card-feedback summary').click();
  await writing.locator('.card-feedback summary').click();
  await picture.getByLabel('Your notes').fill('Shared vocabulary note');
  await expect(writing.getByLabel('Your notes')).toHaveValue('Shared vocabulary note');
  await expect(page.getByRole('button', { name: 'Export feedback (1)' })).toBeEnabled();
  await page.reload();
  await page.getByLabel('Search words').fill('Dog');
  await expect(picture.locator('.card-mastery')).toHaveText('Mastery: Learning');
  await expect(writing.locator('.card-mastery')).toHaveText('Mastery: New');
  await page.getByLabel('Card pack').selectOption('ja-wanikani-2-writing');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(writing.locator('.card-mastery')).toHaveText('Mastery: New');
});


test('browse the Spanish travel pack, listen, retry audio and retain Spanish notes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  await page.getByRole('link', { name: /card library/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Latin American Spanish cards');
  await expect(page.getByLabel('Card pack')).toHaveValue('es-419-travel-1-pictures');
  await expect(page.locator('.card')).toHaveCount(24);
  await expect(page.locator('.card h2')).toHaveText(spanish.items.slice(0, 24).map(item => item.text));
  await expect(page.locator('#results-status')).toContainText('36 cards');
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('.card h2')).toHaveText(spanish.items.slice(24).map(item => item.text));
  await expect(page.getByRole('heading', { level: 2, name: 'entrada', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'salida', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Card pack').locator('option')).toHaveCount(2);
  await page.getByLabel('Search words').fill('Coffee');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('café');
  await expect.poll(() => page.locator('.card-image').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('group', { name: 'Latin American Spanish voices for Coffee', exact: true }).getByRole('button')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Cesar: Coffee', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Juan: Coffee', exact: true }).click();
  await expect(page.locator('#audio-status')).toContainText('café');
  await expect(page.locator('#audio-status')).toBeEmpty();
  await expect(page.locator('#audio-error')).toBeHidden();
  const recording = '**/audio/es-419-travel-v2/juan/es-419-travel-coffee.mp3';
  await page.route(recording, route => route.abort());
  await page.getByRole('button', { name: 'Juan: Coffee', exact: true }).click();
  await expect(page.locator('#audio-error')).toBeVisible();
  await page.unroute(recording);
  await page.getByRole('button', { name: 'Juan: Coffee', exact: true }).click();
  await expect(page.locator('#audio-error')).toBeHidden();
  await page.locator('.card-feedback summary').click();
  await page.getByLabel('Your notes').fill('Check the café pronunciation.');
  await expect(page.locator('.feedback-status')).toHaveText('Saved on this device.');
  await page.reload();
  await page.getByLabel('Search words').fill('cafe');
  await page.locator('.card-feedback summary').click();
  await expect(page.getByLabel('Your notes')).toHaveValue('Check the café pronunciation.');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export feedback (1)' }).click();
  const exported = await download;
  const stream = await exported.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const feedback = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(feedback.language).toBe('es-419');
  expect(feedback.notes[0]).toMatchObject({ itemId: 'es-419-travel-coffee', feedback: 'Check the café pronunciation.' });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('select practice packs in the library and keep them after returning home and reloading', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Card library · 10 packs selected' }).click();
  await expect(page.getByRole('group', { name: 'Practice packs', exact: true }).getByRole('checkbox')).toHaveCount(10);
  for (const checkbox of await page.getByRole('group', { name: 'Practice packs', exact: true }).getByRole('checkbox').all()) await checkbox.uncheck();
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await expect(page.getByRole('button', { name: /^start/i })).toBeDisabled();
  await page.getByRole('link', { name: 'Card library · 0 packs selected' }).click();
  await page.getByRole('checkbox', { name: 'WaniKani level 2 · Writing' }).check();
  await page.getByLabel('Card pack').selectOption('ja-wanikani-1-pictures');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'WaniKani level 2 · Writing' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'WaniKani level 1 · Pictures' })).not.toBeChecked();
  await page.goBack();
  await expect(page.getByRole('link', { name: 'Card library · 1 pack selected' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^start/i })).toBeEnabled();
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson' }).click();
  await expect(page.locator('.preview')).toHaveAttribute('data-exercise', 'audio-text');
});
