# Pronunciation distance comparison (#212)

Compare the deployed Japanese normalized mora edit distance with a controlled acoustically weighted edit distance. Production behavior is unchanged. This is an offline ranking experiment with an unfinished human listening review, not evidence of learning effectiveness.

## Initial measured results

| Frozen check | Baseline | Acoustic weights |
| --- | --- | --- |
| Correctness invariants | 8 ordered / 8 | 8 ordered / 8 |
| Exploratory ordering hypotheses | 10 ordered, 6 tied, 0 reversed | 14 ordered, 0 tied, 2 reversed |
| Supported approved readings | 178 / 178 | 178 / 178 |

The 24 checks were hand-authored and committed before weighted rankings were generated (`benchmark.json`, `benchmark-notes.md`). They include controlled probes and approved vocabulary; they are not independent human judgments. Ties do not count as strict ordering successes. The weighted model reverses E01 (かた: がた versus さた) and E05 (きゃく: きゅく versus さく). These are provisional hypotheses and may themselves disagree with listeners. Neither method models pitch accent.

Across the full writing pool, the six-candidate shortlist membership changes for **16 of 178 words**; across pictures, **14 of 166**. Both methods have the same candidate coverage by design: 142 writing targets and 124 picture targets have at least one eligible pronunciation neighbor. Both can form complete pronunciation-only trios within their shortlists for 84 writing and 73 picture targets. Other targets use the existing semantic/broad fallbacks in ordinary practice. `results.json` also reports each of the five levels independently in both formats.

The deterministic first-compatible-three illustrations change for 56 writing targets and 46 picture targets. **These are not estimates of changed deployed choices.** Production shuffles the six-candidate window before selection; this experiment uses ranked trios to expose differences for listening. Reordering the same six candidates alone would not change production's sampling distribution. Baseline ties cross the sixth-place boundary for 18 writing and 15 picture targets; ID-based tie-breaking here is only for reproducibility. Shortlist membership is the primary production-impact diagnostic. Adopting ranked selection would be a separate policy decision.

## Blind listening review

Open `review.html` through a local HTTP server that serves the repository and `/audio/` from `public/audio/`. For example, from the repository root:

```sh
npx vite --host 0.0.0.0 --port 4290 --strictPort
```

Then open <http://localhost:4290/artifacts/pronunciation-neighbors-212/review.html>. On a phone on the same network, substitute the computer's LAN address for `localhost`.

There are **12 paired trials**: six eligible predeclared targets, each in Otani and Morioki. Five of the original twelve targets lack a complete pronunciation-only trio and one has identical sets; all omissions and reasons remain in `results.json`. We did not replace omitted targets after looking at rankings. The trial set therefore underrepresents long-vowel/gemination cases; the synthetic probes exercise those technical distinctions but do not replace listening evidence.

Listen to the target and the two groups; choose which group sounds closer while remaining distinguishable. Use Tie, Neither or Uncertain where appropriate. Every clip within a trial uses the same assigned voice. A/B mappings reverse between voice passes for each target; fixed hash ordering separates repeated targets. Candidate order is canonical in both groups to avoid leaking model rank. Model names, scores and the decoding key are absent from the page. Avoid inspecting `blind-key.json`, `listening.json` or rankings before listening if you want to preserve blinding.

Words stay hidden until a response is chosen. Revealing them is recorded and those responses are reported separately. Answers save under an experiment-specific localStorage key tied to the bank, scoring sources, model tables and exact MP3 hashes. They never enter practice progress or account sync. Click **Export responses** to download actual judgments; unanswered trials stay null. No human preferences have been collected or committed. Browser tests use isolated synthetic responses solely to verify persistence/export and do not contribute results.

Analyze an export with:

```sh
node scripts/content/score-pronunciation-listening.mjs /path/to/pronunciation-neighbors-212-responses.json
```

This reports method preferences, ties, neither, uncertainty and missing answers, split by voice and revealed/unrevealed status. Two voices of the same word and repeated judgments from one reviewer are not independent participants. A small review supports qualitative comparison only; retain the baseline until actual judgments and failure cases justify a change.

