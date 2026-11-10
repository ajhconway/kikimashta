# Revision 3 audio verification — 2026-11-10

- Exact current ten-draft approval gate and shared generation/resume regressions: 22 passed before paid generation.
- Shared resumable contextual engine: 32/32 provider originals generated, Otani and Morioki, `eleven_v4`, Japanese request text, 310 Unicode input characters, one request at a time and no automatic retries.
- Shared `normalize-elevenlabs.py`: 32/32 deliveries, −22 LUFS within tolerance, true peaks at/below −2 dBTP, no target-limited clips. Provider originals remain unchanged.
- Shared contextual review preflight: complete request/voice/approval identities, every original and sidecar hash, normalized profile/levels/hashes and full decoding verified for all 32 clips. Local twelve-pair comparison generated; sentence-only prompts play in the demo without an added question.
- Private durable archive: 201 files copied and SHA-256 verified, covering originals, sidecars, plans, processing and usage evidence. Public provenance omits credentials and account usage.
- Repository `npm run check`: passed lint/types, 523 Vitest tests, 386 Node tests, 52 Python audio tests, 27 artwork tests, validators/neighbors and production build.
- Demo `npm run check` and `npm run build`: passed TypeScript, forty immutable image bindings and all thirty-two exact audio text/delivery bindings.
- Demo `npm run test:browser`: 4 passed, zero skips/retries, in 46.0 seconds. Chromium completed all ten prompts with Otani; mobile WebKit completed all ten with Morioki. Both checked real playback through the selected voice, four sentence-only prompts, six sentence/pause/question pairs, forty raster cards, feedback/translations, finish/restart, audio failure/replay and the art gallery. No script errors or horizontal overflow.

The existing private demo is the review destination. Owner listening/pronunciation, artwork approval and actual-iPhone acceptance remain pending. PR #251 remains open; no production practice activation or merge is part of this audio update.

# Revision 2 verification — 2026-11-10 (prior artwork/UI correction)

The first recreated interface/SVG demo was rejected by the owner. This revision uses the actual app components and stylesheet, with reference-based generated picture cards. Earlier implementation and test evidence remain in Git history; this is the current result.

- Repository `npm run check`: passed with this worktree's own locked dependency installation. Lint, types, 523 Vitest tests, 384 Node script tests, 52 Python audio tests, 27 artwork tests, artwork/neighbor validation, and production build passed. The earlier run using another worktree's shared dependencies is superseded by this successful isolated run.
- Demo `npm run check`: TypeScript and all forty source/image/audio bindings passed.
- Demo `npm run build`: passed using imports of the real production quiz, feedback, shared header/progress, themes, and stylesheet.
- Demo `npm run test:browser`: 4 passed, zero skips/retries, in 46.3 seconds. Chromium desktop and mobile WebKit each completed all ten prompts with real sentence-only/paired MP3 playback, decoded all forty raster pictures, checked feedback and the Japanese/English dialog, finished/restarted, and exercised failed audio/replay plus the artwork/source gallery. No horizontal overflow or page script errors were observed.
- Desktop and mobile screenshots of the actual quiz were inspected. The mobile view uses the production close control, mascot/speaker placement, card sizing, feedback area, and progress beads.
- All 36 newly selected PNGs are square RGBA with both transparent and opaque pixels. Exact quantities, actions, relations, and 145px four-background rendering were inspected. Four exact approved whole images are reused unchanged. All 39 generated outputs are preserved, including three rejected framing/glow candidates. Prompts, reference roles/hashes, generation paths, selection/version records, original bytes and hashes remain under `artwork-v2/`.
- Independent read-only review found no material bugs in the production-component integration, header/progress extraction, sentence-only playback, or storage isolation.

New pictures and short prompts remain pending owner review. The actual iPhone and pronunciation acceptance have not been performed by the agent. No production content approval, practice-bank activation, progress migration, or merge authorization is inferred.
