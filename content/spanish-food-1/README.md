# Spanish Food level 1 artwork (#218)

The owner approved the 36-word proposal and requested missing artwork. This change prepares pictures for consolidated review; it does not generate speech or register a practice pack.

The exact approved list is in [draft.json](draft.json). Its 24 overlapping Spanish entries retain their existing stable IDs and accepted images/audio. Twelve entries are new to Spanish: papa, jitomate, cebolla, zanahoria, lechuga, tortilla, frijoles, pasta, yogur, sándwich, pizza and té. The accepted Japanese golden onion is an inspected exact picture reuse, so this set needs 11 new illustrations and reuses 25 approved pictures.

[Generation authorization](generation-approval.json) binds the draft and [exact prompts](../../artifacts/spanish-food-1-art/requests.json). Each generated original, reference hash and tool record is preserved in `artifacts/spanish-food-1-art/`. Natural food colours, bold purple outlines and clear noun-led silhouettes follow the existing Spanish cards. Complete all 36 pictures before requesting owner feedback.

All 36 pictures are ready: [complete review](../../artifacts/spanish-food-1-art/review.html), [picture grid](../../artifacts/spanish-food-1-art/artwork.html), and [contact sheet](../../artifacts/spanish-food-1-art/contact-sheet.png). The set contains 11 new transparent PNGs and 25 unchanged approved reuses, with no pending pictures. Rebuild and verify the gallery with `node scripts/content/build-spanish-food-level-1-art-review.mjs`; focused provenance/tamper tests are beside that script. The built-in image tool generated every new original. Exact prompts are in the requests file and the originals/records directories preserve all source bytes and hashes. Final artwork acceptance, any new audio generation and runtime activation are subsequent steps.

Chromium and mobile WebKit verified all 36 loaded pictures at145px, group/source filters, accent-insensitive search, stable existing item IDs and a phone layout without overflow or page errors. Independent read-only review verified every selected image hash and all 11 prompt/reference/record chains with no material findings. Before future practice activation, review picture-choice ambiguity across all selected packs, including assembled foods containing other target ingredients.

[Verification record](artwork-verification.json): `npm run check` passed lint, types, 571 app tests, 291 Node tests (including four focused artwork checks), 18 audio/content Python tests, 27 card tests, content validators and the production build.
