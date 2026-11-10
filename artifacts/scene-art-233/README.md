# Scene and contrast artwork (#233)

The owner accepted the complete selected artwork and authorized shipment/auto-merge with “Great, let's ship these. Auto-merge.” The accepted release covers 44 Japanese IDs and 43 unique source images: the frozen 43-card scene/contrast batch plus the matching Night image. Each approval binds the exact selected version and image hash. The [release plan](release-plan.json), [artwork approvals](approvals.json) and separate release manifest record acceptance; the original suitability selection remains unchanged.

The frozen batch contains all 43 unupdated `staged-picture` (“Picture with scene / contrast”) cards from the source-level 2–5 review: 67 category cards minus 24 already updated IDs. Its selected sources are 39 generated illustrations, three exact approved-source reuses, and one shared image for 休み/休む, giving 42 unique primary images. The reuses are 子犬/少ない from PR #110 and the accepted Spanish Basic Kiku-in-box source for 中. The approved matching Night image remains outside the frozen 43-card suitability scope.

All 101 generated PNG versions are preserved: 44 initial versions, 36 round 1 outputs, 17 round 2 outputs, three round 3 outputs and one round 4 output. The final 立てる version 7 leans the rigid bear/base right, with the upward-left arrow indicating standing it upright. Earlier A/B/C concepts and all previous selections remain in version history; no active alternative sets remain. Five earlier exact owner choices are retained alongside the complete-set approval. Exact prompts, references, generator-source paths, original bytes and hashes remain in the manifest and request records.

Open [the approved artwork gallery](index.html) for 43 primary cards and the time-of-day family strip: 47 displayed images. The strip repeats the approved sunrise and early-evening selections beside approved Night, with the earlier Night illustration included as a reference. [Artwork manifest](manifest.json) · [All exact requests](requests.json) · [Frozen selection plan](plan.json) · [Round 4 request](owner-round-4-request.json) · [Round 4 result/source](owner-round-4-results.json).

Rebuild from the repository root:

```sh
python3 scripts/content/build-scene-233-review.py
python3 -m unittest discover -s scripts/content -p 'test_scene_233_review.py' -v
```

The builder validates the frozen scope, identities, source-kind overrides, safe portable paths and image hashes before replacing the gallery. Both primary artwork and related Night approvals require an explicit artwork-only statement/date and exact selected-version/hash binding to a unique version record. Earlier owner choices and alternative history remain distinct. The previous Night reference is separately hash-validated. Source links outside this review folder retain their recorded GitHub revision.

Generation used built-in `image_gen`. All 101 generator-source hashes and selected/version/reference hashes were verified during artwork preparation. The latest pre-release gallery checks in Chromium and mobile WebKit each decoded 47 images and verified 121 local resources, 43 cards, four family images, source/search filters, unique IDs and no horizontal overflow. The 27 artwork tests passed before release integration. All ten persisted gallery regression tests pass, including pending/approved Night support and rejection of stale, missing, duplicate, unsafe or tampered approval bindings. Earlier fixture/browser evidence remains in the manifest. Release activation and final application checks are recorded separately by the coordinator; actual iPhone acceptance remains in issue #6.

The accepted release preserves stable IDs, vocabulary eligibility, recordings and progress. Keep every earlier version and exact generation/source record when revising artwork.

Local release checks passed: `npm run check`, all120 Chromium/mobile-WebKit journeys and136 focused activation/source/production tests. All44 deliveries decode natively and retain accepted descriptions. [Release verification](release-verification.json) · [Invariant evidence](release-invariant-verification.json). Required current-head CI/review and deployment evidence are tracked in issue#233 and PR#236.
