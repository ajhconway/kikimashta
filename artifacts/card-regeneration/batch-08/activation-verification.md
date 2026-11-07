# Batch 08 activation — issue #72

The owner approved all 25 selected cards 86–110. This branch activates them in the app and vocabulary library, bringing the active approved total to 110. It is based on PR #97 head `26118f8`; the coordinator will create the new PR before merging #97 and then retarget the new PR to main.

All previous 85 activation asset records are exactly unchanged. Catalogue differences are only 25 image src/alt fields; stable IDs, audio, practice eligibility and review restrictions are preserved. Starter data is unchanged. The library changes only the corresponding image and concept descriptions; source visual records change only those descriptions. Product image descriptions name depicted subjects without production history.

All 25 new delivery files are 640×640 PNGs, totaling 7,364,810 bytes, preserving true alpha and opaque white subject details. Original approved PNGs and every variant, exact generation/edit prompt and source hash remain available. The older 85 JPEGs retain their paths and hashes. Source flag `transparentBackground` selects PNG; each new activation record identifies PNG format and preserved alpha. The existing legacy JPEG encoder remains available for historical opaque selections.

The activation exporter verifies source approval/hash and decodes alpha pixels before changing mappings. It validates generated PNG chunk CRCs, header/data ordering, final IEND, absence of trailing data, dimensions, transparent/opaque pixels and retained opaque-white pixels before atomically replacing the target. Verified recorded deliveries reuse existing bytes; stale/unrecorded/corrupt files regenerate through a temporary path. Decoding supports the 8-bit non-interlaced RGBA and grayscale-alpha PNGs used by the generation/delivery workflow. Node's zlib CRC API is supported by the required Node 24.15+ runtime.

Deterministic real two-by-two PNG regressions cover transparent/white/color pixels, PNG format selection/reuse, accidental flattening to opaque RGBA, JPEG output for transparent sources, lost opaque white details, missing IEND, invalid CRC, trailing bytes and opaque sources falsely marked transparent. Failures leave prior delivery bytes, mappings, activation provenance and temporary-directory cleanup intact. Existing legacy JPEG and stale/corrupt/encoder-failure regressions remain. The real-asset integration test verifies all 110 app/library mappings, every source/delivery hash and byte count, all 25 PNG alpha/dimensions, opaque-white retention, and durable legacy SVG rebuild behavior.

Validation on the final code:

- `npm run check` passed: lint, TypeScript, 143 Vitest tests, 120 Node tests, 12 Python audio tests, and production build. Existing large-bundle advisory remains.
- `python3 scripts/cards/prepare.py`, `render_review.py`, `validate.py` passed: 445 prompts, all 48 findings, acyclic 492-node graph, 22 feedback-gated batches and 45 exclusion groups.
- `python3 -m unittest discover -s scripts/cards -p 'test_*.py'` passed 13 tests.
- 18 focused exporter/approved-artwork tests passed, including corruption checks and real transparent asset validation.
- Six focused Chromium/mobile WebKit journeys passed: vocabulary library, correct-answer feedback, and incorrect-answer card motion.
- Installed Chrome independently decoded all 25 production PNGs at 640×640 and verified native canvas transparent/opaque pixels. Production review sheets at 145px over white, yellow, pink and lavender were captured and inspected; the files are preserved beside this record.
- Independent read-only review verified data preservation and reported one PNG corruption-validation gap; it was fixed with CRC/IEND regressions and re-reviewed successfully.
- `git diff --check` passed.

No push, PR creation, merge or deployment was performed by this worker. Actual iPhone verification remains for the owner; emulated mobile WebKit is supplemental.
