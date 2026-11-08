import { expect, test, type Page } from './fixtures';
import catalogue from '../content/catalog/ja.json' with { type: 'json' };

async function storedHistory(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction('attempts').objectStore('attempts').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
}

test('Dev review opens options, simulates selected writing mastery and leaves real browser history untouched', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Dev review', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Mastery demo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Contextual dev review', exact: true })).toHaveCount(0);
  const before = await storedHistory(page);
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dev review options' })).toBeFocused();
  await expect(page.locator('.quiz')).toHaveCount(0);
  await expect(page.locator('audio')).not.toHaveAttribute('src');
  await page.getByRole('checkbox', { name: 'Words · Pictures', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Clear levels' }).click();
  await expect(page.getByRole('button', { name: 'Start dev review' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Confident', exact: true }).check();
  for (const name of ['Questions', 'Timer behavior']) {
    expect((await page.getByRole('combobox', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByLabel('Questions', { exact: true }).selectOption('6');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Start dev review' }).click();
  await expect(page.locator('.quiz')).toHaveAttribute('data-exercise', 'audio-text');
  const current = page.getByRole('status', { name: 'Demo mastery' });
  await expect(current).toContainText('Confident');
  await expect(current).toContainText('1.5s');
  const source = await page.locator('.app > audio').getAttribute('src');
  const target = catalogue.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  const replay = page.getByRole('button', { name: 'Replay word' });
  await replay.click();
  await expect(page.locator('.app > audio')).toHaveAttribute('src', source!);
  await page.getByRole('button', { name: `Choose writing ${target.text}`, exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-answer');
  expect(await storedHistory(page)).toEqual(before);
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dev review', exact: true })).toBeEnabled();
  expect(await storedHistory(page)).toEqual(before);
});

test('contextual samples use selected mastery, remain untimed and keep real progress unchanged', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Words · Pictures', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Words · Writing', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Simple contexts · Pictures', exact: true }).check();
  await page.getByRole('button', { name: 'Clear levels' }).click();
  await page.getByRole('checkbox', { name: 'Strong', exact: true }).check();
  await page.getByRole('button', { name: 'Start dev review' }).click();
  await expect(page.locator('.contextual-practice')).toHaveAttribute('data-exercise', 'context-simple-picture');
  await expect(page.getByRole('status', { name: 'Demo mastery' })).toContainText('Strong');
  await expect(page.getByRole('status', { name: 'Demo mastery' })).toContainText('Untimed');
  await expect(page.locator('.quiz-timer-fill')).toHaveCount(0);
  await page.locator('.contextual-choices button').first().click();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  expect(await storedHistory(page)).toEqual([]);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.contextual-practice')).toHaveAttribute('data-exercise', 'context-simple-picture');
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  expect(await storedHistory(page)).toEqual([]);
});

test('options respect language and handle empty selected packs', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('combobox', { name: 'Learning language' }).selectOption('es-419');
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  const types = page.getByRole('group', { name: 'Review types', exact: true });
  await expect(types.getByRole('checkbox')).toHaveCount(1);
  await expect(types.getByRole('checkbox')).toHaveAccessibleName('Words · Pictures');
  await page.getByRole('button', { name: 'Start dev review' }).click();
  await expect(page.locator('.quiz')).toHaveAttribute('data-exercise', 'audio-picture');
  await expect(page.locator('.app > audio')).toHaveAttribute('src', /es-419/);
  await page.getByRole('button', { name: 'Kikimashta home', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('kikimashta-card-packs-v1:es-419', '[]'));
  await page.reload();
  await page.getByRole('button', { name: 'Dev review', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Review types', exact: true }).getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start dev review' })).toBeDisabled();
  const libraryLink = page.getByRole('link', { name: 'Card library', exact: true });
  await expect(libraryLink).toHaveAttribute('href', /language=es-419/);
  const library = await page.context().newPage();
  await library.goto(new URL((await libraryLink.getAttribute('href'))!, page.url()).href);
  await library.getByRole('checkbox', { name: 'Travel level 1 · Pictures' }).check();
  await library.close();
  await page.bringToFront();
  await expect(types.getByRole('checkbox')).toHaveAccessibleName('Words · Pictures');
  await expect(page.getByRole('button', { name: 'Start dev review' })).toBeEnabled();
});
