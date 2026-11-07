# Batch 09 activation — issue #72

The owner approved all selected cards 111–135. This branch is based on main `1acc918` (merged PR #98) and activates 25 approved PNGs, bringing active approved artwork to 135. Its source is the frozen `/private/tmp/kikimashta-batch09-approved-source` snapshot; later live-root number-batch reordering is not included.

The first 110 activation asset records are exactly unchanged. The catalogue has only 24 image src/alt updates and the starter bank has one image-only update for ja-cat. IDs, audio and all eligibility/review restrictions are preserved. The review library and source visual descriptions match the approved subjects. Batch09 current manifest/gallery notes record approval; chronological earlier feedback, prompts and variants remain intact. No actual approved source pixels were changed.

The 25 new deliveries are alpha-preserving 640×640 PNGs, totaling 7,249,113 bytes. Native Chrome independently decoded all 25 and verified transparent and near-opaque pixels. Production sheets at 145px on white, yellow, pink and lavender were saved and inspected. White paper, clouds, signs and other substantial white subject details remain visible.

One narrow exporter correction is necessary for this batch. Card118's source has only66near-white pixels among605,036near-opaque pixels (~0.0109%), located on thin antialias/attention-stroke edges rather than a white subject area. Resampling1254→640naturally yields0pixels above the strict-white threshold. The old rule demanded at least one strict-white output pixel whenever any source pixel was near-white, incorrectly rejecting this valid resized image. Validation now projects source-white area to delivery resolution and requires white retention only when that projected area is at least one output pixel and at least0.1%of projected opaque subject area. This scales with source/delivery dimensions and disregards sub-resolution specks while retaining the white-region guard for paper/cloud/number patches. A64×64realPNGfixture with one white highlight can resample to a2×2PNGwithout exact-white pixels; the existing substantial-white-loss fixture still fails atomically. Transparent/opaque pixel, size, CRC, IEND and corruption checks are unchanged. Previous delivery records are not rewritten.

Validation on the final code:

- `npm run check` passed: lint, TypeScript,143Vitest tests,121Node tests,12Python audio tests,production build. Existing bundle-size advisory remains.
-19focused exporter/real-delivery/rebuild tests passed, including17exporter cases and all135active source/delivery hashes and app/library mappings.
- `python3 scripts/cards/prepare.py`, `render_review.py`, `validate.py` passed:445prompts,all48findings,acyclic496-node graph,22feedback-gated batches,45exclusiongroups.
- `python3 -m unittest discover -s scripts/cards -p 'test_*.py'` passed14tests.
- Six focused Chromium/mobile WebKit journeys passed: vocabulary library,correct feedback,and incorrect-answer card motion.
- Native installed Chrome decoded all25new productionPNG deliveries at640×640with realalpha and opaque subjectpixels; four145pxbackgroundsheets were captured and visually inspected.
- Independent read-only review verified all selected sources against the frozen snapshot, prior110records, runtime data preservation, nativealpha/white retention, threshold rationale/regression, and final approval wording.
- `git diff --check` passed.

This worker did not push, create a PR, merge or deploy. Actual iPhone verification remains separate; mobile WebKit emulation is supplemental. Source approval does not clear context-dependent teaching restrictions or the older basketball seam follow-up.

## Numerical scheduling follow-up

PR review found that the recorded request for a single numerical group was not yet reflected in the durable pushed schedule. This follow-up includes the reviewed root planning/workflow changes: `requestedBatches` stores all33remaining cardinal-number, generic X-things and numbered-date IDs in one ordered batch10; `prepare.py` preserves that owner-selected group before regrouping later pending cards. `validate.py` enforces its exact membership/order and limits the33-card exception to that request; the default25-card policy continues elsewhere. Regression coverage checks complete numerical scope, all445stable IDs exactly once, unchanged membership of reviewed batches01–09 and later feedback gates. The resulting batch10 is ready-to-generate, with all subsequent batches blocked.

Only planning/configuration and workflow metadata were copied from the live root. No batch10 PNGs, manifest, generation results, activation records or checkpoint metadata were copied. All135active records, selected approved batch09pixels and runtime mappings remain unchanged. The numerical candidates remain a separate generation/review step after the approved batch09PR was pushed.

Preparation and validator passed (445prompts,all48findings,496-node acyclic graph,22batches,45exclusiongroups). Card tests pass15/15. Full `npm run check` passed on the final planning changes:143Vitest,121Node,12audio tests,lint/types and productionbuild. No browser rerun was necessary for this follow-up because no runtime code, mappings or image bytes changed; the six existing focused journeys and25productionPNGdecodes above still apply. `git diff --check` passed.
