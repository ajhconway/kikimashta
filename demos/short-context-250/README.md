# Short contextual question review — #250, revision 2

[Open the private demo](https://kikimashta-short-context-250.cornell-tech-5688.chatgpt.site).

The owner's follow-up in #253 adds a [complete 74-prompt level-1 text/card review](https://kikimashta-short-context-250.cornell-tech-5688.chatgpt.site/drafts.html): two per each of the 37 source-level words, counting the ten examples below. It imports the real app stylesheet, palette and header. It reuses 56 existing images through 69 shared card concepts, with thirteen missing pictures explicitly labeled as shared artwork briefs. Correct-answer reveal, word filtering and the shared-card inventory expose reuse across words. The source bank and [authoring rules](../../content/contextual/short-level-1/README.md) are separate from the original player and its approved-generation audio snapshot.

The owner's review rejected the first version's recreated interface and hand-drawn SVG pictures. This replacement imports the real production `ContextualQuiz`, `MasteryFeedback`, `PracticeHeader`, `QuizProgress`, `themes.ts`, and `styles.css`. The shared header/progress were lifted unchanged from `App.tsx` into `PracticeChrome.tsx`; production and the review demo now use the same components. The demo has no separate quiz stylesheet or illustration renderer.

The ten short Japanese drafts are unchanged. Four counting prompts play only their sentence. The production contextual component supports that without requiring an empty question recording. Other prompts retain the same sentence–650 ms pause–question playback. The ready screen offers the approved contextual voices Otani and Morioki; all 32 clips now use the shared ElevenLabs pipeline.

## Artwork protocol

`artwork-v2/plan.json` records the corrective scope and canonical protocol. All forty answer slots bind to raster images: 36 new illustrations made with the built-in image tool and four exact approved whole-picture reuses. Exact prompts, reference roles/hashes, original output paths, every original generation, superseded candidates, and selected hashes are preserved in the manifests and request files. New images have genuine transparent exteriors, preserve opaque subject details, and were checked for their count/relation and 145px legibility over white, yellow, pink, and lavender. Historical approved mountain/river images retain their original opaque backgrounds unchanged.

New images are **pending owner review**, and the ten prompts remain demo drafts. The demo does not activate production content or write learning progress. Its answer state lives only in React memory.

`artwork-v2/manifest.json` is the complete source binding; `public/artwork.html` provides all forty answer cards, four-background previews, full resolution images, and expandable prompt/source records. `assemble-artwork.py` copies the original selected PNG bytes without changing pixels and verifies their hashes. The first rejected SVG implementation is preserved in Git history, not in the replacement player.

## Local checks

From the repository root, install the locked dependencies with `npm ci` and run `npm run check`. Production sentence-only regressions extend `src/components/ContextualQuiz.test.tsx`.

From this directory:

```sh
npm ci
npm run check
npm run build
npm start
E2E_AUDIO=quiet npm run test:browser
```

The local preview is http://127.0.0.1:5310. `check` validates TypeScript and every answer/source hash. Browser cases verify a complete ten-question session with real audio and the actual quiz, sentence-only and paired recordings, raster image decoding, feedback/translations, restart, and the failed-audio/replay boundary in Chromium and mobile WebKit. The physical iPhone and owner pronunciation/artwork acceptance remain separate.

Demo tests use the app's shared quiet-media helper through their own runner fixture, avoiding a second Playwright runner import. Runs mute only media output while retaining native promises, requests, decoding, playback clocks and events. Keep automated tests silent as requested by the owner.

## Portable Sites source

Repository builds resolve `@app` directly to the live `src/`. `prepare-site-source.py <existing-site-checkout>` preserves a hash-verified, byte-identical production source snapshot for portable Sites builds; it does not recreate markup or styles. The Sites checkout builds that snapshot with the same demo entry and assets. The existing private project ID and audience are retained.

## Audio protocol — revision 3

`audio-text-approval.json` binds the owner's generation request to the exact ten current drafts and source commit. The shared resumable contextual generator uses the registered Japanese voices, `eleven_v4`, one request at a time, no automatic retries, and an exact 310-input-character guard. The provider receives the written Japanese sentences; kana remains reading guidance in provenance. This authorization does not imply listening acceptance.

Run from the repository root (resume the same batch; never blindly repeat paid generation):

```sh
npm run audio:contextual:elevenlabs -- --batch short-demo-250 --dry-run
npm run audio:contextual:elevenlabs -- --batch short-demo-250 --output artifacts/generated-originals/contextual-audition/250-short-demo-v1
python3 scripts/content/normalize-elevenlabs.py --input artifacts/generated-originals/contextual-audition/250-short-demo-v1 --output artifacts/generated-originals/contextual-audition/250-short-demo-v1-normalized
node demos/short-context-250/prepare-audio.mjs --input artifacts/generated-originals/contextual-audition/250-short-demo-v1 --delivery artifacts/generated-originals/contextual-audition/250-short-demo-v1-normalized --review artifacts/contextual-audio-review/250-short-demo-v1
```

Staging reuses the shared review preflight for all 32 originals, sidecars, exact request identities, normalized levels/hashes and complete decodes. The local comparison gallery contains the twelve sentence/question pairs; all twenty sentence-only or paired prompts are playable through the two voices in this demo. `public/audio-provenance-v3.json` preserves exact requests, original/delivery hashes and full processing records without credentials or account usage. Provider originals, sidecars and usage evidence have a separate private archive under `~/.local/share/kikimashta/contextual-audio/250-short-demo-v1/`.

All 32 deliveries reached −22 LUFS within the existing tolerance and remain below −2 dBTP; none are target-limited. The original Kyoko clips/generator remain in Git history at `517cf97`; `audio-provenance-v2.json` is historical and superseded. No production bank is activated. Owner pronunciation/listening and real-iPhone acceptance remain pending.
