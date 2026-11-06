# Card regeneration

Work record: [GitHub issue #72](https://github.com/ajhconway/kikimashta/issues/72).

Artwork activation: [issue #77](https://github.com/ajhconway/kikimashta/issues/77) publishes all 40 selected approved images from PR #75. `activation.json` records source manifests, source hashes and compressed 640px JPEG delivery hashes. Starter and catalogue media paths and picture descriptions point to these assets; stable IDs, practice eligibility, review restrictions and answer-choice policies remain unchanged. Policy integration is deferred at the owner's request to [issue #79](https://github.com/ajhconway/kikimashta/issues/79). The staged generation records below continue to describe the review workflow.

## Image backgrounds and delivery

Follow-up: [issue #92](https://github.com/ajhconway/kikimashta/issues/92). PR #81 delivered opaque JPEGs. Colored answer fills exposed their rectangular white backdrops. Quiz illustration surfaces now stay white through hover, correct, incorrect and disabled states; borders, badges and celebrations retain answer feedback. Existing approved artwork and historical prompts/hashes are preserved.

For every future generation or revision:

- Request a genuinely transparent outer background and set `transparent_background=true` on the built-in image tool. A white-looking background or PNG extension alone does not establish transparency. Never paint a checkerboard into the image.
- Preserve opaque white parts of the subject (clouds, snow, foam, animal markings). Keep required scene colors within their intended silhouette. Do not use white-key removal or blend modes that erase or tint those details.
- Deliver PNG or WebP with its alpha channel intact. Never flatten transparent artwork to JPEG. Check the delivered file has transparent outer pixels and opaque subject pixels after resizing/compression; record its format and hashes in activation provenance and update format validation when activating it.
- Inspect the delivered image at 145px over white and the former answer colors: yellow `#fff2c5`, pink `#fff0f5`, lavender `#f6efff`. Reject rectangular fills, painted checkerboards and edge halos. Check an actual correct and incorrect answer in the app; verify on the real iPhone before release.

`prepare.py` appends the current background/export requirement after scene and reference instructions, so historical requests for white backgrounds cannot override it. The style specifications also request transparency. Historical batch manifests remain the record of what was actually generated, rather than instructions for new images.

All 445 reviewed entries retain their stable IDs. The 441 library concepts and four additional starter concepts are snapshotted from the original checkout, including effective review overrides. The snapshot records source hashes. The original app files are not present in this worktree.

- [Prompt changes by finding](review-changes.md): all 48 findings, including context requirements and provisional gloss clarifications.
- [Dependency graph](dependency-graph.md): shared visual language, reusable objects/characters and all card dependencies. `graph.json` stores the complete DAG.
- `prompts.json`: complete revised prompts, original concepts, teaching restrictions and generation constraints. Grouped review findings are narrowed to each card's role before generation.
- `semantic-exclusions.json`: staged answer-collision policy. This is separate from generation dependencies and still needs app integration before regenerated cards enter practice.
- `batches.json`: 45 provisional batches of up to ten. Later batches remain blocked until previous feedback is applied and required references are ready.
- [Batch 01 gallery](../../artifacts/card-regeneration/batch-01/review.html): ten independently generated images, full-resolution links, 145px previews and exact prompts.
- [Batch 02 gallery](../../artifacts/card-regeneration/batch-02/review.html): approved cards 11–20.
- [Batch 03 gallery](../../artifacts/card-regeneration/batch-03/review.html): approved cards 21–30.

Generated PNGs and exact prompts/reference paths are saved in each batch directory's `manifest.json`. Generation uses the built-in image tool. The first apple is a provisional style reference within batch one; only user-approved artwork becomes a reference for later batches. Shared conventions without seed images are specifications, not completed reference assets.

Batch 01 is accepted for proceeding. The user selected basketball v4 for now and requested that its seam/angle improvement remain recorded. It is marked accepted with a known issue; the other nine cards are approved. Rejected versions remain preserved.

Batch 02's ten cards (11–20) are approved. They use the root `Kikimashta Japanese Listening Cat.png` as their style reference, with soft shading and white backgrounds. Card 18 v5 retains the separate scissors facing an intact sheet's dashed guide. The source PNG is copied to `artifacts/card-regeneration/references/cat-style-reference.png` and hash-verified. The earlier [pale-background cat gallery](../../artifacts/card-regeneration/batch-02/review-cat-v2.html) and [apple-reference gallery](../../artifacts/card-regeneration/batch-02/review-apple-style.html) remain available for comparison.

Batch 03's cards 21–30 continue the approved cat-reference style on white backgrounds. Red reuses the approved blue splash/brush design. All ten are approved, including water without ripple lines. Earlier selected images and the basketball follow-up remain preserved.

`style-overrides.json` assigns the cat style to batches 02–04 and the counting family. Its current specification requires transparency; the approved historical batches used white backgrounds. Their canonical prompts and graph use a separate `style:cat-png` root, without changing batch 01 or later ungenerated cards. The generation/edit request JSON files and each asset's manifest entry record exact prompts and reference roles. Original images, prompts and hashes remain in version history.

`user-feedback.json` records the requests, accepted-with-issue notes, corrected concepts and shared component guidance. Preparation carries that guidance into dependent prompts, copies current reference status from the batch manifests and unlocks only the next batch after review. A recorded improvement is not cleared by accepting a card for now.

Record global and numbered feedback in each batch's `feedback.md`, revise affected prompts and artwork, and invalidate changed references before unlocking another batch. Do not rerun preparation after manually changing generated metadata without incorporating those changes into `prepare.py` or `user-feedback.json`. App deployment, choice-filter integration and real iPhone verification remain separate.

Verified local commands (Python 3, standard library only):

```sh
python3 scripts/cards/prepare.py
python3 scripts/cards/render_review.py
python3 -m unittest discover -s scripts/cards -p 'test_*.py'
python3 scripts/cards/validate.py
```

The preparation script never generates images or calls the network. Existing app lint, type checks, tests and build are unavailable in this planning-only worktree.

Batch 04 (31–40) is approved, including lavender half, rain without a puddle, sun rays and a reusable winter park scene. Card 38 establishes the cube design for X things. The graph records both design families. Batch 05 is next.
