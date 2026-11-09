# Japanese word neighbors

Runtime integration is tracked in #200. The selected semantic method is Japanese fastText, evaluated in #198/#199. The current table covers all 178 approved Japanese words, including the 12 writing-only words admitted in #197/#201. The original 166-word model comparison is frozen separately. Ordinary Japanese word-picture and word-writing questions use the current card's existing FSRS mastery. Contextual answers remain authored, and unprepared languages/items keep ordinary selection.

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

## Adding packs and maintaining neighbors

When a pack adds words to the approved Japanese practice pool, regenerate both semantic and pronunciation neighbors across the **entire approved Japanese vocabulary**, including writing-only words. New words can become neighbors of existing words, so updating only the new words' rows is insufficient. Use the same pinned pretrained fastText model; regeneration does not train or fine-tune it. This is a manual, offline content-preparation step before release, not work performed in the browser or automatically by CI.

1. Update the approved bank/admission sources and confirm `japaneseSemanticBank` in `scripts/content/semantic-neighbor-utils.mjs` matches the app's expanded pool. Draft/catalog-only entries are not admitted just to generate neighbors. Preserve stable item IDs and picture/writing eligibility.
2. Run the semantic generator from the repository root to replace `content/semantic-neighbors/ja.json` with full rankings for the expanded bank. Use a separate Python environment with `scripts/content/semantic-neighbors-requirements.txt`; Python 3.13 was used for the original preparation:

   ```sh
   python3.13 -m venv /tmp/kikimashta-word-neighbors-env
   /tmp/kikimashta-word-neighbors-env/bin/python -m pip install -r scripts/content/semantic-neighbors-requirements.txt
   /tmp/kikimashta-word-neighbors-env/bin/python scripts/content/semantic_neighbors.py
   ```

   The generator downloads the pinned model on first use and verifies its SHA-256. Add `--offline` to require an already cached model, or use `--model-file /path/to/model.bin` for a local copy (also hash-verified). Model files and Python environments stay outside Git and the browser bundle. If a word has no supported representation, resolve the generator error explicitly before release.
3. Review new words' neighbors and changed shortlists for existing words. Check intended senses, close pronunciation contrasts, normalized homophones, and picture ambiguity across packs as well as within the new pack. Update bounded sense overrides, exclusion reasons and reviewed-image hashes in `ja-policy.json` where needed. Existing sense overrides replace their entire semantic row, so review whether new words belong in those rows too.
4. Run `npm run content:neighbors` to rebuild `ja-runtime.json`. This also recomputes pronunciation neighbors for every approved word from its reading, using the mora-distance metric above; it needs no embedding model or speech generation. Commit the regenerated source/runtime data and any reviewed policy changes with the pack release. Preserve the frozen #198 comparison rather than rewriting it with the expanded bank.
5. Run `npm run check` and the relevant pack, distractor and Dev review browser journeys. Inspect both picture and writing choices at semantic and pronunciation mastery levels, with the new pack alone and combined with existing packs. Use Dev review's source borders to inspect actual fallbacks, and complete the release's real-iPhone listening/touch checks.

For smaller changes, use the following rules:

| Change | Required preparation |
| --- | --- |
| Approved vocabulary membership, item ID, Japanese spelling or meaning/label changes | Regenerate `ja.json`, review affected choices and rebuild `ja-runtime.json`. |
| Reading-only correction | Rebuild `ja-runtime.json` and review affected pronunciation neighbors; semantic generation is unnecessary if spelling and other semantic inputs are unchanged. |
| Sense override or picture exclusion changes | Review the policy/evidence and rebuild `ja-runtime.json`. Re-review an excluded picture if its image changes before updating its recorded hash. |
| Learner changes selected packs, or a pack only groups already covered words | No model regeneration is needed; runtime selection filters the prepared rankings to the selected scope and format. Check pack scope when changing pack definitions. |

`npm run content:neighbors:check` (included in `npm run check` and CI) rejects mismatched semantic-bank inputs, changed reviewed images and stale runtime output, including pronunciation changes. It validates prepared data; it neither regenerates it nor judges semantic or picture quality. Running only `npm run content:neighbors` cannot repair stale semantic source rankings after adding words.

This workflow currently covers Japanese word cards. Other languages need their own prepared neighbor data before receiving these policies. Contextual questions retain authored choices.

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

Verified after integrating #201: `npm run check` passed 517 Vitest/React tests, 270 Node tests, 18 content Python tests, 27 card Python tests, runtime-neighbor validation, lint, TypeScript and the production build. `E2E_PORT=4281 npm run test:e2e -- e2e/distractors.spec.ts e2e/dev-review.spec.ts e2e/practice.spec.ts e2e/contextual.spec.ts e2e/contextual-pack1.spec.ts` passed all 54 Chromium/mobile-WebKit journeys. Independent review verified 178-word app parity, 166 picture/178 writing admission, exact preservation of the original 166-word cosine submatrix and no remaining blocking findings.

The semantic model is Facebook Research's [Japanese fastText vectors](https://huggingface.co/facebook/fasttext-ja-vectors), revision `be286af953967df11e163522974fff118569f1fb`, distributed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Rankings are adapted with intended-sense exceptions; model attribution is retained in `NOTICE` and public credits.
