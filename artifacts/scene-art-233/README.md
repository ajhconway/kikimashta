# Scene and contrast artwork review (#233)

This batch covers all 43 cards categorized exactly `staged-picture` (“Picture with scene / contrast”) that lack published updated artwork in the frozen source-level 2–5 suitability review. The original category contains 67 cards; 24 already updated IDs are excluded. The original review records remain unchanged in `sources/suitability-review.json`; `plan.json` binds that file’s hash and records the exact selection and current picture concepts.

All 43 selected cards are ready for owner review: 40 newly illustrated subjects, two exact approved batch 11 reuses (子犬 and 少ない from PR #110), and one shared new illustration for 休み/休む. These are 42 unique selected images. No generation is pending. Earlier source approval remains evidence for the reused files and does not approve this new batch.

The batch preserves 44 generated PNG versions: 40 selected versions and four earlier unselected candidates. The selected corrections are 丸い version 2, 中 version 2 and 子牛 version 3. Exact prompts, references, original generator paths and image hashes remain in the manifest and requests; the two reused PNGs retain their original accepted bytes and source provenance. All 43 selected-image hashes and all 44 generated-version hashes have been verified against their saved files.

Open [the complete gallery](index.html) for selected images, full-size links, search/source filters, current concepts, original suitability recommendations and answer-choice constraints. [Manifest](manifest.json) · [Exact requests](requests.json) · [Frozen plan](plan.json).

Rebuild the gallery from the repository root:

```sh
python3 scripts/content/build-scene-233-review.py
```

The builder validates the frozen review hash and exact 43-card scope, identity fields, safe portable image paths and selected-image hashes before replacing the gallery. It supports pending placeholders during preparation; the completed gallery has 43 images and no pending placeholders. Local image/source links remain inside this review folder; repository sources outside it link to GitHub at the frozen source revision, while historical source provenance retains its original commit.

Generation used the built-in `image_gen` tool. Chromium and mobile WebKit each decoded all43 selected images, verified52 distinct local resources, source/search filters and no horizontal overflow. Native contact sheets were reviewed for all43 cards, including the exact five/ten counts and faded motion references. Sixteen builder rejection fixtures and all27 existing artwork tests passed. Full app checks and actual iPhone inspection were not repeated for this review-only batch.

All selections await owner acceptance for this batch. Artwork preparation and browsing do not activate artwork, vocabulary, recordings or practice cards, and do not change eligibility or progress. Keep original variants and exact generation/source records when revising a selection.
