# Spanish Travel level 5: Art, music and culture (#243)

The owner approved the revised 36-word vocabulary list and authorized its first artwork round. [The original proposal](proposal-v1.json) is preserved as superseded history. [The current draft](draft.json) and [generation authorization](generation-approval.json) record the revised scope, including six useful verbs: bailar, cantar, tocar, escuchar, pintar and dibujar. All 36 Spanish entries are new; none repeats a prior Travel item. Keep Latin American Spanish, English UI and picture practice.

Artwork generation uses the built-in image tool. [Reuse evidence](../../artifacts/spanish-travel-5-art/reuse-review.json) records two visually inspected approved Japanese pictures: libro and paleta. The palette retains its accepted legacy white-backed JPG unchanged; the book is transparent. The other 34 pictures are new. Kiku action scenes teach the verbs; tocar specifically means playing a musical instrument. Full scenes distinguish cultural venues/events from isolated objects.

Preserve every original under `artifacts/spanish-travel-5-art/originals/`, every exact [prompt/reference hash](../../artifacts/spanish-travel-5-art/requests.json), and matching tool records under `records/`. No existing production media or item mappings are replaced. Rebuild the complete searchable [artwork review](../../artifacts/spanish-travel-5-art/review.html) with:

```sh
python3 scripts/content/build-spanish-travel-level-5-art-review.py --complete
```

The renderer verifies draft/authorization bindings, original and reference hashes, PNG integrity and genuine alpha before writing the selection, manifest and galleries. Preserve native source proportions, including wide scenes; thumbnails fit within 145px. Focused parser/provenance regressions run through `npm run test:audio` as part of `npm run check`.

Finish the whole artwork set before consolidated owner feedback. Artwork acceptance, audio authorization/listening acceptance and shipping authorization remain separate. No audio generation or runtime activation is authorized at this stage. Later activation must audit full-pool picture ambiguity (venue/event/objects and action components), regenerate the expanded Spanish neighbor pool under the current policy, and preserve existing progress and frozen experiments. Owner real-iPhone acceptance follows deployment; waiting for publication is not required after a checked merge.

## Complete first artwork round

All 34 new illustrations and two unchanged reuses are ready for consolidated owner feedback in the gallery. The current manifest binds all 36 pictures to their source hashes; every generated original retains real alpha. [Verification](artwork-verification.json) records the passing full check rerun and [targeted browser evidence](browser-verification.json). The first check run had two existing app-test timeouts; the rerun passed without code or timeout changes. An independent content/provenance review found no blockers. Full app browser journeys were not rerun for this artwork-only draft. Final artwork approval remains pending.
