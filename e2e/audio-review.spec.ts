import { expect, test } from '@playwright/test';

test('all nine voice samples load as playable audio', async ({ page }) => {
  await page.goto('./audio-review/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose a listening voice');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['marin', 'cedar', 'coral']);
  const players = page.locator('audio');
  await expect(players).toHaveCount(9);
  for (const player of await players.all()) {
    await expect(player).toHaveAttribute('aria-label', /^(marin|cedar|coral): .+/);
    await player.evaluate(element => {
      const audio = element as HTMLAudioElement;
      audio.preload = 'auto';
      audio.load();
    });
    await expect.poll(() => player.evaluate(element => (element as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(2);
    const duration = await player.evaluate(element => (element as HTMLAudioElement).duration);
    expect(duration).toBeGreaterThan(0.5);
    expect(duration).toBeLessThan(3);
    expect(await player.evaluate(element => (element as HTMLAudioElement).error)).toBeNull();
  }
});
