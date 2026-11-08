# Complete Spanish travel artwork review (#150)

All 36 words are shown in `review.html` and `contact-sheet.html`: 31 newly generated transparent PNGs plus five unchanged previously approved JPGs. Entrance and exit are excluded. The owner explicitly requested completing the full pack without intermediate batch pauses; final artwork approval is pending.

`manifest.json` records the complete ordered set, exact prompts, built-in tool, style-reference hashes, original source paths, preserved output hashes and PNG pixel inspections. Batch directories retain the individual requests and originals. Reused artwork is copied unchanged into `reused/` for a self-contained review. No generated original was overwritten or removed.

Run a local static server from this directory to view the HTML. The compact overview is also saved as `contact-sheet.png` after browser verification. The detailed view includes the full images, four 145px background previews, and a selectable large-preview background.

Review literal meaning, visual consistency and recognition at 145px. Pay particular attention to airport/airplane, passport/ticket/map, bathroom/shower and hospital/pharmacy. Generic car and taxi overlap semantically; review their distractor pairing before activating practice (#79).

This is staged artwork only. Audio generation, semantic-choice changes and activating the expanded vocabulary remain separate work. New images are not yet approved for production.

## Verification

- `python3 -m unittest discover -s scripts/cards -p 'test_*.py'`: 22 tests passed.
- `python3 scripts/cards/validate.py`: passed (445 prompts, 48 findings, 496-node acyclic graph, 22 batches, 45 exclusion groups).
- All 31 copied PNGs match their original source bytes and SHA-256 records. The existing `inspectPngAlpha` decoder verified valid pixel data, square 1254px dimensions, transparent outer pixels and opaque subject pixels.
- Chromium decoded all 36 pictures, exposed all 31 prompts, rendered 144 previews at 145px, and verified the background selector. The saved contact sheet was visually reviewed.
- Mobile WebKit emulation decoded all 36 pictures and confirmed the detailed gallery fits a 390px viewport. This is browser emulation; real-iPhone testing remains deferred to deployment as requested.

The app's active vocabulary and audio are unchanged; app runtime checks are outside this artifact-only preparation.
