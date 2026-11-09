# Spanish Travel level 4 · audio review (#207)

[Listen to all recordings](index.html). 36 approved words in eight retained regional voices: Juan/Pamela (Mexico City), Albeiro/Carito (Bogotá), Santiago/Agustina (Buenos Aires), and Carlos Figueroa/Veronica (Puerto Rico). The exact draft and owner's “Please go ahead” authorization remain bound by hashes in `content/spanish-travel-4/audio-approval.json` and `generation-approval.json`. No practice activation is included.

All 288 provider originals and exact request/processing records are preserved in the ignored generation batch and the durable private archive `~/.local/share/kikimashta/spanish-audio/207-v1/`. The archive contains 1736 hash-verified source/evidence files plus its manifest. Public review deliveries have verified source/delivery hashes in [manifest.json](manifest.json); account-usage records and credentials are not included.

The established processing profile applies constant gain only: −22 LUFS target, −2 dBTP ceiling, maximum 9 dB boost, dual-mono measurement and 128k MP3 delivery. No speech trimming, timing change, pitch change or dynamics compression. Every delivery was fully decoded and frame-checked. One clip stays slightly quieter at the boost limit: **Carlos Figueroa · azúcar**, −22.65 LUFS, −5.79 dBTP, +9 dB gain. It is flagged in the listening page and manifest.

Rebuild locally without paid calls:

```sh
node scripts/content/build-spanish-travel-level-4-audio-review.mjs --input artifacts/generated-originals/207-v1 --delivery artifacts/generated-originals/207-v1-normalized --output artifacts/spanish-travel-4-audio-review-new
```

The builder refuses to overwrite an existing review and validates the full matrix before creating output. Generation is resumable only into the original ignored batch, with verified paid successes retained; never repeat it into a fresh directory. Actual pronunciation and listening acceptance remain an owner review, and real iPhone acceptance remains manual.

All 288 recordings passed native decode, play and advancing-clock checks in Chromium and mobile WebKit. See [verification.json](verification.json) and [per-clip results](native-playback.json). Six focused generation/review tests and ESLint pass.
