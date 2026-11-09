# Basic Spanish level 1 (#191)

The requested 24-entry Latin American Spanish foundation pack: eight actions, six descriptions, four spatial phrases, three needs and three time words. [Review the complete draft](review.html) or inspect [structured content](draft.json).

The owner chose short contextual questions for abstract words. Tener, querer, necesitar, ir, llevar, comprar, hoy, mañana and después therefore have nine authored foundation contexts, each with a sentence, question, translations, explanation and four explicit answer choices. Answers use approved Travel level 1 vocabulary and pictures, supporting both picture and text choices. The other 15 entries have picture concepts; six have visually inspected, hash-verified approved reuse candidates. Nine illustrations remain to prepare after picture-concept review.

Canonical adjective recordings use pequeño, frío, abierto and cerrado; feminine forms are taught in sentences and share item identity. Sueño means sleepiness in tener sueño, not a dream; mañana means tomorrow, not morning. Action, desire/need and possession senses are explicit. Eating/drinking pictures must remain distinct from hunger/thirst. Existing on/under-chair illustrations require transfer review when future questions describe a key and backpack.

Abstract words need a direct introduction and foundation question. Existing Japanese contextual scheduling requires prior word mastery; using it unchanged would leave these words inaccessible. `admissionPlan` records this required integration decision. This draft does not modify runtime types, eligibility, progress, active banks or preferences. Grammar scaffolding is introduced through examples; it is not a set of additional isolated picture cards.

All eight existing regional voices are retained. The potential recording matrix is 192 word clips plus 144 sentence/question clips (336 total). No new speech or pictures have been generated or approved by this draft. Actual contextual text needs owner approval before speech generation, following PLAN.md's contextual text/media gates. Integration and exact media acceptance follow that review; the pack is not active yet.

Rebuild and verify:

```sh
node scripts/content/build-spanish-basic-level-1-review.mjs
node --test scripts/content/build-spanish-basic-level-1-review.test.mjs
```