## Fixed scoring design

- **Baseline:** frozen copy of `src/core/pronunciation.ts` from `fa1cfe382d2196f2e0efb8e515d9754f2dec5e99`. NFKC, katakana/hiragana normalization and kana mora segmentation; unit Levenshtein distance divided by the longer sequence length.
- **Acoustic candidate:** uses the same segmentation and unit insertion/deletion costs. For ordinary mora substitutions, subtract each source phoneme model's self-distance, clamp at zero, average consonant and vowel distances equally, then average both directions. Divide by the median cost across all unordered nonidentical ordinary-mora pairs in the upstream inventory (12.894145). Run weighted Levenshtein and divide by the longer sequence length. The implementation uses the upstream tables, not the library's default preprocessing or penalties. Scores are distances, not probabilities, and need not lie in [0,1].
- **Special units:** substitutions involving っ, ん or ー retain unit cost; insertions/deletions always cost one. This isolates ordinary-mora weighting and preserves explicit length/gemination/nasal distinctions. It does not normalize all phonemically equivalent long-vowel spellings, compare pitch contours or infer sound from audio. All 178 readings are supported; unsupported units fail explicitly. No zero weighted-distance pairs with different normalized readings occur in this bank.
- **Controlled eligibility:** both methods retain the existing baseline gate (`0.5 <= similarity < 1`) and exclude normalized same-reading alternatives. The weighted method only reranks that same candidate pool; this does not evaluate candidates excluded by the baseline gate or calibrate a new acoustic threshold. Preserving this gate also limits what the experiment can establish about long-vowel spelling normalization.
- **Scope/validity:** freeze the 178 approved words, their ten Japanese pack memberships, picture/writing eligibility (166 picture / 178 writing), and reviewed picture policy. Apply scope and target validity before taking six candidates. Picture exclusions and duplicate-image/text rules apply between alternatives as well as against the target; backtracking finds a compatible trio. Listening uses all-approved writing scope so the writing-only target can participate.

## Reproduction and provenance

The unchanged source CSVs in `vendor/` come from [Jiro Shimaya's kanasim](https://github.com/jiroshimaya/kanasim/tree/f067a4e8be10d818b37b8b9f08de933dae01524b), derived upstream from Julius acoustic models. See `vendor/README.md` and the full Apache-2.0 license. The baseline source, bank and picture policy are frozen here so later production changes do not rewrite the comparison. `results.json` records scoring/source hashes and all Otani/Morioki delivery hashes for the frozen bank; an in-place recording change invalidates this review revision.

Using Node 24.15 or newer, no Python packages, model downloads or API calls are needed:

```sh
node scripts/content/compare-pronunciation-neighbors.mjs
node scripts/content/compare-pronunciation-neighbors.mjs --check
node --test scripts/content/acoustic-pronunciation-distance.test.mjs scripts/content/pronunciation-listening-review.test.mjs scripts/content/score-pronunciation-listening.test.mjs
```

The first command regenerates outputs from the frozen inputs; `--check` verifies byte-identical output. `--refresh-bank` explicitly replaces the bank/picture-policy snapshots from the current app; use it only to start a new experiment revision before collecting judgments, and update the generator's recorded `bankSourceCommit` to that revision. Preserve the baseline source revision separately if changing it. Do not overwrite earlier human-response provenance. Test fixtures validate alignment, length/gemination, normalized identity, unsupported inputs, picture validity, exact regeneration, blind presentation and missing-response handling. The original two-model semantic experiment remains unchanged.

Verification: `npm run check` passed lint, TypeScript, 537 Vitest/React tests, 280 Node tests, 18 content Python tests, 27 card Python tests, runtime-neighbor validation and production build. The focused content-review journey passed in Chromium and mobile WebKit with native playback, isolated browser storage, reload and export. These browser checks do not complete human listening judgments or real-iPhone acceptance.
