# Batch11 activation — issue #72

The owner approved revised cards175,179 and184, then explicitly requested publication of the nine deferred drafts with a Replace later marker. Starting from main `b0e5725da85e5d652af390863a15898658e6a87a`, this integration uses the frozen batch11 source snapshot plus that recorded publication authorization. It activates24 illustrations from25 review slots169–193:15 approved images and nine provisional drafts. Active artwork totals192 unique entries. Form170 remains removed. No batch12 artwork is included.

All168 earlier activation records remain exactly unchanged. The15 approved entries added in the first batch11 commit also remain exactly unchanged; the draft follow-up only appends nine activation records. Relative to main, catalogue changes are limited to24 image source/alt pairs. The starter bank, practice pool/sets, audio, stable IDs, context restrictions, runtime removal override and semantic exclusions remain unchanged. The library retains440 entries. The nine drafts keep their `replace-later` source status and outstanding feedback, and carry `replaceLater: true` in activation provenance, source visual metadata and library data. Each shows a visible Replace later badge in the vocabulary library; quiz UI and eligibility are unchanged.

Draft publication requires `publishDraft: true`, manifest authorization, a nonempty owner instruction and that exact card's inclusion in the authorization list. Deferred artwork without this authorization stays inactive; removed assets cannot be published. Unknown/pending statuses, unapproved manifests, duplicates and unknown source IDs still fail before encoding. Approved and authorized draft selections pass the existing source/path/hash/description, PNG corruption, transparency, white-detail and atomic-delivery checks. A future approved replacement clears the provisional flag from activation/source visuals, even when historical draft authorization remains; library rebuilds then omit the badge. Tests cover the transition, unauthorized publication and repeated rebuild preservation.

All25 review assets, exact prompts, references, prior variants and feedback remain archived. Source PNG bytes are unchanged. Current source galleries retain disposition labels and all100 source alpha previews. Historical generation findings remain explicitly labeled. The workflow README includes the snapshot's linked batch10 publication evidence.

The24 production PNGs are640×640 with preserved transparency, totaling6,404,055 bytes. Native Chrome decoded all24, finding transparent and opaque pixels in each;11 contain opaque white details. Four production sheets at145px on white, yellow, pink and lavender are saved with `production-alpha-inspection.json`. The lavender sheet was visually inspected. The15 approved delivery hashes are unchanged from the first integration; the nine drafts add2,461,018 bytes.

Final checks:

- `npm run check`: lint, TypeScript,170 Vitest tests,145 Node tests,12 Python audio tests and production build passed. The existing bundle-size advisory remains.
- Focused exporter, real-artwork/provenance/rebuild and library-builder tests:54 passed, including32 exporter cases, four real-asset checks across192 entries and18 library-builder cases.
- `python3 scripts/cards/prepare.py`, `render_review.py` and `validate.py`:445 prompts, all48 findings, an acyclic500-node graph,22 feedback-gated batches and45 exclusion groups passed.
- `python3 -m unittest discover -s scripts/cards -p 'test_*.py'`:24 passed.
- `python3 artifacts/card-regeneration/batch-11/build_review.py`:100 disposition-labeled source alpha previews rendered.
- Eight Chromium/mobile WebKit journeys passed: library browsing/search/audio retry, all nine Replace later badges, correct-feedback progression and incorrect-answer card motion. Temporary dedicated-port configuration was removed before commit.
- Native Chrome verified all24 production PNGs and saved four145px background sheets.
- Data audit confirmed192 unique activations, all183 records from the first batch11 integration unchanged, nine added provisional markers, all440 library entries retained and Form inactive. Non-image/context/audio/eligibility fields and all unrelated library records remain exact.
- `git diff --check` passed.

This worker did not push, create a PR, merge or deploy. Actual iPhone verification remains separate; mobile WebKit emulation supplements device testing. Neither draft publication nor artwork approval clears teaching restrictions or the older basketball seam follow-up.
