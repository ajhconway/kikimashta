# Spanish neighbor evaluation (#222)

This is an offline evaluation of semantic and pronunciation candidates for the 159 approved ordinary Spanish picture words. Spanish practice still uses its existing randomized choices. Nine direct foundation contexts stay outside the ordinary candidate pool. No model weights, phonemizer binaries or new speech are shipped by this experiment.

## Measured semantic results

| Check | Spanish fastText composition | E5-base + intended meaning |
| --- | --- | --- |
| Coverage | 159/159 | 159/159 |
| Independent ordering hypotheses | 31/32 | 28/32 |
| Multiword hypotheses | 22/23 | 21/23 |
| Ordinary nouns | 5/5 | 3/5 |
| Intended-sense hypotheses | 4/4 | 4/4 |
| Mean known-positive recall@5, raw semantic ranks | 69.44% | 45.83% |
| Mean recall@5 after picture validity, excluding unsafe positives from denominator | 70.83% | 48.61% |
| Repeated inference, maximum vector difference | 0 | 0 |

The benchmark and bank were committed before inference (`c6a0e91`). A separate content worker authored 32 ordering hypotheses, including every multiword entry, and 12 known-positive queries without seeing either model's output. These are exploratory content checks, not human judgments or learner-effectiveness measurements. Ties are separate from strict successes; neither model had a semantic tie here. Recall uses incomplete known-positive sets, not exhaustive relevance labels or precision. See `benchmark.json`, `benchmark-notes.md` and `metrics.json`.

FastText leads for these fixed recipes and this pool, despite the phrase-composition concern. It reverses the sunscreen/beach versus tire hypothesis: the averaged protector solar representation needs intended-sense inspection. E5 reverses hair-dryer/comb versus salt, tent/sleeping-bag versus fork, water/milk versus car, and fork/spoon versus mountain. Inspect actual neighbors before choosing production data. This is not a verdict on all Spanish embeddings or other E5 input formulations. Some competing senses, such as lemon versus lime or live versus cooked chicken, are absent from this bank; passing those coarse probes cannot establish full sense disambiguation.

The five separate packs and combined pool can each supply a compatible ranked first-three example within six target-valid neighbors for every target under all four experimental methods. This is coverage by construction from a ranking without a closeness cutoff; it does not establish that every word has three close neighbors. Six independent picture-validity invariants pass. The full source data include all effective picture exclusions. Target language/duplicate-image exclusions and same-tool-pronunciation exclusions apply before ranking; three-option examples also check exclusions between alternatives. The prepared IPA has no exact duplicate keys among these 159 words; that does not prove that every regional pronunciation is distinct.

## Pronunciation result and blocker

Pinned eSpeak-NG 1.52.0 es-419 transcriptions are repeatable for all 159 words and the controlled probe strings. Phone boundaries come from eSpeak, primary stress is retained as a token, lexical word boundaries are `|`, and secondary stress is ignored. Multi-codepoint phones remain single units. Both phoneme and letter-control distances use normalized unit Levenshtein distance. The letter control preserves Unicode accents; it is an experimental spelling proxy, **not the current app's randomized policy**.

The transcription candidate satisfies **19/20** frozen probes, including NFC equivalence, silent h, b/v, seseo, stress contrasts, tap/trill, ñ and phrase boundaries. It fails **P08 halla/haya** under the declared canonical yeísmo policy: eSpeak emits `ˈa_j_j_a` versus `ˈa_ʝ_a`. This phonetic/allophonic difference must not become a false lexical homophone distinction under that policy. We retained the failure rather than adding a post-result exception. Canonical phonemic normalization or a reviewed pronunciation source is needed before production activation. One canonical es-419 output also does not represent all eight recorded voices, especially Buenos Aires ll/y and regional coda-s realizations.

These rankings have **no Japanese 0.5 gate** and no calibrated Spanish eligibility cutoff. They compare equal six-candidate windows from the valid pool. They are phonetic proxies, not acoustic similarity models. Primary stress contributes a unit edit cost; that cost, length normalization and boundary weighting require listening assessment. Ranked first-three examples are not a measurement of a future six-window shuffle policy.

## Owner review

Use [review.html](review.html) for paired judgments. It has **12 semantic comparisons** and **28 pronunciation trials** (seven of eight predeclared listening targets, each in Juan/Mexico City, Carito/Bogotá, Santiago/Buenos Aires and Veronica/Puerto Rico). Limón's two candidate sets were identical and were omitted without replacement. Candidate lists are canonically ordered within A/B to avoid exposing rank. A/B mapping is balanced across each target's four regional passes; fixed hash ordering separates repeated targets. Existing approved recordings are used throughout.

Complete pronunciation first: opening the semantic section and revealing any listening trial are recorded, and subsequent listening ratings are marked as exposed. Targets repeat across voices, so postpone reveals until after the listening ratings when possible. Semantic judgments show Spanish words, English intended meanings and approved pictures. Pronunciation judgments initially hide words/pictures; rate before revealing them. Use A/B/Tie/Neither/Uncertain and optional notes. Responses persist under an experiment-specific localStorage key and can be exported partially; null remains unanswered. No practice history or account state is written. We have not collected human preferences for this experiment. Browser-test responses are isolated fixtures and are not research results.

