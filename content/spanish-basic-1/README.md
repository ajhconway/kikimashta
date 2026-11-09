# Basic Spanish level 1 (#191)

The requested 24-entry Latin American Spanish foundation pack: eight actions, six descriptions, four spatial phrases, three needs and three time words. [Review pictures and all audio](media-review.html), [all pictures together](../../artifacts/spanish-basic-1-art/artwork.html), or the [approved authored draft](review.html). [Structured generation input](draft.json).

The owner chose short contextual questions for abstract words. Tener, querer, necesitar, ir, llevar, comprar, hoy, mañana and después therefore have nine authored foundation contexts, each with a sentence, question, translations, explanation and four explicit answer choices. Answers use approved Travel level 1 vocabulary and pictures, supporting both picture and text choices. The other 15 entries have picture concepts; six have visually inspected, hash-verified approved reuse candidates. All nine new illustrations have now been generated; the six approved sources are reused unchanged.

Canonical adjective recordings use pequeño, frío, abierto and cerrado; feminine forms are taught in sentences and share item identity. Sueño means sleepiness in tener sueño, not a dream; mañana means tomorrow, not morning. Action, desire/need and possession senses are explicit. Eating/drinking pictures must remain distinct from hunger/thirst. Spatial pictures consistently use Kiku: inside a low rectangular box, beside a chair, and the approved on/under-chair pair. The owner requested Kiku rather than a key/backpack for dentro de and al lado de. Future contexts using other objects still need transfer review.

Abstract words need a direct introduction and foundation question. Existing Japanese contextual scheduling requires prior word mastery; using it unchanged would leave these words inaccessible. `admissionPlan` records this required integration decision. This draft does not modify runtime types, eligibility, progress, active banks or preferences. Grammar scaffolding is introduced through examples; it is not a set of additional isolated picture cards.

All eight existing regional voices are retained. The potential recording matrix is 192 word clips plus 144 sentence/question clips (336 total). The owner approved the updated text and picture concepts and requested media generation. All 336 recordings and nine new illustrations are generated. The owner approved 14 pictures; sleepiness has a new larger pillow revision for review. Listening acceptance remains pending. The approved draft and generation authorization remain byte-for-byte preserved. Two word clips stay slightly quieter within processing limits (Carlos Figueroa / ir and Juan / hambre); all contextual clips meet target. All 336 clips passed native playback in Chromium and mobile WebKit. Integration and exact media acceptance follow review; the pack is not active yet.

Rebuild and verify:

```sh
node scripts/content/build-spanish-basic-level-1-review.mjs
node --test scripts/content/build-spanish-basic-level-1-review.test.mjs
```

Picture originals, exact prompts, reference hashes and per-image records are in `artifacts/spanish-basic-1-art/`; seven pictures have owner-requested revisions: thermometer-led cold/hot with a pile of ice and a fuller flame, a rectangular inside box, a next-to chair, and calmer needs in Kiku’s normal resting pose. All 21 generated versions are preserved; [revision history and selected prompts](../../artifacts/spanish-basic-1-art/revisions/history.json) record these changes separately from the approved text draft. Audio deliveries and normalization provenance are in `artifacts/spanish-basic-1-audio-review/`; private originals and processing evidence are hash-verified in `~/.local/share/kikimashta/spanish-audio/191-v1/` (2027 files). Rebuild the combined gallery with `node scripts/content/build-spanish-basic-level-1-media-review.mjs`.
