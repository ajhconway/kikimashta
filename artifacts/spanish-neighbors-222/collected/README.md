# Partial owner review (#222)

The owner supplied the exact exported responses and reported stopping because the pronunciation trials were repetitive. All 12 semantic trials and 19 of 28 pronunciation trials were answered. The remaining nine stay unanswered; no repeat completion is required. The original export is preserved byte-for-byte in `owner-responses.json`, alongside its exact report/key and scored output. `provenance.json` binds those bytes, the reviewed source revision, frozen experiment files and all 1,431 media deliveries.

The parent `metrics.json` retains its original pre-collection `pending-human-review` status as frozen experiment evidence. Actual collected preferences live here, without rewriting the report or resetting browser responses.

## Results

| Review | Method preferences | Other responses |
| --- | --- | --- |
| Semantic, 12/12 | fastText 6; E5 3 | Tie 2; neither 1 |
| Pronunciation, 19/28 | Phoneme edit 7; letter edit 7 | Tie 5; unanswered 9 |

The semantic judgments support fastText as the leading candidate alongside the independent benchmark. They do not constitute approval of every neighbor or authorize activation. E5 was preferred for credit card, cargo truck and next to. Neither set was useful for tent; inspect phrase composition and candidate quality there before integration.

All 19 pronunciation judgments were marked as made after semantic viewing, with prior word exposure. None revealed its own trial pictures. Preserve and report those flags; do not describe these as spelling-concealed ratings. The pooled preferences show no pronunciation winner. One reviewer repeatedly hearing the same targets across regions is not 19 independent comparisons. Missingness is related to the repetitive protocol, so do not extrapolate the remaining votes or treat stopping as a tie.

## Semantic choices

| Target | Preference |
| --- | --- |
| tarjeta de crédito | e5 |
| estación de tren | fasttext |
| parada de autobús | fasttext |
| cepillo de dientes | fasttext |
| lentes de sol | fasttext |
| camión de carga | e5 |
| tienda de campaña | neither |
| banca | fasttext |
| limón | tie |
| pollo | tie |
| enchufe | fasttext |
| al lado de | e5 |

## Review burden and next step

The original protocol repeated seven distinct target/candidate-set comparisons across four voices, producing 28 trials. The submitted 19 responses already cover all seven distinct targets, so the uncompleted nine add regional repeats rather than new candidate sets. Voice-specific results remain in `scored-responses.json` but are too small and dependent for a regional conclusion.

For a future pronunciation comparison, use one primary trial per distinct candidate pair, with balanced voice assignment and other voices available optionally. Reserve extra regional trials for a concrete contrast such as ll/y or coda-s, and avoid required repeats of all pairs. Preserve this historical protocol, report and export unchanged; a revised protocol must have its own revision and must not remap these responses. No additional review is requested now.

Before selecting production pronunciation data, resolve the declared halla/haya canonical yeísmo failure and define Spanish eligibility/weighting. The current partial preferences do not establish that phoneme edit ranking improves on the letter control. Spanish practice remains unchanged.

Reproduce scoring against the unchanged frozen review (the archived report/key have identical bytes):

```sh
node scripts/content/score-spanish-neighbor-review.mjs artifacts/spanish-neighbors-222/collected/owner-responses.json
```
