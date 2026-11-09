# Spanish Food level 1 (#218)

The owner accepted all 36 pictures and 288 recordings and authorized auto-merge. Food level 1 is registered for practice with eight regional voices; final checks, integration and deployment are tracked in [PR #219](https://github.com/ajhconway/kikimashta/pull/219). Real-iPhone acceptance remains the owner’s deployed-device check. The preparation sections below preserve the earlier review stages.

The exact approved list is in [draft.json](draft.json). Its 24 overlapping Spanish entries retain their existing stable IDs and audio. The accepted cooked-rice image overrides the shared Spanish rice picture. Twelve entries are new to Spanish: papa, jitomate, cebolla, zanahoria, lechuga, tortilla, frijoles, pasta, yogur, sándwich, pizza and té. The accepted Japanese golden onion is an inspected exact picture reuse, so the initial set used 11 new illustrations and 25 approved reuses. The owner subsequently requested the three artwork revisions below.

[Generation authorization](generation-approval.json) binds the draft and [exact prompts](../../artifacts/spanish-food-1-art/requests.json). Each generated original, reference hash and tool record is preserved in `artifacts/spanish-food-1-art/`. Natural food colours, bold purple outlines and clear noun-led silhouettes follow the existing Spanish cards. Complete all 36 pictures before requesting owner feedback.

All 36 pictures are ready: [complete review](../../artifacts/spanish-food-1-art/review.html), [picture grid](../../artifacts/spanish-food-1-art/artwork.html), and [contact sheet](../../artifacts/spanish-food-1-art/contact-sheet.png). The revised selection contains 12 generated transparent PNGs and 24 unchanged approved reuses, with no pending pictures; all 14 generated image versions are preserved. Rebuild and verify the gallery with `node scripts/content/build-spanish-food-level-1-art-review.mjs`; focused provenance/tamper tests are beside that script. The built-in image tool generated every new original. Exact prompts are in the requests file and the originals/records directories preserve all source bytes and hashes. Artwork acceptance is recorded below; new audio generation is now authorized below; listening acceptance and runtime activation follow.

Chromium and mobile WebKit verified all 36 loaded pictures at145px, group/source filters, accent-insensitive search, stable existing item IDs and a phone layout without overflow or page errors. Independent read-only review verified every selected image hash and all 11 prompt/reference/record chains with no material findings. Before future practice activation, review picture-choice ambiguity across all selected packs, including assembled foods containing other target ingredients.

[Verification record](artwork-verification.json): `VITEST_MAX_WORKERS=2 npm run check` passed lint, types, 571 app tests, 292 Node tests (including five focused artwork checks), 18 audio/content Python tests, 27 card tests, content validators and the production build.

## Owner artwork revisions

[The exact feedback amendment](artwork-revisions-v1.json) binds three versioned requests and the original full-pack review snapshot. Arroz now has a separate cooked-white-rice bowl prepared for Spanish; its existing `es-419-travel-rice` identity and progress are retained. The Japanese uncooked-rice source and catalogue mapping stay unchanged. Beans v2 replaces the oversized mottled beans with many smaller smooth brown beans. Tomato v2 uses a broad squat silhouette, gentle lobes and a smaller calyx. The other 33 selected pictures remain byte-identical.

The immutable approved draft, original generation authorization and original 11 prompts still describe the initial generation. The separate amendment applies the revised selection without rewriting that history. [Revision prompts](../../artifacts/spanish-food-1-art/revisions/) and all original PNGs/records are preserved; the gallery verifies the complete original source set before applying the three updates. No production mapping or new speech is included in this revision.

## Artwork acceptance

The owner accepted the complete current picture set with “I'm happy with the artwork.” [Exact artwork acceptance](artwork-acceptance.json) binds the unchanged current manifest, selection, artwork amendment and all 36 selected image hashes. It includes cooked Spanish rice, beans v2 and tomato v2. Japanese keeps the uncooked rice picture.

The owner authorized the audio scope with “Please go ahead and generate them.” It reuses 192 accepted recordings for the 24 overlapping Spanish words and adds 96 recordings for the 12 new Spanish entries in the existing eight regional voices (608 input characters). The separate [audio authorization](audio-approval.json) binds the exact new-word list, configuration, accepted artwork and [verified reuses](audio-reuse.json). Listening acceptance and activation remain pending.

After recording acceptance, all six focused artwork/acceptance tests and ESLint pass for the final gallery builder. The accepted HTML state validates the approval record without changing the hash-bound image manifest. Both browser engines verify the accepted header and the same 36 loaded pictures.

## Audio generation

Generate only the 12 new Spanish entries in the existing eight regional voices: 96 recordings / 608 Unicode input characters. The 24 overlapping words reuse 192 accepted production recordings with their current paths and hashes. The full review will contain 36 accepted pictures and 288 voice recordings without duplicating existing deliveries. Provider originals, exact requests and normalization evidence stay in the ignored batch and a verified private archive; the review contains processed delivery MP3s and public provenance only.

The 96 new recordings are generated and normalized in [the new-word listening review](../../artifacts/spanish-food-1-audio-review/index.html). All 96 passed native decode, play and advancing-clock checks in Chromium and mobile WebKit; the original 192 reused recordings remain byte-identical. All provider originals, sidecars and processing evidence are in the ignored `artifacts/generated-originals/218-v1` batch and a private verified archive at `~/.local/share/kikimashta/spanish-audio/218-v1/` (584 files plus its archive manifest).

Three new clips remain safely quieter within the fixed processing limits: Santiago / pasta (−22.40 LUFS), Juan / sándwich (−22.54 LUFS), and Carlos Figueroa / pizza (−22.98 LUFS). The review flags these individually. No speech is regenerated to alter the processing profile.

The complete [Food listening review](media-review.html) combines the 36 accepted pictures with all 288 recordings, using the exact existing delivery paths for the 192 reuses. Choose **New recordings only** to focus on the 96 additions. Search by Spanish/English, food group, voice or region; play individual clips or the visible sequence. Rebuild it locally with `node scripts/content/build-spanish-food-level-1-media-review.mjs`; this reads verified media and does not call the provider. Listening acceptance remains pending.

[Complete media verification](media-verification.json): `VITEST_MAX_WORKERS=2 npm run check` passes lint, types, 571 app tests, 303 Node tests, 18 audio/content Python tests, 27 card tests, validators and the production build. The combined gallery passed Chromium/mobile-WebKit source, filter, native playback/Stop, layout and storage checks. Independent review verified all 288 recording hashes and accepted reuse identities with no material findings.

## Final acceptance and activation

The owner accepted the recordings and authorized auto-merge with “I'm happy with the audio. Let's auto-merge.” [Final acceptance](acceptance.json) binds the exact combined review, accepted source banks, all selected media and the three quieter deliveries above. Historical manifests retain their original review-stage status.

[Activation journal](activation.json) verifies 36 images and 288 recordings. Staging copies twelve generated PNGs and 96 new MP3s, reuses 24 existing pictures and 192 existing clips in place, and checks every destination before writing. Reproduce with `node scripts/content/stage-spanish-food-level-1.mjs`; no provider request is involved. The 24 shared IDs preserve Travel/Food progress. The six-pack Spanish pool has 171 unique picture words plus nine foundation contexts. Both ordinary and contextual Spanish answers use cooked rice; Japanese retains the original uncooked rice.

[Picture-choice review](picture-choice-review.json) records inspection of all 171 current pictures and twelve additional symmetric exclusions for confusing assembled-food/ingredient pairs. The historical Travel audit remains unchanged. Regression coverage includes all 63 nonempty pack combinations, exact accepted hashes, pre-write tamper/symlink rejection, shared progress in real IndexedDB, pack selection after reload, contextual rice and native new-word playback. Final check results are in [media verification](media-verification.json) and PR #219. [Issue #218](https://github.com/ajhconway/kikimashta/issues/218) remains open for owner real-iPhone acceptance.
