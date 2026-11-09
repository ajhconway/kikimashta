# Japanese word neighbors

Runtime integration is tracked in #200. The selected semantic method is Japanese fastText, evaluated in #198/#199. Ordinary Japanese word-picture and word-writing questions use the current card's existing FSRS mastery. Contextual answers remain authored, and unprepared languages/items keep ordinary selection.

| Mastery | Requested alternatives |
| --- | --- |
| New / Learning | 3 broad |
| Improving | 1 semantic + 2 broad |
| Familiar | 2 semantic + 1 broad |
| Steady | 3 semantic |
| Strong | 2 semantic + 1 pronunciation |
| Confident | 1 semantic + 2 pronunciation |
| Mastered | 3 pronunciation |

The policy lives beside existing levels in `src/core/mastery.ts`. FSRS scheduling, grading, timer policy and progress identity do not change. Questions snapshot the requested and actual mixture and choices. Corrective retries retain that snapshot; subsequent scheduled reviews use the updated card mastery. Existing attempts save the exact ordered choice IDs as before.

## Data and preparation

- `ja.json` preserves full measured semantic rankings from the single selected model. The offline generator is `scripts/content/semantic_neighbors.py`; the experiment and both measured approaches are archived in `artifacts/semantic-neighbors-198/`.
- `ja-policy.json` supplies bounded replacement semantic rows for 本 (book), 金 (gold) and 日光 (sunlight), plus 14 reviewed picture ambiguity exclusions. Picture reviews bind the 25 involved images to source paths and SHA-256 hashes. Changes require updating the corresponding review evidence.
- `ja-runtime.json` is the compact browser input: indexed semantic rankings, pronunciation suggestions and exclusion pairs. It contains no model weights or embedding vectors. Only this table is imported by the app; the full measured rankings and experimental model dependencies stay outside the browser bundle.

Run `npm run content:neighbors` after changing the source rankings, overrides or reviewed exclusions. `npm run content:neighbors:check` verifies input identity, image hashes and deterministic runtime output; it is part of `npm run check`.

Pronunciation suggestions use the existing readings (or kana-only surface spellings). NFKC and katakana/hiragana normalization preserve voicing, small っ and long-vowel information. Small vowel/glide kana stay with their preceding kana in mora units. Similarity is `1 - editDistance / longerMoraCount`; candidates must score at least 0.5 and have distinct normalized readings. This is a spelling-based pronunciation proxy; it does not model pitch accent, recordings, or alternate long-vowel spellings such as コー/こう.

## Selection and fallback

Filter the selected language, packs, answer format and target validity before taking up to six nearest candidates from each source. Shuffle within these shortlists for variety. Broad choices prefer the remaining pool. Picture exclusions apply symmetrically between the target and alternatives and between alternatives; writing keeps distinct textual choices available. Homophones of the target and repeated visible choices are excluded.

Search complete compatible mixtures before reducing close-neighbor quotas. Preserve pronunciation quotas where possible, substitute semantic neighbors for missing sound neighbors, then use broad choices. A tiny scope can contain only close alternatives; if every easier mixture is impossible, use the available valid mixture and retain its actual counts. Never admit words outside the selected scope. Backtracking prevents one early candidate from hiding an available safer combination. If a lesson's known-word pool cannot provide four valid choices, retry against the full selected pool.

The three sense overrides replace the wrong-sense rows completely; they are not prefixes before old candidates. Narrow selected packs may therefore fall back to broad choices for those words. Other rankings remain model suggestions, not calibrated learner difficulty.

## Picture review

The targeted image audit retained relevant staged #79 exclusions and added above/on-the-table, below/under-the-bed, ice/shaved-ice, thread/wool-yarn, moon/crescent-moon and money/1000-yen exclusions. Current counting pictures depict cubes, so the historical staged apple/count groups were not copied. Raw fur and processed wool yarn remain available as distinct pictures.

This audit is targeted, not an assertion that every picture pair is unambiguous. Generic counting and equal quantities across number/counter expressions remain a separate content-domain issue in #79. No vocabulary, media or practice eligibility changes in this task.

## Verification and phone evaluation

Focused tests cover all eight mastery mixtures, scoped fallback and maximum available close-neighbor retention, pairwise picture ambiguity, format/language isolation, exact normalized homophones, changed later-review mastery and stable retries. Real-bank checks exercise each Japanese pack and all packs at New, Steady and Mastered. Browser journeys verify saved semantic choices and corrective snapshots through reload, plus actual New/Mastered Dev review alternatives without history writes.

For listening evaluation, open Dev review, choose ordinary word pictures or writing, select a mastery level and use Untimed to assess choices separately from the existing timers. Then try Follow mastery and check audio/touch interaction on the actual iPhone. Browser emulation does not complete that acceptance.

The semantic model is Facebook Research's [Japanese fastText vectors](https://huggingface.co/facebook/fasttext-ja-vectors), revision `be286af953967df11e163522974fff118569f1fb`, distributed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Rankings are adapted with intended-sense exceptions; model attribution is retained in `NOTICE` and public credits.
