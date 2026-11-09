import { expect, test } from './fixtures';
import library from '../public/vocabulary/library-data.json' with { type: 'json' };

// Exercise quiet mode in CI too; other specs keep native unmuted playback there.
test.use({ quietAudio: true });

test('quiet audio really plays, ends, and replays after navigation', async ({ page }) => {
  for (let visit = 0; visit < 2; visit++) {
    await page.goto('./');
    await page.evaluate(src => {
      // Detached Audio instances use the same protection as rendered <audio> tags.
      const source = new URL(src, document.baseURI).href;
      const audio = new Audio(source);
      const button = document.createElement('button');
      button.textContent = 'Play fixture recording';
      button.onclick = () => {
        // Match app replay; implicit restart of an ended detached player can
        // leave WebKit stalled at zero without a media error (#187).
        audio.pause(); audio.src = source; audio.currentTime = 0;
        void audio.play();
      };
      audio.addEventListener('ended', () => { button.textContent = 'Replay fixture recording'; });
      audio.id = 'fixture-audio';
      document.body.append(button);
      // Retain a reference without attaching the audio element to the document.
      Object.assign(window, { fixtureAudio: audio });
    }, library.cards[0]!.audio.find(clip => clip.available)!.src.replace(/^\.\.\//, ''));
    await page.getByRole('button', { name: 'Play fixture recording', exact: true }).click();
    const state = () => page.evaluate(() => {
      const audio = (window as unknown as { fixtureAudio: HTMLAudioElement }).fixtureAudio;
      return { muted: audio.muted, time: audio.currentTime, ended: audio.ended, error: audio.error?.code ?? null };
    });
    await expect.poll(async () => (await state()).time).toBeGreaterThan(0);
    await expect.poll(state).toMatchObject({ muted: true, ended: true, error: null });
    await page.getByRole('button', { name: 'Replay fixture recording', exact: true }).click();
    await expect.poll(state).toMatchObject({ muted: true, ended: false, error: null });
    await expect.poll(async () => (await state()).time).toBeGreaterThan(0);
    await expect.poll(state).toMatchObject({ muted: true, ended: true, error: null });
  }
});

test('quiet playback still rejects an unavailable recording', async ({ page }) => {
  await page.route('**/missing-fixture.mp3', route => route.abort());
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const audio = new Audio('missing-fixture.mp3');
    try { await audio.play(); return { rejected: false, muted: audio.muted, error: audio.error?.code }; }
    catch { return { rejected: true, muted: audio.muted, error: audio.error?.code }; }
  });
  expect(result).toMatchObject({ rejected: true, muted: true });
  expect(result.error).toBeGreaterThan(0);
});
