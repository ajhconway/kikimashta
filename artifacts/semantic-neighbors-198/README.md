# Japanese semantic neighbor comparison (#198)

Selected deployment candidate: **Japanese fastText with a compositional zero-vector fallback**. The selected generator is `scripts/content/semantic_neighbors.py`; its complete per-word rankings are in `content/semantic-neighbors/ja.json`. This report preserves the #198 experiment before runtime integration. Task #200 consumes a compact derivative with reviewed sense exceptions and picture exclusions; see `content/semantic-neighbors/README.md`. The measurements below retain their original inputs and validity filters.

Both models were actually run on the same 166 approved Japanese practice words at source revision `f1333b6d94e189efe3533c8ceb800596e4e95345`. All comparisons use exact cosine similarity. An independent reviewer defined the benchmark before inspecting any model output; its SHA-256 is `79aafd5fc6423a0b81910b4b42072c8dbf9ba4a019fd4a928ce085d6e4c1c1ce`.

`bank.json` freezes those original 166 inputs and their answer-filter metadata. Reproduction and review generation use that snapshot even as current practice expands. Runtime preparation in #200 additionally covers the newly approved writing-only cards; their inclusion does not rewrite these experimental measurements.

| Check | fastText, Japanese spelling | multilingual E5 base, word + meaning |
| --- | --- | --- |
| Semantic ordering triplets | 30 / 32 | 28 / 32 |
| Category triplets | 8 / 8 | 8 / 8 |
| Contrast triplets | 6 / 6 | 5 / 6 |
| Compound triplets | 11 / 12 | 9 / 12 |
| Intended-card-sense triplets | 5 / 6 | 6 / 6 |
| Macro-average across those four groups | 93.75% | 89.58% |
| Mean known-positive recall in top five, eight query sets | 62.5% | 56.25% |
| Queries finding at least one known positive in top five | 7 / 8 | 7 / 8 |
| Usable representations | 166 / 166 after fallback | 166 / 166 |
| Maximum vector difference on repeated CPU encoding | 0 | 0 |

The query positive sets are incomplete: other retrieved words can also be useful. Semantic, picture-filtered and writing-filtered query scores happen to match for these eight queries. They need not match for other queries. The benchmark contains clear negatives and is a small content sanity check, not a statistical model comparison or an assessment of learning difficulty.

## Inputs and compound handling

- fastText: `facebook/fasttext-ja-vectors`, revision `be286af953967df11e163522974fff118569f1fb`, 300 dimensions. Input is the exact Japanese surface spelling. There are 145 known whole-word entries and four nonzero subword representations. Seventeen short compounds have a zero raw vector; for these only, average the learned vectors of their two constituent kanji. The selected generator fails explicitly on any other unrepresentable word. This fallback was fixed after the coverage check and before evaluating rankings. Raw model SHA-256: `217faf8282042e912612da78cf0002ec4fcde716643ae093058f6274c80d93b3`.
- E5: `intfloat/multilingual-e5-base`, revision `d128750597153bb5987e10b1c3493a34e5a4502a`, 768 dimensions, CPU, batch size 16, maximum sequence length 128. Input is exactly `query: {Japanese text} — {existing English card meaning}`. The English meanings supply the card's intended sense without inventing new Japanese definitions. The model's native mean pooling and normalization are used. This tests the proposed complete approach; it does not isolate architecture from the additional meaning input, or establish results for Japanese definitions or other text models.

No model was trained or fine-tuned on the benchmark. Dependencies and literal inputs are recorded with each raw result. The comparison scripts and environment requirements are archived here for reproduction; they are not part of the deployment generator or browser import graph. No raw model weights are committed.

## Independent review and limitations

A reviewer compared 17 targets with model names concealed. Labels were consistent: A = E5, B = fastText. Preferences were fastText 9, E5 6, ties 2. The sample is exploratory and not an independent held-out score. fastText generally provided stronger category neighborhoods, while E5 supplied materially better intended-sense neighborhoods for 本 (book), 金 (gold) and 日光 (sunlight). This tradeoff is a known limitation of the selected static model, not a resolved sense-disambiguation problem.

