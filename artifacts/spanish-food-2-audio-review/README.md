# Spanish Food level 2: new-word listening review (#231)

All 248 authorized new recordings are complete: 31 canonical Spanish words in the existing eight regional voices, 1,616 Unicode input characters. The approved provider/model and voice settings are bound in `content/spanish-food-2/audio-approval.json`. This folder contains processed delivery MP3s, the exact verified manifest, fixed-profile normalization summary/evidence and native browser playback results.

Provider originals, exact requests, sidecars and account-usage/processing evidence remain in ignored `artifacts/generated-originals/231-v1*` and the durable private archive `~/.local/share/kikimashta/spanish-audio/231-v1/` (1,496 hash-verified source/evidence files plus its archive manifest). No credentials or account-usage data enter this review.

Processing applies constant gain toward −22 LUFS with dual-mono compensation, a −2 dBTP ceiling and at most +9 dB boost. Every delivered MP3 is encoded directly from its original at 44.1 kHz / 128k, without dynamics compression, trimming or retiming. None of the 248 deliveries needs a quieter/short-clip exception. Both Chromium and mobile WebKit decode/play all 248 files with advancing native clocks.

The complete pack combines these with forty unchanged accepted tableware recordings: open `content/spanish-food-2/media-review.html` for all 36 accepted pictures and 288 clips. Listening acceptance remains pending; these new clips are not active practice deliveries. Rebuild this audio-only review with `node scripts/content/build-spanish-food-level-2-audio-review.mjs --input artifacts/generated-originals/231-v1 --delivery artifacts/generated-originals/231-v1-normalized --output <new-review-directory>`.
