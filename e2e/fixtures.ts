import { test as base, type BrowserContext } from '@playwright/test';

const audioMode = process.env.E2E_AUDIO;
if (audioMode && audioMode !== 'quiet' && audioMode !== 'audible') {
  throw new Error('E2E_AUDIO must be quiet or audible.');
}

export const test = base.extend<{ quietAudio: boolean; silenceAudio: void }>({
  // CI retains unmuted autoplay coverage; local runs silence only their test pages.
  quietAudio: [audioMode === 'quiet' || (!audioMode && !process.env.CI), { option: true }],
  silenceAudio: [async ({ context, quietAudio }, use) => {
    if (quietAudio) await silenceMedia(context);
    await use();
  }, { auto: true }],
});

// Also use this for extra contexts created explicitly by multi-device journeys.
export async function silenceMedia(context: BrowserContext) {
  await context.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      this.muted = true;
      // Keep the native promise, network, decoder, events, and playback clock.
      return play.call(this);
    };
  });
}

export { expect, type Page, type BrowserContext } from '@playwright/test';
