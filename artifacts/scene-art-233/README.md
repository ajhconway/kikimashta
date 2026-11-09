# Scene and contrast artwork review (#233)

This batch covers all 43 cards categorized exactly `staged-picture` (“Picture with scene / contrast”) that lack published updated artwork in the frozen source-level 2–5 suitability review. The original category contains 67 cards; 24 already updated IDs are excluded. The original review records remain unchanged in `sources/suitability-review.json`; `plan.json` binds that file’s hash and records the exact selection and current picture concepts.

All 43 primary cards are ready for owner review: 39 selected images from this batch’s new illustrations, three exact approved-source reuses, and one shared image for 休み/休む. These are 42 unique selected images. The reused sources are 子犬 and 少ない from PR #110, plus the owner-requested Spanish Kiku-in-a-box illustration for 中, copied unchanged from the accepted `dentro de` artwork. Earlier source approval does not approve this batch or activate these Japanese cards.

Owner round 1 is complete for the 22 requested primary-card revisions, with a separate related Night proposal. It produced 36 new generated outputs: 12 directed revisions, 21 alternatives and three matching time-of-day images. Fifteen primary selections changed: the 12 directed revisions, the exact Kiku-inside reuse, and the sunrise/early-evening revisions. The seven cards with alternatives retain their previous version 1 selections until the owner chooses among A/B/C: 中央, 下がる, 上がる, 作る, 立てる, 止まる and 走行. The 21 unmentioned primary records remain unchanged.

The batch preserves all 44 initial generated versions and all 36 round 1 outputs: 80 generated PNG versions in total, including the related Night proposal. Exact prompts, references, original generator paths, source approvals and image hashes remain in the manifest and request records. Earlier candidates remain available as history.

Open [the complete gallery](index.html) for the 43 primary images, 21 visible A/B/C alternatives and a time-of-day comparison strip. The strip repeats the matching sunrise and early-evening proposals beside the new Night proposal, with the earlier approved Night image below as a reference: 68 displayed images in total. Alternatives and the related Night proposal do not add cards to the frozen 43-card selection. [Manifest](manifest.json) · [Initial exact requests](requests.json) · [Owner round 1 plan](owner-round-1-plan.json) · [Frozen plan](plan.json).

Rebuild the gallery from the repository root:

```sh
python3 scripts/content/build-scene-233-review.py
```

The builder validates the frozen review hash and exact 43-card scope, identity fields, safe portable image paths and image hashes before replacing the gallery. Alternative version records, A/B/C labels and current version 1 bindings are checked; 中’s source-kind change requires an explicit owner statement/date and matching selected path/hash binding. The related family section validates both the proposed and earlier approved Night files. Local image/source links remain inside this review folder; repository sources outside it link to GitHub at the frozen source revision, while historical source provenance retains its original commit.

Generation used the built-in `image_gen` tool. All selected, alternative, related and preserved-version file hashes have been verified, and all 36 new outputs were visually inspected. Chromium and mobile WebKit each decoded 68 images and verified 93 distinct local resources, 43 filterable cards, 21 options, four family images, source/search filters, unique IDs and no horizontal overflow. Mobile options and the family strip were also visually checked. The original scope/path/hash fixtures, 23 round 1 alternative/override/family rejection cases and all 27 existing artwork tests passed. Further native-browser, contact-sheet and transparency evidence is recorded in the manifest’s checks. Actual iPhone inspection was not performed for this review-only batch.

All selections await owner acceptance for this batch. Artwork preparation and browsing do not activate artwork, vocabulary, recordings or practice cards, and do not change eligibility or progress. Keep original variants and exact generation/source records when revising a selection.
