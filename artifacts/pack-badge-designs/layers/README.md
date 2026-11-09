# Interchangeable pack badges — issue #181

The approved batch-01 and batch-02 illustrations supply the style. Batch-03 preserves the exact image-tool requests, full-resolution transparent PNG outputs and hashes for eight blank rank backgrounds and the suitcase emblem. No generated lettering is needed for a new pack or level.

`PackBadgeMedal` selects the illustrated rank background, using a flower-free center for suitcase packs. WK retains its decorative center flower. Pack metadata selects WK or the suitcase; exercise selects the restored illustrated picture or pencil artwork; source level supplies the curved ribbon text. `src/core/badge-art.ts` holds normalized placement coordinates. The Home award threshold remains Improving and reflects the current minimum across the pack.

Run `node scripts/preview/pack-badges.mjs` from the project root to regenerate the interactive review from the actual component. Open `/artifacts/pack-badge-designs/layers/index.html` on the Vite development server. The review provides all eight ranks, both families and formats, levels 1–5 and 10, plus Home-size previews on three backgrounds. It never changes learning state.

Delivery images are 384px lossless WebP with transparency; originals remain unchanged in `generated/batch-03` and `generated/batch-04`. Recreate each delivery with `cwebp -lossless -resize 384 0 INPUT.png -o OUTPUT.webp`. Manifest entries record both original and delivery hashes.

The owner-requested refinement is recorded in batch-04: seven blank centers without the flower, plus independent picture and pencil artwork derived from the approved samples. Original images and exact requests remain available for comparison. Normalized per-rank slots align the format icon and curved level text; native-aspect artwork is cropped using SVG viewBoxes, retaining the source pixels and transparency.

Verification: `npm run check` passed (44 Vitest files / 490 tests, 236 JavaScript script tests, 12 audio and 22 artwork preparation tests, metadata validation and production build). The review matrix was checked for all 24 combinations in Chromium and WebKit, including image loading, relative icon/label vertical placement and no horizontal overflow at 320px. Actual iPhone acceptance remains manual.

Latest alignment refinement: each rank now records the measured cream-face center, top edge, ribbon edge and flower bottom. Suitcases use equal proportional clearance above and below; WK is centered in the open area between its flower and ribbon, with consistent lettering size. Batch-05 adds the matching flower and flanking petals to Mastered WK; Travel uses the preserved empty-face artwork. An unsuitable flower extraction with a pale halo is retained as rejected provenance and is not shipped.

Mastered inset correction: the owner clarified that the cream face was too large. The earlier whole-composition scaling is removed. Batch-06 reduces the cream inset and extends the gold rim inward while preserving the original outer scale, crown, wings and ribbon. WK keeps the flower; Travel keeps an empty face. Both emblem slots are calibrated to the new face.

Current Mastered design: batch-07 is a fresh redraw using Strong and Confident as style/layout references. It replaces the previous Mastered geometry. Both families now use the standard ribbon overlay coordinates. Measured center-ribbon upper edge: Confident 59.38% canvas height, Strong 59.64%, both fresh Mastered bases 59.38%. The normal cream face is at about y20.8%..60%, matching the other ranks. Crown and compact wings surround that shared layout. `v6-redraw-*` screenshots compare both families and formats in Chromium and WebKit.
