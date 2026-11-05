import { expect, test } from '@playwright/test';
import bank from '../content/ja.json' with { type: 'json' };

test('both voices are playable for every starter word', async ({ page }) => {
  await page.goto('./');
  const player = page.locator('audio');
  for (const word of bank.items) {
    expect(word.audio.map(recording => recording.voice)).toEqual(['marin', 'cedar']);
    for (const recording of word.audio) {
      await player.evaluate((element, src) => {
        const audio = element as HTMLAudioElement;
        audio.src = new URL(src, document.baseURI).href;
        audio.load();
      }, recording.src);
      await expect.poll(() => player.evaluate(element => (element as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(2);
      expect(await player.evaluate(element => (element as HTMLAudioElement).error)).toBeNull();
      const duration = await player.evaluate(element => (element as HTMLAudioElement).duration);
      expect(duration).toBeGreaterThan(0.3);
      expect(duration).toBeLessThan(3);
    }
  }
});
