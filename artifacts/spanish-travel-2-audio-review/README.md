# Spanish Travel level 2 audio review (#166)

All 36 approved words are recorded in the existing eight selected voices: Juan/Pamela (Mexico City), Albeiro/Carito (Bogotá), Santiago/Agustina (Buenos Aires), and Carlos Figueroa/Veronica (Puerto Rico). Open `index.html` through a local HTTP server to filter words, regions or voices and play any of the 288 recordings.

These media are awaiting owner listening acceptance; they are not registered for practice. `manifest.json` binds the exact Spanish requests, provider voice IDs, source hashes, delivery hashes and playback measurements. The approved word/voice snapshot is in `content/spanish-travel-2/audio-approval.json`.

Provider originals and per-request sidecars remain in ignored `artifacts/generated-originals/spanish-travel-2-166-v1/`. The corresponding normalized source tree is `spanish-travel-2-166-v1-normalized/`. Both complete trees are preserved under the private durable archive `~/.local/share/kikimashta/spanish-audio/166-v1/`; all 1,737 archived files were hash-verified. Account usage records stay private.

Each review MP3 is encoded directly from its provider original using constant gain, aiming at −22 LUFS with a −2 dBTP ceiling and at most 9 dB boost. Full decoding verified unchanged frame counts. No trimming, timing changes or dynamics compression were applied. All 288 deliveries meet the target tolerance; none needs a quieter-clip exception. `normalization-summary.json` records the processing profile.

Reproduce the bounded generation and review with:

```sh
node scripts/content/generate-spanish-travel-level-2.mjs --dry-run
node scripts/content/generate-spanish-travel-level-2.mjs --output artifacts/generated-originals/spanish-travel-2-166-v1
python3 scripts/content/normalize-elevenlabs.py --input artifacts/generated-originals/spanish-travel-2-166-v1 --output artifacts/generated-originals/spanish-travel-2-166-v1-normalized --workers 4
node scripts/content/build-spanish-travel-level-2-audio-review.mjs --input artifacts/generated-originals/spanish-travel-2-166-v1 --delivery artifacts/generated-originals/spanish-travel-2-166-v1-normalized --output artifacts/spanish-travel-2-audio-review
```

Generation resumes only verified recordings and refuses unresolved earlier requests. The review builder requires a new output directory and validates the full source/delivery matrix before writing files. Listen for natural pronunciation and endings before activation; objective media validation does not replace listening acceptance.
