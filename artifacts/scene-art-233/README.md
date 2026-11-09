# Scene and contrast artwork review (#233)

This batch covers all 43 cards categorized exactly `staged-picture` (“Picture with scene / contrast”) that lack published updated artwork in the frozen source-level 2–5 suitability review. The original category contains 67 cards; 24 already updated IDs are excluded. The original review records remain unchanged in `sources/suitability-review.json`; `plan.json` binds that file’s hash and records the exact selection and current picture concepts.

All 43 primary images are available: 39 selected images from this batch’s new illustrations, three exact approved-source reuses, and one shared image for 休み/休む. These are 42 unique selected images. The reused sources are 子犬 and 少ない from PR #110, plus the owner-requested Spanish Kiku-in-a-box illustration for 中, copied unchanged from the accepted `dentro de` artwork. Earlier source approval does not approve this batch or activate these Japanese cards.

Owner round 1 produced 36 generated outputs for the 22 requested primary-card revisions and a related Night proposal: 12 directed revisions, 21 alternatives and three matching time-of-day images. Its earlier alternatives and all initial images remain preserved as history.

Owner round 2 is complete: eight new directed revisions and nine new alternatives. The owner explicitly selected original 中央 version 1 and the elevator alternatives for 下がる/上がる version 2; their `ownerChoice` records bind those exact versions, paths and hashes. The other 40 current versions await review. The three active A/B/C sets are 近い versions 3/4/5 (comparison version 2), 作る versions 5/6/7 (comparison version 1), and 走行 versions 5/6/7 (comparison version 1). 立てる and 止まる now show their new version 5 derivatives; their earlier options remain in history. The 29 primary records unmentioned in round 2 are unchanged, and the related Night proposal is unchanged.

The batch preserves 97 generated PNG versions: all 44 initial versions, all 36 round 1 outputs and all 17 round 2 outputs. Exact prompts, references, original generator paths, source approvals and image hashes remain in the manifest and request records.

Open [the complete gallery](index.html) for the 43 primary images, nine visible A/B/C alternatives and a time-of-day comparison strip. The strip repeats the matching sunrise and revised early-evening proposals beside the related Night proposal, with the earlier approved Night image below as a reference: 56 displayed images in total. Alternatives and the related Night proposal do not add cards to the frozen 43-card selection. [Manifest](manifest.json) · [Initial exact requests](requests.json) · [Owner round 1 plan](owner-round-1-plan.json) · [Owner round 2 plan](owner-round-2-plan.json) · [Frozen plan](plan.json).

Rebuild the gallery from the repository root:

```sh
python3 scripts/content/build-scene-233-review.py
```

The builder validates the frozen review hash and exact 43-card scope, identity fields, safe portable image paths and image hashes before replacing the gallery. Active A/B/C records must retain their exact comparison-version binding and consistent feedback round. Owner choices require a matching selected version record, path, hash and explicit statement/date; they remain distinct from batch artwork approval. 中’s source-kind change requires its own owner-bound path/hash evidence. The related family section validates both the proposed and earlier approved Night files. Local image/source links remain inside this review folder; repository sources outside it link to GitHub at the frozen source revision, while historical source provenance retains its original commit.

Generation used the built-in `image_gen` tool. All 97 generated outputs retain verified source/version/reference hashes; all 17 round 2 images were visually checked individually and in a contact sheet. Chromium and mobile WebKit each decoded 56 images and verified 115 distinct local resources, 43 filterable cards, nine options, four family images, source/search filters, three exact owner-choice cards, unique IDs and no horizontal overflow. Mobile 近い alternatives and the family strip were visually checked. All 27 existing artwork tests and seven persisted builder regression tests passed. Earlier scope/path/hash and round 1 rejection fixtures remain recorded; further native-browser and transparency evidence is in the manifest’s checks. Actual iPhone inspection was not performed for this review-only batch.

The three explicit owner choices are marked separately from the 40 versions awaiting review. Batch release acceptance remains separate. Artwork preparation and browsing do not activate artwork, vocabulary, recordings or practice cards, and do not change eligibility or progress. Keep original variants and exact generation/source records when revising a selection.
