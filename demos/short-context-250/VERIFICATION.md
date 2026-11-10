# Demo verification — 2026-11-10

Scope: the standalone demo for issue #250, including the requested production styling match. The production app and its learning bank are not modified.

- `npm run check`: passed the four JavaScript syntax checks.
- `npm test`: 4 tests passed; first-answer immutability, score/skips, all ten targets/four distinct pictures/audio files, and exact pictured quantities.
- `npm run test:browser`: 9 browser cases passed, 1 intentionally skipped (physical number-key input on the mobile project). Chromium desktop and WebKit iPhone-size projects both passed complete sessions, transcript/translation controls, navigation, first-answer feedback, restart, real MP3 decode/playback at reduced speed, interrupted audio, failed audio/retry, all forty pictures, and horizontal-overflow checks. The desktop keyboard case passed.
- Visually inspected desktop and phone-size screenshots after applying the app styling.
- The reused cat and icon exactly match the current repository Git blobs (`f2052e6daad9c377baa3462f0a858a7ae73549d6` and `678172584bef985483d8f41676ec14312e62133c`). The source stylesheet inspected matches `be7b8f991ac7ce18ec03a505f7517331e57abe3c`.
- Ten generated MP3 clips have valid probed durations from 1.84 to 4.14 seconds. Browser tests exercised actual audio playback; native pronunciation listening acceptance remains for the owner.

This is a buildless HTML/JavaScript demo. No lint, TypeScript, or separate production build command is configured. The served `dist/` files are the deployment output. The real iPhone has not been tested by the agent.
