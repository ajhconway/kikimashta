# Batch11 activation — issue #72

The owner approved the revised cards175,179 and184 and requested publication of the reviewed batch. Starting from main `b0e5725da85e5d652af390863a15898658e6a87a`, this integration uses the immutable `/private/tmp/kikimashta-batch11-approved-source` snapshot. It activates exactly15 approved illustrations from the25 review slots169–193, bringing active artwork from168 to183 unique entries. Nine drafts remain `replace-later`; removed Form170 remains absent from the vocabulary library. No batch12 artwork is included.

All168 earlier activation records are exactly unchanged. The catalogue changes only15 image source/alt pairs. The starter bank, practice pool/sets, audio, stable IDs, contextual restrictions, runtime removal override and semantic exclusion groups remain unchanged. The library still contains440 entries: only the15 selected image/concept fields change. Deferred cards retain their prior runtime images. Form's historical source ID and media remain available for compatibility, with its existing removal override preserved.

The exporter now accepts an approved manifest containing the explicit resolved dispositions `replace-later` and `removed`, skipping those assets. It continues to reject unapproved manifests, unresolved/unknown statuses, duplicate IDs and unknown source IDs before encoding or mapping changes. Approved selections still pass the existing source hash/path/description, corruption, PNG alpha, white-detail and atomic delivery validation. Regression tests cover mixed dispositions, preserved mappings and rejection before any encoding.

All25 review assets, exact prompts, references, prior variants and feedback remain archived. The approved source PNG bytes are unchanged from the frozen snapshot. Production descriptions for the equation and jar are plain subject descriptions; generation prompts remain exact. The review gallery records15 approved, nine deferred and one removed, while the source alpha gallery retains all100 previews with disposition labels. Historical generation findings are explicitly labeled as historical. The batch10 publication evidence referenced by the workflow README is included from the frozen snapshot.

The15 new production PNGs are640×640 with preserved transparency, totaling3,943,037 bytes. Native Chrome decoded all15 and independently found transparent and opaque pixels in each; seven contain opaque white details. Four production sheets at145px on white, yellow, pink and lavender are saved with `production-alpha-inspection.json`. The lavender sheet was visually inspected for correct selections, readable equation, cloches, puppy, jar, eye details and clean transparency.

Checks completed:

- `npm run check`: lint, TypeScript,170 Vitest tests,137 Node tests,12 Python audio tests and production build passed. The existing bundle-size advisory remains.
- `node --test scripts/content/activate-approved-artwork.test.mjs scripts/content/approved-artwork.test.mjs`:29 passed, comprising25 exporter cases and four real-asset/provenance/rebuild checks across all183 active entries.
- `python3 scripts/cards/prepare.py`, `render_review.py` and `validate.py`:445 prompts, all48 findings, an acyclic500-node graph,22 feedback-gated batches and45 exclusion groups passed.
- `python3 -m unittest discover -s scripts/cards -p 'test_*.py'`:24 passed, including disposition preservation, validation and gallery behavior.
- `python3 artifacts/card-regeneration/batch-11/build_review.py`:100 disposition-labeled source alpha previews rendered.
- Six Chromium/mobile WebKit journeys passed: library browsing/search/audio retry, correct-feedback progression and incorrect-answer card motion. A temporary local config used dedicated port4188 with preview reuse disabled; it is not committed.
- Native Chrome verified all15 production PNG deliveries and saved four145px background sheets.
- Data comparison confirmed183 unique activations, all168 prior records exact, only15 catalogue image changes, all440 library entries retained, no deferred/removed activation and frozen source pixels unchanged.
- `git diff --check` passed.

No push, PR creation, merge or deployment was performed by this worker. Actual iPhone verification remains separate; mobile WebKit emulation supplements device testing. Approval does not clear context-dependent teaching restrictions or the older basketball seam follow-up.
