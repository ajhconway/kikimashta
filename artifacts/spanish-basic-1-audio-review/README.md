# Basic Spanish level 1 audio review (#191)

The complete matrix contains 336 recordings in the existing eight regional voices: 24 canonical word forms plus nine contextual sentence/question pairs (42 spoken parts × eight voices). Verb words retain their approved infinitives; the contextual recordings use the exact approved conjugated sentences and questions. No alternate word forms or extra phrases were added.

Open `index.html` through a local HTTP server to search Spanish/English, filter a region or voice and play individual clips or the visible sequence. Word, context sentence and context question are labeled separately. These media are awaiting owner listening acceptance and are not activated in practice.

`manifest.json` binds each recording to its word or contextual role, target item, context ID/revision, exact request, provider voice, original hash and delivery hash. Its top-level `contexts` entries pair sentence/question recording IDs for the combined review. Every clip uses `file`, `deliverySha256` and `deliveryBytes`; word IDs are unchanged, while contextual audio IDs append `-sentence` or `-question` to the context ID.

The generation adapter verifies the exact approved draft bytes and `generation-approval.json` before any paid request. `content/spanish-basic-1/audio-approval.json` additionally binds all 42 spoken parts and the complete eight-voice registry snapshot. All 4,760 Unicode input characters use the approved ElevenLabs model/settings with enforced Spanish. Generation resumes only verified recordings and refuses unresolved earlier requests.

Provider originals, per-request records, reviewed draft/authorization snapshots and normalized source records are retained under ignored `artifacts/generated-originals/spanish-basic-1-191-v1/` and `spanish-basic-1-191-v1-normalized/`. Both complete trees are archived privately under `~/.local/share/kikimashta/spanish-audio/191-v1/`; all 2,027 files were hash-verified. Account usage records remain private.

Deliveries use the established constant-gain profile: −22 LUFS target, −2 dBTP ceiling and at most 9 dB boost, encoded directly from each provider original. Full decoding verified unchanged frame counts. No trimming, timing changes or dynamics compression were applied. Two word recordings remain explicitly flagged: Carlos Figueroa · ir (−23.94 LUFS, maximum gain) and Juan · hambre (−22.45 LUFS, true-peak headroom). All 144 contextual recordings meet target tolerance.

```sh
node scripts/content/generate-spanish-basic-level-1.mjs --dry-run
node scripts/content/generate-spanish-basic-level-1.mjs --output artifacts/generated-originals/spanish-basic-1-191-v1
python3 scripts/content/normalize-elevenlabs.py --input artifacts/generated-originals/spanish-basic-1-191-v1 --output artifacts/generated-originals/spanish-basic-1-191-v1-normalized --workers 4
node scripts/content/build-spanish-basic-level-1-audio-review.mjs --input artifacts/generated-originals/spanish-basic-1-191-v1 --delivery artifacts/generated-originals/spanish-basic-1-191-v1-normalized --output artifacts/spanish-basic-1-audio-review
```

The review builder validates the entire source/delivery matrix before creating a new output directory. Automated decoding and playback checks do not replace pronunciation acceptance or real-iPhone testing.
