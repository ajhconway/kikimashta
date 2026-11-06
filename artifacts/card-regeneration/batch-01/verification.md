# Batch 01 verification

Issue: [#72](https://github.com/ajhconway/kikimashta/issues/72). Date: 2026-11-06. Status: awaiting user feedback.

Commands and results:

- `python3 scripts/cards/prepare.py`: prepared 445 prompts, 477 dependency nodes and 45 provisional batches.
- `python3 scripts/cards/render_review.py`: built the readable graph and local review gallery; recorded actual PNG dimensions, bytes and SHA-256 hashes.
- `python3 -m unittest discover -s scripts/cards -p 'test_*.py'`: five tests passed, covering negative dependency prose, runner reuse, shape families, teacher reuse and role-specific mountain constraints.
- `python3 scripts/cards/validate.py`: passed coverage of all 445 IDs and 48 findings, effective source overrides and teaching notes, preserved restrictions, acyclic graph, batch coverage/feedback gates, 45 semantic exclusion groups and saved image integrity.
- `git diff --check`: passed.
- Playwright driving installed Chrome: all 20 gallery images loaded, ten primary panels present, small previews rendered at 145×145px, and no page overflow at 390px. Saved `contact-sheet.png` from the rendered gallery.

The bundled Playwright Chromium and WebKit executables are absent; their launch attempt did not run browser checks. The installed Chrome fallback passed the gallery checks above. This checkout has no app scaffold, so app lint, type checks, unit suite and production build were not run. Real iPhone checks remain unavailable.

The coordinator and an independent read-only reviewer inspected all ten selected images. The hand has five digits, the glass has no handle, the rice is uncooked and the selected mountain has no eruption. The first mountain draft was rejected because a grouped finding introduced volcano instructions; role-specific prompt constraints fixed that leak before regeneration.

Initial style observations: slight shading remains despite flat-fill instructions; cow and mountain have tight side margins; person is relatively tall in its canvas. These were observations from the initial review, not additional requested changes. These assets have not been activated in the app.

## User feedback round 1

The user approved 01, 03, 04, 05, 06 and 07; their image paths and hashes remain unchanged. Cards 02, 08, 09 and 10 were edited with the built-in image tool and saved as `*-v2.png`. Original PNGs and their exact prompt/hash records are retained in `previousVersions` in the manifest. The revised images await feedback.

- 02: orange basketball with recognizable purple seams.
- 08: purple mountain slopes with white snow caps on both peaks.
- 09: much smaller slender grains and light detail in place of large peanut-like outlined kernels.
- 10: slightly angular stone with broad natural planes, sparse speckles and two short cracks.

`user-feedback.json` records the requests, corrected scene concepts and shared guidance; preparation applies them to dependent prompts and preserves per-card approval/reference status. The validator now checks feedback retention, shared guidance propagation, source-image hashes and approval preservation.

Re-ran preparation, gallery rendering, content validation and all five regression tests successfully. Installed Chrome verified 24 loaded images, ten main cards, four revised-card panels, six visible approvals, 145px quiz previews and no overflow at 390px. Updated `contact-sheet.png` and saved `revisions-round-1.png`. No later batch was generated.

## User feedback round 2

The user approved 08 and 10, bringing the approved count to eight. Their selected v2 files remain unchanged. Cards 02 and 09 were edited with the built-in image tool and saved as `02-ball-v3.png` and `09-rice-v3.png`.

- 02 has tilted, diagonally wrapping seams with offset intersections and unequal panels, replacing the frontal mirrored layout.
- 09 has an intermediate kernel size, using v2 as the edit target and v1 only as a grain-size comparison. Grains are larger than v2 and slimmer/smaller than v1, retaining light detail.

Both updated prompts and reference roles are saved in `revision-round-2.json` and the manifest. Earlier versions and their hashes remain in history; shared prompts carry the revised perspective and grain scale. Preparation, rendering, content validation, five regression tests and `git diff --check` passed. Installed Chrome verified 22 loaded images, two revised panels, eight visible approvals, correct card numbers, 145px previews and no overflow at 390px. Saved `revisions-round-2.png` and refreshed the full contact sheet. No later batch was generated.

## User feedback round 3

The user approved rice v3. Nine cards are now approved. The basketball's incorrect interior seam junction was replaced using a real NBA Store product photograph as a seam-geometry reference, retaining the orange fill and purple cartoon treatment. Selected output: `02-ball-v4.png`, awaiting review. The photograph is a reference only, with provenance recorded in `references/sources.json`; it is not runtime card media.

Exact prompt and input roles are in `revision-round-3.json` and the manifest. Earlier versions are retained. Preparation, gallery rendering, and content validation passed, including original image hashes, nine preserved approvals, shared feedback propagation and the existing dependency checks. No later batch was generated.

## User feedback round 4

The user preferred the tilted v3 angle and wanted a visible meeting of the seams. V5 uses v3 as the edit target and v2 as a seam-arrangement reference, restoring the visible off-center crossing while separating the extra bowed curves. The nine approved cards remain unchanged. Exact prompt, input roles and selected path are recorded in `revision-round-4.json` and the manifest. Preparation, rendering, content validation and `git diff --check` passed; later batches remain blocked. V5 awaits user feedback.

## Acceptance for batch 02

The user rejected v5, selected the prior v4 basketball for now, explicitly requested that the improvement note remain, and authorized batch 02. The manifest now selects the original `02-ball-v4.png` with its original prompt/hash; v5 remains in history. The basketball is marked `acceptedWithKnownIssue` with a durable seam/angle follow-up. The batch's `approved` workflow state records permission to proceed, not an unqualified quality judgment. The other nine selected cards are unchanged. The gallery labels the basketball “Accepted · needs improvement.”
