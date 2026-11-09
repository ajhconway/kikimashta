import { savedAttempts } from './saved-attempts';
import { expect, test } from './fixtures';
import catalogue from '../content/catalog/ja.json' with { type: 'json' };
import pool from '../content/practice-pool.json' with { type: 'json' };
import starter from '../content/ja.json' with { type: 'json' };

const eligible = catalogue.items.filter(item => item.sourceLevel === 2 &&
  [...pool.itemIds, ...starter.items.map(item => item.id)].includes(item.id));

for (const format of ['pictures', 'writing']) {
  test(`selected voice and ${format} pack persist and scope saved practice answers`, async ({ page }) => {
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
    // Browsing another pack must not change the selected practice pack.
    await page.getByLabel('Card pack').selectOption('ja-wanikani-1-pictures');
    await page.reload();
    await expect(voices.getByRole('checkbox', { checked: true })).toHaveAccessibleName('Lime');
    const packName = `WaniKani level 2 · ${format === 'writing' ? 'Writing' : 'Pictures'}`;
    await expect(packs.getByRole('checkbox', { checked: true })).toHaveAccessibleName(packName);
    await page.getByLabel('Card pack').selectOption(`ja-wanikani-2-${format}`);
    await page.getByLabel('Search words').fill('Dog');
    // Auditioning other voices stays available independently of the practice setting.
    await expect(page.getByRole('group', { name: 'Japanese voices for Dog', exact: true }).first().getByRole('button')).toHaveCount(8);
    await page.getByRole('link', { name: '← Listening practice' }).click();
    await page.getByRole('button', { name: /^start/i }).click();
    await page.getByRole('button', { name: 'Begin lesson', exact: true }).click();
    const exercise = format === 'writing' ? 'audio-text' : 'audio-picture';
    for (let turn = 0; turn < 10; turn++) {
      await expect(page.locator('audio')).toHaveAttribute('src', /\/lime\//);
      await expect(page.locator('.preview')).toHaveAttribute('data-exercise', exercise);
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
    expect(eligible.some(item => item.id === target.id)).toBe(true);
    const recordingSrc = target.audio.find(clip => source?.endsWith(clip.src))!.src;
    await expect(page.locator('.quiz')).toHaveAttribute('data-exercise', exercise);
    await expect(page.locator('.choices img')).toHaveCount(format === 'writing' ? 0 : 4);
    if (format === 'writing') {
      const choices = await page.locator('.choices .written-answer').allTextContents();
      expect(choices).toHaveLength(4);
      expect(choices.every(text => eligible.some(item => item.text === text))).toBe(true);
    }
    if (format === 'writing') await page.getByRole('button', { name: `Choose writing ${target.text}`, exact: true }).click();
    else await page.locator('.choices button').filter({ has: page.getByRole('img', { name: target.image.alt, exact: true }) }).click();
    await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
    await expect.poll(async () => (await savedAttempts(page)).length).toBe(1);
    await page.reload();
    const saved = await savedAttempts(page);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ itemId: target.id, context: { exercise, recordingSrc } });
    await expect(page.getByRole('link', { name: 'Card library · 1 pack selected' })).toBeVisible();
    if (format === 'writing') {
      await page.getByRole('link', { name: 'Card library · 1 pack selected' }).click();
      await page.getByRole('checkbox', { name: packName, exact: true }).uncheck();
      await page.getByRole('link', { name: '← Listening practice' }).click();
      await expect(page.getByRole('button', { name: /^start/i })).toBeDisabled();
      await page.reload();
      await expect(page.getByRole('link', { name: 'Card library · 0 packs selected' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^start/i })).toBeDisabled();
      expect(await savedAttempts(page)).toEqual(saved);
    }
  });
}
