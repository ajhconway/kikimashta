import { readFileSync } from 'node:fs';
import { test, expect } from '../fixtures';

const html = readFileSync('artifacts/pronunciation-neighbors-212/review.html', 'utf8');
const reviewPath = '/artifacts/pronunciation-neighbors-212/review.html';

test('blind comparison plays real recordings, saves isolated judgments and exports responses', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // The archival page stays outside the production bundle; serve its exact bytes at the review URL.
  await page.route(`**${reviewPath}`, route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(reviewPath);
  await expect(page.getByRole('status')).toContainText('0 of 12');
  const trial = page.locator('.trial:visible');
  await expect(trial.locator('audio')).toHaveCount(7);
  await expect(trial.locator('.word:visible')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reveal words for this trial' }).first()).toBeDisabled();
  expect(await page.locator('body').innerText()).not.toMatch(/kanasim|baseline|weighted/iu);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const target = trial.locator('audio').first();
  await target.evaluate(async element => { const audio = element as HTMLAudioElement; await audio.play(); });
  await expect.poll(() => target.evaluate(element => (element as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  await trial.locator('audio').nth(1).evaluate(async element => { await (element as HTMLAudioElement).play(); });
  await expect.poll(() => target.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true);
  await page.getByLabel('Group A', { exact: true }).first().check();
  await page.getByLabel('Notes', { exact: true }).first().fill('Browser fixture judgment');
  await page.getByRole('button', { name: 'Reveal words for this trial' }).first().click();
  await expect(trial.locator('.word:visible')).toHaveCount(7);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('1 of 12');
  await expect(page.getByLabel('Group A', { exact: true }).first()).toBeChecked();
  await expect(page.getByLabel('Notes', { exact: true }).first()).toHaveValue('Browser fixture judgment');
  await page.getByRole('button', { name: 'Next trial', exact: true }).click();
  await expect(page.locator('.trial:visible h2')).toHaveText('Trial 2 of 12');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export responses' }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).not.toBeNull();
  const exported = JSON.parse(readFileSync(path!, 'utf8'));
  expect(exported.responses).toHaveLength(12);
  expect(exported.responses[0]).toMatchObject({ preference: 'A', revealed: true, notes: 'Browser fixture judgment' });
  expect(exported.responses[1].preference).toBeNull();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatch(/^pronunciation-neighbors-212:responses:/u);
  expect(errors).toEqual([]);
});