Examples in the actual outputs:

- For 本, fastText's first five candidates are numerical/count expressions. E5 places ノート first. Treat the raw fastText ranking for this card as poor semantic guidance.
- For 金, fastText favors elemental/weekday-like kanji; E5 returns money, jewel and treasure.
- For 竹の子, fastText finds onion and food words; E5 includes baby and weak later matches.
- For 市, fastText finds town and village; E5's later matches include body and hand.

The selected method won the overall benchmark, known-positive retrieval and exploratory preference tally. It needs content inspection when integrated, especially for ambiguous single-kanji words. Ranking similarity is not calibrated learner difficulty.

Answer validity is separate from semantic quality. `review.html` applies current language/visible-choice/homophone/explicit picture exclusions. It marks potentially unsafe pairs from the separately staged `content/card-regeneration/semantic-exclusions.json` as orange diagnostics; this experiment does not activate that deferred #79 policy. Examples include cow/calf, shaved ice/ice and above/on-the-table. A future integration must retain ordinary validity checks and selected-pack scope, preserve question/retry snapshots, and use the existing mastery levels to select the desired mixture of semantic and pronunciation neighbors.

## Review and reproduction

Open `review.html` to search every target and compare picture/writing candidate lists. `metrics.json` contains every failed triplet and query result; `summary.json` contains the compact measurements. `fasttext-results.json` and `e5-results.json` preserve both measured cosine matrices solely as experiment evidence.

Regenerate the selected candidate in a separate Python 3.13 environment:

```sh
python3.13 -m venv /tmp/kikimashta-semantic-env
/tmp/kikimashta-semantic-env/bin/python -m pip install -r scripts/content/semantic-neighbors-requirements.txt
/tmp/kikimashta-semantic-env/bin/python scripts/content/semantic_neighbors.py
```

The pinned model download is about 7.25 GB. `--model-file PATH` accepts a local copy after checksum verification; `--offline` requires the pinned model already in the Hugging Face cache. macOS source builds of fastText may need `CPATH` pointing at the SDK's `usr/include/c++/v1` directory. Model packages are optional for ordinary app checks.

Regenerate the comparison review from saved results with `node scripts/content/review-semantic-neighbors.mjs`. To rerun inference, install `experiment-requirements.txt`, use `HF_HOME` to choose an external model cache, then run `python artifacts/semantic-neighbors-198/experiment.py fasttext --download` and the equivalent `e5 --download` command. Omit `--download` to require the models already cached locally. Preserve the frozen benchmark when comparing new inputs or models; record those as new experiments.

Model references: [fastText Japanese vectors](https://huggingface.co/facebook/fasttext-ja-vectors) (model license CC BY-SA 3.0), [multilingual E5 base](https://huggingface.co/intfloat/multilingual-e5-base) (MIT). Preserve attribution with generated content. The respective model cards describe their training and usage.

## Verification

- `npm run check` passed: lint, 448 Vitest/React tests, 263 Node tests, content Python checks, 22 card Python tests, metadata validation, TypeScript and production build. After adding three focused representation regressions, `npm run test:audio` passed all 18 content Python tests.
- The selected generator ran twice against the pinned local model. Both outputs were byte-identical, SHA-256 `5202908320533e9a20e9d77b7afa90d09131f58c23cb92146cdb7b67f3a0b6d4`.
- Chromium and phone-width WebKit loaded the standalone report with all 166 targets, filtered by search, switched answer format and reported no page errors. This is report verification, not real-iPhone app acceptance.
- An independent read-only reviewer reproduced benchmark scores, checked input parity, validated every generated ranking against the measured matrix, and found no blocking correctness issue. The full app browser suite remains part of PR CI; no existing app behavior changed in this experiment.
