Current status: review is complete with15 approved illustrations, nine deferred replacements and removed Form170. See [activation verification](activation-verification.md) for the integrated result. The generation-time findings below are retained as historical evidence.

# Batch 11 verification — issue #72

Cards 169–193 are 25 new independently generated illustrations. They await user feedback; none is activated or published. Batch 12 and later remain blocked. The approved numerical batch was first pushed in PR #104, merged as d91ec873f4dc39742f5138ee7fdedaad7b5f1dfe after successful Checks and review, and verified live before this batch was handed over. Source credits identify that revision, and all 38 new/replacement published PNG hashes match the approved deliveries.

The cat PNG supplies the illustration style; Center191 uses the approved Kiku character. Approved cubes38, square61, triangle60, question mark122, person3, dog12, turn arrows125 and money91 supply only their stated object roles. No pending card is used as an approved downstream reference. Shared cube scenes depend on approved38; clock182/183 and iris176/193 share explicit prompt conventions and are generated independently. Kiku Center follows the user’s generic spatial-referent and attention-line convention. These three design families appear in the acyclic499-node graph.

All445stable IDs,48review findings,45semantic exclusion groups and original eligibility/context restrictions remain. Eye/Eyeball remain excluded as unfair competitors; Now/AtOnce and the abstract mnemonic cards retain their teaching restrictions. New silhouettes and visual differences do not make a restricted item picture-only eligible. Existing approved batch memberships and the numerical33-card exception remain fixed; this batch returns to the usual25.

Exact original/canonical prompts, reference roles and outputs are in compositions.json and generation-requests.json. Each built-in imagegen output was copied unchanged into the workspace; source paths, hashes, dimensions and byte counts are in generation-results.json. Initial Form170 was panoramic, so a built-in edit restored a square canvas. Built-in cleanup reduced exterior alpha residue on175/181/183. Their source variants, exact prompts, source paths and hashes remain in manifest previousVersions and the correction request/result files. No raster editing scripts were used. Review screenshots are browser renders of the original PNGs.

Passed:

- python3 scripts/cards/prepare.py:445prompts,499graphnodes,22feedback-gated batches.
- python3 scripts/cards/render_review.py and python3 artifacts/card-regeneration/batch-11/build_review.py: main review, exact prompt details and100four-background previews.
- python3 scripts/cards/validate.py: all IDs, findings, restrictions, dependencies, batch coverage, selected/history hashes and promoted earlier revisions.
- python3 -m unittest discover -s scripts/cards -p 'test_*.py':18tests.
- Native Chrome decoded all25selected images and100previews. Selected images are square1254pxPNGs with transparent corners and opaque subject pixels. Seven required white details—paper, sclera, clock faces, clouds and checkmarks—remain opaque. Thin outline and letterform antialiasing is inspected visually rather than assigned an arbitrary opaque-area threshold. The390pxgallery fits without overflow.
- Contact sheet,145pxquiz sheet and white/yellow/pink/lavender alpha sheets were captured. Full contact and lavender sheets were visually inspected for subjects, exact symbol/count requirements, retained white regions and quiz-size legibility.
- git diff --check.

App lint/type/test/build and browser-journey checks were completed for the published numerical activation separately; no new app code or audio changes are part of this staged batch. Real iPhone testing is not claimed.


## Feedback round1

Recorded12approvals,9deferred replacements,1vocabulary removal and3requested artwork revisions. New generated PNGs use closed cloches for175, younger puppy proportions without a paw print for179, and the approved Many69jar with three counters for184. Exact requests/source outputs/hashes are retained in feedback-round1-requests/results.json; old selections remain in previousVersions. A shared Many/Few jar family records the approved source in the now500-node acyclic graph.

Disposition support preserves all445historical records and original findings/context, disables removed/deferred cards for picture-only practice, validates disjoint owner decisions, labels galleries correctly and keeps batch12blocked.24cardtests and the validator passed. Native Chrome verified12approved/9replace-later/1removed/3revised captions, only175/179/184in the revision sheet,25square PNGs,100four-background previews, eight required white-detail regions and390pxlayout. Revised sheet and lavender previews were visually inspected. No revised batch11artwork is activated. The standalone vocabulary-removal change is PR #106.


Vocabulary removal published: PR #106 merged as be433c8939a84b2db05b74892d9b73deec2a2808. PR Checks42447621545, automated review, main Checks42447951220 and Publish v0 run42448228771 succeeded. Live source credits identify that revision; Form170is absent and all440remaining library entries match the tested build exactly. Evidence: vocabulary-removal-publication.json. Review-gallery text wrapping was corrected and the final390pxcheck passed.
