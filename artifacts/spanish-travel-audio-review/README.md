# Spanish travel level 1 audio review

Open `index.html` through a local static server. The review contains all 36 approved words in all eight selected voices: 288 recordings. Use word/meaning, region or voice filters to compare the same word across voices or hear a full pack in one voice. The Play visible clips control follows the currently visible selection; Stop or a filter change cancels playback.

Four quieter clips are explicitly marked. Final pronunciation/listening acceptance remains pending. Technical playback checks supplement human review. No active practice content is changed.

`manifest.json` records each exact request, selected voice and regional evidence, provider request identity, original hash, normalized-delivery hash, duration and playback measurements. Private originals and full processing records are hash-verified in `~/.local/share/kikimashta/spanish-audio/155-v1` and the ignored source batch. `normalization-summary.json` records the common profile. Browser verification is recorded separately; mobile WebKit emulation is not a real-iPhone test.

## Verification

- `npm ci` completed with the pinned dependency lockfile.
- `npm run check` passed: lint, TypeScript, 322 Vitest tests, 214 Node script tests, 12 Python audio tests, 22 artwork tests, metadata validation and production build.
- Complete 36×8 selection and every copied delivery hash verified; no Cesar recordings are included.
- All 288 files fully decoded and started native playback in Chromium and mobile WebKit emulation using one reused verification player. Gallery word/region/voice filters, playback start/stop, and layout passed. Detailed results are in `browser-verification.json`.
- Independent read-only review found and verified fixes for original-output symlink containment, full normalization-journal identity/profile validation, and mobile dropdown overflow. No remaining findings.
- Private archive: 1,737 files copied and individually hash-verified, preserving provider originals and all processing evidence.

Pronunciation was not independently assessed by automated checks. App runtime and active-pack behavior are unchanged; the browser checks above target this generated review.
