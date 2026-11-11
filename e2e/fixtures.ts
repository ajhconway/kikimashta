import { test as base } from '@playwright/test';
import { silenceMedia } from './quiet-audio';

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
export { silenceMedia } from './quiet-audio';

export { expect, type Page, type BrowserContext } from '@playwright/test';
