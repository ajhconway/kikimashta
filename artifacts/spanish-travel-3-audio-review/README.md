# Spanish Travel level 3 audio review (#174)

All 36 approved words are recorded in the existing eight selected voices: Juan/Pamela (Mexico City), Albeiro/Carito (Bogotá), Santiago/Agustina (Buenos Aires), and Carlos Figueroa/Veronica (Puerto Rico). Open `index.html` through a local HTTP server to search words, filter regions/voices and play all 288 recordings.

These media await owner listening acceptance and are not registered for practice. The exact owner authorization, words and voice hashes are recorded in `content/spanish-travel-3/audio-approval.json`. `manifest.json` preserves exact Spanish requests, provider voice IDs, source/delivery hashes and playback measurements.

Provider originals and request sidecars remain in ignored `artifacts/generated-originals/spanish-travel-3-174-v1/`; normalized source records are in `spanish-travel-3-174-v1-normalized/`. Both complete trees are preserved under the private durable archive `~/.local/share/kikimashta/spanish-audio/174-v1/`; all 1,737 archived files were hash-verified. Account usage records stay private.

Each review MP3 is encoded directly from its provider original using constant gain, aiming at −22 LUFS with a −2 dBTP ceiling and at most 9 dB boost. Full decoding verified unchanged frame counts. No trimming, timing changes or dynamics compression were applied. Two recordings remain explicitly flagged for listening review: Santiago · taco (−22.57 LUFS, constrained by true-peak headroom) and Carlos Figueroa · isla (−23.41 LUFS, constrained by the maximum gain). All others meet target tolerance. `normalization-summary.json` records the processing profile.

Reproduce the bounded generation and review with:

```sh
node scripts/content/generate-spanish-travel-level-3.mjs --dry-run
node scripts/content/generate-spanish-travel-level-3.mjs --output artifacts/generated-originals/spanish-travel-3-174-v1
python3 scripts/content/normalize-elevenlabs.py --input artifacts/generated-originals/spanish-travel-3-174-v1 --output artifacts/generated-originals/spanish-travel-3-174-v1-normalized --workers 4
node scripts/content/build-spanish-travel-level-3-audio-review.mjs --input artifacts/generated-originals/spanish-travel-3-174-v1 --delivery artifacts/generated-originals/spanish-travel-3-174-v1-normalized --output artifacts/spanish-travel-3-audio-review
```

Generation resumes verified recordings and refuses unresolved earlier requests. The review builder requires a new output directory and validates the complete source/delivery matrix before creating files. Objective media checks do not replace listening acceptance of pronunciation and natural endings.
