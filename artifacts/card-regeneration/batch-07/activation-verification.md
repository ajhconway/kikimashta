# Batch 07 activation — issue #72

All 25 selected cards (61–85) are approved, including the matching Kiku under/on-chair pair. This change activates them in the app and vocabulary library, extending the existing 60 approved selections to 85. The source PNGs, full edit history, exact generation prompts and source hashes are retained. The new delivery images are 640 × 640 JPEGs totaling 1,830,483 bytes. These approved sources have opaque white backdrops; their pixels are preserved. Future generation keeps main's transparent-background, alpha-preserving PNG/WebP policy.

`node scripts/content/activate-approved-artwork.mjs batch-07` updates catalogue media paths, visual descriptions, activation provenance and optimized delivery files. `npm run content:library` rebuilds the library from those mappings. The legacy exporter retains PR #93's delivery identity/hash validation and atomic replacement behavior. Clean `imageDescription` values describe the depicted subjects without exposing review history in product text.

An explicit before/after comparison confirmed that only the 25 new image fields changed in the vocabulary banks. Stable IDs, readings, voices, review restrictions, practice eligibility and all unrelated content remain identical. The first 60 activation records remain unchanged. The source/delivery tests verify all 85 mappings, source and delivery hashes, library descriptions, and preservation through legacy SVG rebuilds.

Validation:

- `python3 scripts/cards/prepare.py` and `python3 scripts/cards/render_review.py` passed.
- `python3 scripts/cards/validate.py` passed: 445 prompts, all 48 review findings, 488-node acyclic graph, 22 feedback-gated batches and 45 exclusion groups.
- `python3 -m unittest discover -s scripts/cards -p 'test_*.py'` passed 12 tests, including main's transparency-policy regression and new Kiku/number-family checks.
- `npm run check` passed lint, TypeScript, 143 Vitest tests, 112 Node tests, 12 Python audio tests and the production build. The existing bundle-size advisory remains.
- `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/kikimashta-playwright node node_modules/@playwright/test/cli.js test e2e/vocabulary.spec.ts e2e/practice.spec.ts --grep 'browse provisional|correct feedback finishes|a miss waits' --workers=2` passed all six checks in Chromium and mobile WebKit, covering library browsing and correct/incorrect answer feedback.
- Installed Chrome decoded all 25 new production deliveries at 640 × 640 and verified all 25 source-gallery panels show approval. The approved contact sheet was refreshed.
- `git diff --check` passed.

The initial dependency link lacked the ElevenLabs package. Checks were rerun using the complete existing integration dependency cache; the successful results above use that cache. No paid audio requests occurred. Browser emulation is not a real iPhone check; device verification remains outstanding. No push, merge or deployment was performed by this worker. Batch 08 is ready for separate generation and review and is not activated here.
