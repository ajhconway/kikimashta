# Japanese pronunciation neighbors

Production pronunciation ordering uses the acoustic-weighted method selected in #216 after the offline comparison in #212. This changes ordering within the existing eligible candidate pool. The semantic fastText generator, mastery quotas, normalized homophone exclusions, selected scope and answer-format validity retain their existing roles.

## Source and attribution

The unchanged CSVs in [`kanasim/`](kanasim/) come from [Jiro Shimaya's kanasim](https://github.com/jiroshimaya/kanasim/tree/f067a4e8be10d818b37b8b9f08de933dae01524b), revision `f067a4e8be10d818b37b8b9f08de933dae01524b`, under [Apache-2.0](kanasim/LICENSE). Upstream derived these distances from Julius Japanese speech-recognition acoustic models. The copied tables are:

- `kana2phonome_bi.csv`: kana-to-contextual-phoneme mappings.
- `distance_consonants_bi.csv`: consonant acoustic-model distances.
- `distance_vowels_bi.csv`: vowel acoustic-model distances.

The full upstream mora inventory is retained, rather than a subset limited to the current bank. `scripts/content/weighted-pronunciation.mjs` verifies pinned source hashes before use. Preparation records source identity and recipe metadata alongside the generated runtime neighbors. The code implements the selected weighting recipe using these tables; it does not invoke kanasim's default tokenizer or default edit penalties.

## Eligibility and ordering

Readings use the **current** shared normalization and segmentation in `src/core/pronunciation.ts`: NFKC, katakana-to-hiragana normalization and kana mora units. Small vowel/glide kana stay attached to their preceding kana. Preserve explicit っ, ん and ー units.

The original unit-cost mora similarity remains the eligibility gate:

```text
similarity = 1 - unitEditDistance / longerMoraCount
eligible when 0.5 <= similarity < 1
```

Normalized identical readings are excluded. The weighted score only orders this eligible pool; there is no new acoustic threshold, and candidates excluded by the original gate are not introduced by weighting.

For an ordinary mora substitution, look up the two contextual consonant models and the two contextual vowel models. In each direction, subtract the source model's self-distance and clamp the result at zero. Average the consonant and vowel contributions equally, then average both directions. Divide by the fixed scale **12.894145**, the median substitution cost over unordered nonidentical ordinary-mora pairs in the pinned upstream inventory. This scale stays fixed when a pack is added.

Identical units cost zero. Insertions, deletions and substitutions involving っ, ん or ー cost one. Run weighted Levenshtein distance and divide by the longer mora count. Lower distance is closer; scores are distances, not probabilities, and need not lie in [0, 1]. Stable item IDs break equal-distance ties.

Apply selected language, pack, answer format and target validity before taking up to six closest valid candidates. Runtime selection shuffles that window and applies the existing mastery mixtures and pairwise picture-validity rules. When two rankings contain the same six candidates, ordering alone does not alter their shuffled sampling distribution. The change does not force the first three ranked alternatives into every question. Corrective retries retain their original choice snapshot.

## Regeneration and pack changes

From the repository root:

```sh
npm run content:neighbors
npm run content:neighbors:check
```

The first command rebuilds all approved Japanese pronunciation rows in `content/semantic-neighbors/ja-runtime.json` automatically. It needs no additional model download, training, Python model packages or new speech. Only compact neighbor indices and provenance metadata enter the browser; the acoustic tables remain offline preparation inputs.

When approved vocabulary expands, regenerate the semantic source rankings separately, then run this preparation for the **whole approved vocabulary**, including writing-only words. New words can become pronunciation neighbors of existing words. A reading-only correction requires a runtime rebuild and review of affected pronunciation alternatives; unchanged semantic inputs do not require rerunning fastText. Changing a learner's selected packs uses runtime filtering and needs no regeneration. Follow the full [pack-maintenance checklist](../semantic-neighbors/README.md#adding-packs-and-maintaining-neighbors).

Unsupported readings or mora units fail preparation explicitly. Resolve the content or supported mapping before release; do not silently omit the word or substitute guessed weights. Changes to source tables, normalization or the weighting recipe require review and new provenance rather than silently replacing the selected method. The deterministic check is included in `npm run check` and detects stale generated output. It validates prepared data, not perceptual or learning quality.

## Evidence and limits

The [historical comparison](../../artifacts/pronunciation-neighbors-212/README.md) preserves the frozen baseline, source bank, model inputs and exact owner listening responses. Production uses current shared normalization without rewriting those historical inputs or the original response digest. The small listening comparison supported trying this ordering, while exposing a repeated baseline preference for 一台; it does not establish improved retention or learner discrimination.

The method weights ordinary-mora differences using a Japanese acoustic model. It does not analyze the app's recordings, model pitch accent, or normalize every equivalent long-vowel spelling such as コー/こう. The existing eligibility gate and conservative same-reading exclusion remain in place. Listening review and actual iPhone audio/touch verification remain part of release acceptance.
