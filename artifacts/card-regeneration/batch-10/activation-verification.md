# Batch10 activation — issue #72

The owner approved all33new numerical cards136–168 and five earlier-card replacements83–87. This branch starts from main `3a7e01db0eaf98e75490018760ca0e99b9aa273f` (merged PR #102) and copies the frozen `/private/tmp/kikimashta-batch10-approved-source` snapshot. The resulting app and review library use168unique approved illustrations. No batch11artwork is included; its own generation/review gate remains separate.

The130other prior activation records are exactly unchanged. The five replacements are promoted to versioned sibling PNGs in their original batch07/08 manifests, with prior selections retained in history. Batch10 keeps its approved reference-revision archive, all exact prompts, SVG circle templates used as image-tool inputs, and rejected candidates. The clean earlier green6 PNG remains selected; rejected SVG-guided6 alpha failures are historical only. No approved source pixels were changed during integration.

The catalogue has38image source/alt updates. StableIDs, Japanese text, readings, audio, eligibility, contextual restrictions and exclusions remain unchanged. The starter bank is unchanged. Library image/concept fields and source visual descriptions reflect the approved subjects, and content rebuilds retain the selected raster deliveries. Current galleries state approval and include43family panels and152source alpha previews.

The38new/replacement deliveries are transparent640×640PNGs totaling12,122,638bytes. Older deliveries remain available. Native Chrome independently decoded all38with real transparent and opaque pixels;18contain opaque white details. Four production sheets at145px on white, yellow, pink and lavender are saved alongside `production-alpha-inspection.json`. The lavender sheet was visually inspected for correct family colors, readable labels, white patches/calendar paper and clean transparency. Existing PNG corruption/CRC/IEND/white-region validation remains unchanged.

Validation:

- `npm run check` passed: lint, TypeScript,163Vitest tests,128Node tests,12Python audio tests and production build. The existing bundle-size advisory remains.
- `node --test scripts/content/activate-approved-artwork.test.mjs scripts/content/approved-artwork.test.mjs` passed21tests. New coverage verifies replacing an existing ID without duplication or losing prior deliveries, and the five promoted sources/hashes/history/unique activation mappings. Existing real-asset checks verify all168active source/delivery hashes, alpha and app/library/rebuild mappings.
- `python3 scripts/cards/prepare.py`, `render_review.py`, `validate.py` passed:445prompts,all48findings,496-node acyclic graph,22feedback-gated batches and45exclusion groups.
- `python3 -m unittest discover -s scripts/cards -p 'test_*.py'` passed18tests, including approved reference-revision integrity checks.
- `python3 artifacts/card-regeneration/batch-10/build_review.py` rendered43family panels and152alpha previews, including all five approved reference revisions.
- Six existing Chromium/mobile WebKit journeys passed: vocabulary browsing, correct-feedback progression and incorrect-answer card motion.
- Native Chrome inspection passed for all38productionPNGs. Four145pxbackground sheets were captured.
- Independent read-only review confirmed approved sources/history,168mappings,130unchanged records, context/eligibility/exclusion preservation and focused tests.
- `git diff --check` passed. Display-only gallery trailing whitespace is removed by the renderer; exact manifest prompts are preserved.

This worker did not push, create a PR, merge or deploy. Actual iPhone verification remains separate; mobile WebKit emulation supplements device testing. Artwork approval does not clear contextual teaching restrictions or the older basketball seam follow-up.
