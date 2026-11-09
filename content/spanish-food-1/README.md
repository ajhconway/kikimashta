# Spanish Food level 1 artwork (#218)

The owner approved the 36-word proposal and requested missing artwork. This change prepares pictures for consolidated review; it does not generate speech or register a practice pack.

The exact approved list is in [draft.json](draft.json). Its 24 overlapping Spanish entries retain their existing stable IDs and accepted images/audio. Twelve entries are new to Spanish: papa, jitomate, cebolla, zanahoria, lechuga, tortilla, frijoles, pasta, yogur, sándwich, pizza and té. The accepted Japanese golden onion is an inspected exact picture reuse, so the initial set used 11 new illustrations and 25 approved reuses. The owner subsequently requested the three artwork revisions below.

[Generation authorization](generation-approval.json) binds the draft and [exact prompts](../../artifacts/spanish-food-1-art/requests.json). Each generated original, reference hash and tool record is preserved in `artifacts/spanish-food-1-art/`. Natural food colours, bold purple outlines and clear noun-led silhouettes follow the existing Spanish cards. Complete all 36 pictures before requesting owner feedback.

All 36 pictures are ready: [complete review](../../artifacts/spanish-food-1-art/review.html), [picture grid](../../artifacts/spanish-food-1-art/artwork.html), and [contact sheet](../../artifacts/spanish-food-1-art/contact-sheet.png). The revised selection contains 12 generated transparent PNGs and 24 unchanged approved reuses, with no pending pictures; all 14 generated image versions are preserved. Rebuild and verify the gallery with `node scripts/content/build-spanish-food-level-1-art-review.mjs`; focused provenance/tamper tests are beside that script. The built-in image tool generated every new original. Exact prompts are in the requests file and the originals/records directories preserve all source bytes and hashes. Artwork acceptance is recorded below; new audio generation and runtime activation are subsequent steps.

Chromium and mobile WebKit verified all 36 loaded pictures at145px, group/source filters, accent-insensitive search, stable existing item IDs and a phone layout without overflow or page errors. Independent read-only review verified every selected image hash and all 11 prompt/reference/record chains with no material findings. Before future practice activation, review picture-choice ambiguity across all selected packs, including assembled foods containing other target ingredients.

[Verification record](artwork-verification.json): `VITEST_MAX_WORKERS=2 npm run check` passed lint, types, 571 app tests, 292 Node tests (including five focused artwork checks), 18 audio/content Python tests, 27 card tests, content validators and the production build.

## Owner artwork revisions

[The exact feedback amendment](artwork-revisions-v1.json) binds three versioned requests and the original full-pack review snapshot. Arroz now has a separate cooked-white-rice bowl prepared for Spanish; its existing `es-419-travel-rice` identity and progress are retained. The Japanese uncooked-rice source and catalogue mapping stay unchanged. Beans v2 replaces the oversized mottled beans with many smaller smooth brown beans. Tomato v2 uses a broad squat silhouette, gentle lobes and a smaller calyx. The other 33 selected pictures remain byte-identical.

The immutable approved draft, original generation authorization and original 11 prompts still describe the initial generation. The separate amendment applies the revised selection without rewriting that history. [Revision prompts](../../artifacts/spanish-food-1-art/revisions/) and all original PNGs/records are preserved; the gallery verifies the complete original source set before applying the three updates. No production mapping or new speech is included in this revision.

## Artwork acceptance

The owner accepted the complete current picture set with “I'm happy with the artwork.” [Exact artwork acceptance](artwork-acceptance.json) binds the unchanged current manifest, selection, artwork amendment and all 36 selected image hashes. It includes cooked Spanish rice, beans v2 and tomato v2. Japanese keeps the uncooked rice picture.

The next audio scope would reuse 192 accepted recordings for the 24 overlapping Spanish words and add 96 recordings for the 12 new Spanish entries in the existing eight regional voices (608 input characters). That generation and subsequent listening acceptance/activation remain separate from this picture approval.

After recording acceptance, all six focused artwork/acceptance tests and ESLint pass for the final gallery builder. The accepted HTML state validates the approval record without changing the hash-bound image manifest. Both browser engines verify the accepted header and the same 36 loaded pictures.
