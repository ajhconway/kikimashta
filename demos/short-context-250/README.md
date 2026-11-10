# Short contextual question review — #250, revision 2

[Open the private demo](https://kikimashta-short-context-250.cornell-tech-5688.chatgpt.site).

The owner's review rejected the first version's recreated interface and hand-drawn SVG pictures. This replacement imports the real production `ContextualQuiz`, `MasteryFeedback`, `PracticeHeader`, `QuizProgress`, `themes.ts`, and `styles.css`. The shared header/progress were lifted unchanged from `App.tsx` into `PracticeChrome.tsx`; production and the review demo now use the same components. The demo has no separate quiz stylesheet or illustration renderer.

The ten short Japanese drafts are unchanged. Four counting prompts play only their sentence. The production contextual component now supports that without requiring an empty question recording. Other prompts retain the same sentence–650 ms pause–question playback. Kyoko prototype audio is separate from the production voice-selection process.

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
npm run test:browser
```

The local preview is http://127.0.0.1:5310. `check` validates TypeScript and every answer/source hash. Browser cases verify a complete ten-question session with real audio and the actual quiz, sentence-only and paired recordings, raster image decoding, feedback/translations, restart, and the failed-audio/replay boundary in Chromium and mobile WebKit. The physical iPhone and owner pronunciation/artwork acceptance remain separate.

## Portable Sites source

Repository builds resolve `@app` directly to the live `src/`. `prepare-site-source.py <existing-site-checkout>` preserves a hash-verified, byte-identical production source snapshot for portable Sites builds; it does not recreate markup or styles. The Sites checkout builds that snapshot with the same demo entry and assets. The existing private project ID and audience are retained.

`python3 generate-audio.py` regenerates the sixteen individual MP3 clips on macOS using the installed Kyoko voice and ffmpeg. `audio-provenance-v2.json` records exact kana, durations, normalization and the component-owned pause. Earlier prototype recording provenance remains preserved.
