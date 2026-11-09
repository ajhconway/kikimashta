# Travel level 4 · enchufe replacement audio (#207)

[Listen to the eight new recordings](index.html). The owner selected **enchufe — power outlet** to replace venda. Exact amendment/base-draft/configuration and item/voice identities are bound by `content/spanish-travel-4/replacement-audio-approval.json`; the previous draft, approval/configuration and all 288 original recordings remain unchanged.

All eight replacement clips use the existing voices and constant-gain profile (−22 LUFS target, −2 dBTP ceiling, maximum +9 dB gain), without trimming, timing changes or compression. Every clip meets target; none is limited. Provider originals, exact requests and normalization evidence are preserved in the ignored replacement batch and `~/.local/share/kikimashta/spanish-audio/207-replacement-v1/`: 56 hash-verified files plus the archive manifest.

Six focused generation/review tests and ESLint pass. Both Chromium and mobile WebKit decode, play and advance native clocks for all eight clips; see [verification](verification.json) and [per-clip evidence](native-playback.json). Listening acceptance and activation remain separate; real iPhone acceptance is manual.
