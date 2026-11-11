import type { BrowserContext } from '@playwright/test';

/** Silence output while retaining native playback, promises, decoding and events. */
export async function silenceMedia(context: BrowserContext) {
  await context.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      this.muted = true;
      return play.call(this);
    };
  });
}
