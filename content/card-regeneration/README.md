# Card regeneration

Work record: [GitHub issue #72](https://github.com/ajhconway/kikimashta/issues/72).

All 445 reviewed entries retain their stable IDs. The 441 library concepts and four additional starter concepts are snapshotted from the original checkout, including effective review overrides. The snapshot records source hashes. The original app files are not present in this worktree.

- [Prompt changes by finding](review-changes.md): all 48 findings, including context requirements and provisional gloss clarifications.
- [Dependency graph](dependency-graph.md): shared visual language, reusable objects/characters and all card dependencies. `graph.json` stores the complete DAG.
- `prompts.json`: complete revised prompts, original concepts, teaching restrictions and generation constraints. Grouped review findings are narrowed to each card's role before generation.
- `semantic-exclusions.json`: staged answer-collision policy. This is separate from generation dependencies and still needs app integration before regenerated cards enter practice.
- `batches.json`: 22 provisional batches; first six of ten, then up to25. Later batches remain blocked until previous feedback is applied and required references are ready.
- [Batch 01 gallery](../../artifacts/card-regeneration/batch-01/review.html): ten independently generated images, full-resolution links, 145px previews and exact prompts.
- [Batch 02 gallery](../../artifacts/card-regeneration/batch-02/review.html): approved cards 11–20.
- [Batch 03 gallery](../../artifacts/card-regeneration/batch-03/review.html): approved cards 21–30.

Generated PNGs and exact prompts/reference paths are saved in each batch directory's `manifest.json`. Generation uses the built-in image tool. The first apple is a provisional style reference within batch one; only user-approved artwork becomes a reference for later batches. Shared conventions without seed images are specifications, not completed reference assets.

Batch 01 is accepted for proceeding. The user selected basketball v4 for now and requested that its seam/angle improvement remain recorded. It is marked accepted with a known issue; the other nine cards are approved. Rejected versions remain preserved.

Batch 02's ten cards (11–20) are approved. They use the root `Kikimashta Japanese Listening Cat.png` as their style reference, with soft shading and white backgrounds. Card 18 v5 retains the separate scissors facing an intact sheet's dashed guide. The source PNG is copied to `artifacts/card-regeneration/references/cat-style-reference.png` and hash-verified. The earlier [pale-background cat gallery](../../artifacts/card-regeneration/batch-02/review-cat-v2.html) and [apple-reference gallery](../../artifacts/card-regeneration/batch-02/review-apple-style.html) remain available for comparison.

Batch 03's cards 21–30 continue the approved cat-reference style on white backgrounds. Red reuses the approved blue splash/brush design. All ten are approved, including water without ripple lines. Earlier selected images and the basketball follow-up remain preserved.

`style-overrides.json` assigns the cat style to batches 02–04 and the counting family and specifies white backgrounds. Their canonical prompts and graph use a separate `style:cat-png` root, without changing batch 01 or later ungenerated cards. The generation/edit request JSON files and each asset's manifest entry record exact prompts and reference roles. Original images, prompts and hashes remain in version history.

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

Batch 04 (31–40) is approved, including lavender half, rain without a puddle, sun rays and a reusable winter park scene. Card 38 establishes the cube design for X things. The graph records both design families. Batches05–07 have since been approved.

Batches 05 and 06 (41–60) are approved in full. Future review batches contain 25 cards, starting with batch 07 (61–85); previous membership stays fixed. Activation is tracked separately in `activation.json`; app image mappings and published assets must be updated together with source visual records, so content rebuilds preserve approved artwork.

Batch07 feedback establishes Kiku as the generic reference subject for spatial and size comparisons; literal vocabulary subjects retain their own objects. `kiku-reference-subject` records the copied app mascot identity source and applicable cards. A scoped `kiku-scenes` profile permits this intended character use. All batch07scenes are approved, including the shared under/on-chair pair.

Pure cardinal-number vocabulary uses pool balls for1–15, lavender for16–99, pink for100–999, sky blue for1000–9999 and gold for10000+. `numberPresentation` records exact ranges and colors; currency, age and specific object counters are excluded. Number50 keeps the existing lavender artwork;1000 and10 revisions are approved; pool-ball rendering is flat, without glossy highlights.

Batch07 (61–85) is approved in full. The chair pair66/70 establishes a physical under/on-seat comparison with the same furniture and Kiku proportions. Batch08 (86–110) has also been approved in full.

Batch08 (86–110) contains25approved transparent-background PNGs. Shared tree, washing-machine-count and pull-off daily-calendar prototypes are recorded in the dependency graph and approved. [Gallery](../../artifacts/card-regeneration/batch-08/review.html) and [four-background alpha inspection](../../artifacts/card-regeneration/batch-08/alpha-review.html). Current future-generation policy requests transparent_background=true and preserves opaque white subject details; historical opaque source files remain unchanged.

Batch08 activation brings the app to110approved illustrations. Alpha sources use640pxPNG delivery with decoded transparency/opaque-white checks; the previous85JPEG delivery records are unchanged. Each transparent activation record identifies its PNG format and preserved alpha. New batches remain behind their own feedback gates.
