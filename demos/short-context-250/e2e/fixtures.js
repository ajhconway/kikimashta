import { test as base } from '@playwright/test';
import { silenceMedia } from '@e2e/quiet-audio';

// This demo has its own pinned Playwright installation. Share the pure media
// helper without loading a second runner from the app's node_modules.
export const test=base.extend({
  silenceAudio:[async({context},use)=>{await silenceMedia(context);await use();},{auto:true}],
});
export { expect } from '@playwright/test';