The revision digest binds all model/phonetic outputs, bank, benchmark, recipes, generator, presentation source and all 1,431 existing image/audio delivery hashes. Saved answers from a different revision are rejected. Avoid `blind-key.json`, `review-data.json`, model outputs and the unblinded [full 159-word inspection](inspection.html) before rating if you want to preserve method blinding. The current scripts render new review data only from the frozen inputs; preserve any later real export and its exact report/key revision before changing inputs.

Serve the repository and public media locally, for example:

```sh
npx vite --host 0.0.0.0 --port 4296 --strictPort
```

Open <http://localhost:4296/artifacts/spanish-neighbors-222/review.html>; on a phone on the same Wi-Fi replace localhost with the computer's LAN address. Export responses and analyze them with:

```sh
node scripts/content/score-spanish-neighbor-review.mjs /path/to/spanish-neighbors-222-responses.json
```

The scorer keeps semantic and pronunciation preferences separate, reports pronunciation by voice, reveal status, prior word exposure from any trial and prior semantic exposure, and preserves ties/neither/uncertain/missing responses. One owner judging repeated targets across four voices is not four independent participant groups. No statistical significance or learning benefit is claimed.

## Frozen inputs and reproduction

- Bank: ordinary content registered in `src/core/languages.ts`, frozen from source revision `06c5f9e173662246552cd36c618f5e66b3dd98dd`. A focused parity test verifies the live preparation helper against actual app membership/exclusions; future app additions must not overwrite this historical bank.
- FastText: [facebook/fasttext-es-vectors](https://huggingface.co/facebook/fasttext-es-vectors), revision `c4c84c726b98d02b1f0ec92d6fc2724fe3b84276`, binary SHA-256 `b8c800affac505d60c8a929cb90ff2ef616b4e8b5224d8f3a0a5e911a8a6546e`, 300 dimensions, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). NFC/casefold Unicode-letter tokens; drop only de/del/la/el/los/las/y/en unless no tokens remain; average unit token vectors and normalize. All used tokens are whole-word entries in this model. Full models remain outside Git.
- E5: [intfloat/multilingual-e5-base](https://huggingface.co/intfloat/multilingual-e5-base), revision `d128750597153bb5987e10b1c3493a34e5a4502a`, 768 dimensions, model-card MIT license. Input is exactly `query: {Spanish text} — {English meaning}`. CPU deterministic inference, four threads, batch 16, maximum sequence length 128. Every cached model file used is hash-recorded in `e5-results.json`.
- eSpeak-NG: [1.52.0 source](https://github.com/espeak-ng/espeak-ng/tree/4870adfa25b1a32b4361592f1be8a40337c58d6c), commit `4870adfa25b1a32b4361592f1be8a40337c58d6c`, GPL-3.0-or-later. Full upstream GPL text is in `licenses/ESPEAK-NG-GPL-3.0.txt`. The script checks the source revision, clean tracked source and binary version, and records binary/dictionary/voice-data hashes. Use `-q --ipa=1 -v es-419` with the built data directory. No phonetic source overrides were applied.

Ordinary postprocessing/checks need Node 24.15+ and no model packages or external binary:

```sh
node scripts/content/evaluate-spanish-neighbors.mjs
node scripts/content/evaluate-spanish-neighbors.mjs --check
node --test scripts/content/spanish-neighbor-utils.test.mjs scripts/content/spanish-neighbor-review.test.mjs scripts/content/score-spanish-neighbor-review.test.mjs
```

`--check` verifies exact postprocessing output from the frozen measured model files. Full model inference uses a separate Python 3.13 environment and `experiment-requirements.txt`; it checks finite/nonzero vectors and repeats inference before writing. Timings may differ between runs; the measured vectors/matrices are deterministic within the recorded environment. Download pinned public model files into an external cache, verify identity, then run:

```sh
python artifacts/spanish-neighbors-222/experiment.py fasttext --model-file /path/to/spanish/model.bin
python artifacts/spanish-neighbors-222/experiment.py e5 --cache-dir /path/to/huggingface/hub
```

E5 requires the pinned snapshot already cached. For eSpeak, build the pinned source with CMake (`cmake==4.4.4` was used), `USE_LIBPCAUDIO=OFF`, `USE_LIBSONIC=OFF`, `USE_MBROLA=OFF`, `USE_SPEECHPLAYER=OFF`, `USE_KLATT=OFF` and `ESPEAK_BUILD_MANPAGES=OFF`. Build targets `espeak-ng-bin` and `data` (the default all-target also attempts an unused optional C++ speech-player library). Then:

```sh
python artifacts/spanish-neighbors-222/phonemize.py --binary /path/to/build/src/espeak-ng --data-prefix /path/to/build --source-dir /path/to/pinned/source
node scripts/content/evaluate-spanish-neighbors.mjs
```

## Remaining #222 work

Review actual semantic and regional sound candidates, resolve the canonical yeísmo mismatch and any other transcription findings, decide Spanish pronunciation eligibility/weighting, then select one production semantic source and integrate language-specific compact tables under the established mastery rules. Current evidence provisionally favors the tested fastText composition over this E5 recipe. Spanish activation, owner listening preferences and physical-device acceptance remain pending and separate from this evaluation.
