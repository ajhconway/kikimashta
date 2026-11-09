import { savedAttempts } from './saved-attempts';
import { expect, test } from './fixtures';
import catalogue from '../content/catalog/ja.json' with { type: 'json' };
import spanish from '../content/es-419.json' with { type: 'json' };
import spanishLevel2 from '../content/es-419-travel-2.json' with { type: 'json' };
import spanishLevel3 from '../content/es-419-travel-3.json' with { type: 'json' };

for (const format of ['pictures', 'writing']) {
  test(`global voice selection persists and supplies ${format} practice and saved answers`, async ({ page }) => {
    await page.goto('./vocabulary/');
    const voices = page.getByRole('group', { name: 'Practice voices', exact: true });
    await expect(voices.getByRole('checkbox')).toHaveCount(8);
    for (const checkbox of await voices.getByRole('checkbox').all()) {
      if (await checkbox.getAttribute('value') !== 'lime') await checkbox.uncheck();
    }
    await voices.getByRole('checkbox', { name: 'Lime', exact: true }).click();
    await expect(voices.getByRole('checkbox', { name: 'Lime', exact: true })).toBeChecked();
    await expect(page.getByText('Keep at least one voice selected for practice.')).toBeVisible();
    const packs = page.getByRole('group', { name: 'Practice packs', exact: true });
    for (const checkbox of await packs.getByRole('checkbox').all()) {
      if (await checkbox.getAttribute('value') !== `ja-wanikani-2-${format}`) await checkbox.uncheck();
    }
    await page.reload();
    await expect(voices.getByRole('checkbox', { checked: true })).toHaveAccessibleName('Lime');
    await page.getByLabel('Search words').fill('Dog');
    // Auditioning other voices stays available independently of the practice setting.
    await expect(page.getByRole('group', { name: 'Japanese voices for Dog', exact: true }).first().getByRole('button')).toHaveCount(8);
    await page.getByRole('link', { name: '← Listening practice' }).click();
    await page.getByRole('button', { name: /^start/i }).click();
    await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
    for (let turn = 0; turn < 10; turn++) {
      await expect(page.locator('audio')).toHaveAttribute('src', /\/lime\//);
      const next = page.getByRole('button', { name: /next card/i });
      if (!await next.count()) break;
      await next.click();
    }
    await page.getByRole('button', { name: /mini-quiz/i }).click();
    const source = await page.locator('audio').getAttribute('src');
    expect(source).toContain('/lime/');
    await page.getByRole('button', { name: 'Replay word' }).click();
    await expect(page.locator('audio')).toHaveAttribute('src', source!);
    const target = catalogue.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
    if (format === 'writing') await page.getByRole('button', { name: `Choose writing ${target.text}`, exact: true }).click();
    else await page.locator('.choices button').filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
    await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
    await expect.poll(async () => (await savedAttempts(page)).length).toBe(1);
    await page.reload();
    const saved = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('kikimashta-v0', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<{ context: { recordingSrc: string } }[]>((resolve, reject) => {
          const request = db.transaction('attempts').objectStore('attempts').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally { db.close(); }
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.context.recordingSrc).toContain('/lime/');
  });
}

test('Spanish regional voice preference persists independently and supplies practice audio', async ({ page }) => {
  await page.goto('./vocabulary/?language=es-419');
  const voices = page.getByRole('group', { name: 'Practice voices', exact: true });
  await expect(voices.getByRole('checkbox')).toHaveCount(8);
  await expect(voices.getByRole('checkbox', { name: 'Juan', exact: true })).toHaveAccessibleDescription('Mexico City, Mexico');
  await expect(voices.getByRole('checkbox', { name: 'Carito', exact: true })).toHaveAccessibleDescription('Bogotá, Colombia');
  await expect(voices.getByRole('checkbox', { name: 'Santiago', exact: true })).toHaveAccessibleDescription('Buenos Aires, Argentina');
  await expect(voices.getByRole('checkbox', { name: 'Veronica', exact: true })).toHaveAccessibleDescription('Puerto Rico · Caribbean Spanish');
  for (const checkbox of await voices.getByRole('checkbox').all()) {
    if (await checkbox.getAttribute('value') !== 'juan') await checkbox.uncheck();
  }
  await page.evaluate(() => {
    localStorage.setItem('kikimashta-practice-voices-v1', JSON.stringify(['lime']));
    localStorage.setItem('kikimashta-learning-language-v1', 'es-419');
  });
  await page.reload();
  await expect(voices.getByRole('checkbox', { checked: true })).toHaveAccessibleName('Juan');
  const hotel = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'hotel', exact: true }) });
  const auditions = hotel.getByRole('group', { name: 'Latin American Spanish voices for Hotel', exact: true });
  await expect(auditions.getByRole('button')).toHaveCount(8);
  await expect(auditions.getByRole('button', { name: 'Juan: Hotel', exact: true })).toHaveAccessibleDescription('Mexico City, Mexico');
  await page.getByRole('link', { name: '← Listening practice' }).click();
  await page.getByRole('button', { name: /^start/i }).click();
  await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
  for (let turn = 0; turn < 10; turn++) {
    await expect(page.locator('audio')).toHaveAttribute('src', /\/juan\//);
    const next = page.getByRole('button', { name: /next card/i });
    if (!await next.count()) break;
    await next.click();
  }
  await page.getByRole('button', { name: /mini-quiz/i }).click();
  const source = await page.locator('audio').getAttribute('src');
  expect(source).toContain('/juan/');
  await page.getByRole('button', { name: 'Replay word' }).click();
  await expect(page.locator('audio')).toHaveAttribute('src', source!);
  const target = [...spanish.items, ...spanishLevel2.items, ...spanishLevel3.items].find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  expect(target).toBeDefined();
  await page.locator('.choices button').filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(1);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kikimashta-practice-voices-v1')!))).toEqual(['lime']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kikimashta-practice-voices-v1:es-419')!))).toEqual(['juan']);
});
