import { expect, test } from '@playwright/test';
import catalogue from '../content/catalog/ja.json' with { type: 'json' };

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
    await expect(page.getByText('1 answer saved on this device')).toBeVisible();
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
