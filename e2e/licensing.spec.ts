import { expect, test } from './fixtures';

test('the app provides its license, corresponding source, and separate notices', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: /code & credits/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Code & credits');
  const repository = 'https://github.com/ajhconway/kikimashta';
  const sourceUrl = process.env.SOURCE_REVISION ? `${repository}/tree/${process.env.SOURCE_REVISION}` : repository;
  await expect(page.getByRole('link', { name: 'Source code', exact: true })).toHaveAttribute('href', sourceUrl);
  for (const [name, required] of [
    ['GNU Affero General Public License, version 3 only', 'GNU AFFERO GENERAL PUBLIC LICENSE'],
    ['Scope and license history', '02dcb58400f4971c6e54e2f7740b4d1c3328d25f'],
    ['Dependency notices', 'ISC License'],
    ['MIT license', 'MIT License'],
  ]) {
    const href = await page.getByRole('link', { name, exact: true }).getAttribute('href');
    const response = await page.request.get(new URL(href!, page.url()).href);
    expect(response.ok(), name).toBe(true);
    expect(await response.text()).toContain(required);
  }
});
