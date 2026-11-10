# Selected Spanish word neighbors (#222)

The owner selected Spanish fastText composition for semantic relatedness and phoneme edit ranking for initial practice integration after reviewing the [frozen comparison and partial responses](../../artifacts/spanish-neighbors-222/collected/README.md). The production bank now contains **202 unique ordinary words in seven packs**, including the newly approved Food level 1. Shared Travel/Food IDs use one canonical item and retain every pack membership; the accepted Food rice illustration is current. Nine direct foundation contexts remain outside ordinary word-neighbor preparation.

The browser imports only `es-runtime.json`: compact index rankings, canonical pronunciation keys and picture exclusions. Model weights, eSpeak and Python packages remain offline. Experimental E5 data remain solely in the frozen comparison. Production regeneration never imports that experiment or rewrites its 159-word bank, reports, media hashes or actual owner responses.

## Semantic source

`es.json` contains complete cosine rankings from [facebook/fasttext-es-vectors](https://huggingface.co/facebook/fasttext-es-vectors/tree/c4c84c726b98d02b1f0ec92d6fc2724fe3b84276), revision `c4c84c726b98d02b1f0ec92d6fc2724fe3b84276`, 300 dimensions. The selected binary SHA-256 is `b8c800affac505d60c8a929cb90ff2ef616b4e8b5224d8f3a0a5e911a8a6546e`; generation rejects different bytes. The model license is [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

The recipe matches the reviewed candidate: NFC/casefold Unicode-letter tokens; remove only de/del/la/el/los/las/y/en unless doing so leaves no tokens; average unit token vectors and normalize. Preserve accents and ñ. All current token vectors are whole-word entries; subword vectors are supported for future words and must be finite/nonzero. Each intended meaning participates in the source digest so a sense change requires deliberate regeneration/review even though fastText itself embeds the Spanish spelling. Phrase composition and static-model senses have limits; the owner rejected both compared tent sets. Inspect new/affected meanings rather than treating every top result as approved.

`scripts/content/es_semantic_neighbors.py` pins the model, package versions, exact source inputs, recipe hash, token representation methods and complete rankings. It repeats inference and refuses nondeterministic vectors. The selected 202-word run repeats exactly.

## Pronunciation source and canonical policy

`../pronunciation-neighbors/es.json` contains raw transcriptions from [eSpeak-NG 1.52.0](https://github.com/espeak-ng/espeak-ng/tree/4870adfa25b1a32b4361592f1be8a40337c58d6c), source commit `4870adfa25b1a32b4361592f1be8a40337c58d6c`, GPL-3.0-or-later. `scripts/content/es_phonemes.py` verifies clean pinned source and binary version, records binary/data/dictionary/rule hashes, and repeats every transcription. It uses `-q --ipa=1 -v es-419`; no speech synthesis or network service is needed. The GPL text is preserved in the [original experiment license](../../artifacts/spanish-neighbors-222/licenses/ESPEAK-NG-GPL-3.0.txt).

Explicit phone boundaries come from eSpeak. `src/core/spanish-pronunciation.ts` retains primary stress as `ˈ`, lexical boundaries as `|`, tap/trill, ñ, ordinary single /j/ glides and multi-codepoint phones; it ignores secondary stress. Its selected canonical yeísmo rule merges **only adjacent `j_j` into one `ʝ`**, never across a lexical boundary or a stress token. Pinned [`dictsource/es_rules`, medial ll rule](https://github.com/espeak-ng/espeak-ng/blob/4870adfa25b1a32b4361592f1be8a40337c58d6c/dictsource/es_rules#L125) maps medial ll under the selected flag to `j:`, emitted as `j_j`; consonantal y maps to `J^`, emitted as `ʝ`. This resolves the raw-tool halla/haya and calle/caye allophone mismatch without rewriting spelling or merging every single glide. The [RAE yeísmo description](https://www.rae.es/dpd/ye%C3%ADsmo) supports the declared ll/y merger; it does not imply uniform regional acoustics.

This deliberately limited canonical policy is a phonetic comparison proxy. It does not normalize every possible fortition/allophone or predict regional coda-s reduction and Buenos Aires ll/y. A single canonical output is not a transcription of all eight recorded voices. Additional mergers/variants need explicit review under [#235](https://github.com/ajhconway/kikimashta/issues/235).

Pronunciation rows rank **all nonidentical canonical readings** by normalized unit Levenshtein distance, with unit insertion/deletion/substitution costs including stress and word boundaries; ties use stable item IDs. Exact same-key candidates are excluded and keys are available to the shared runtime selector at every mastery. No calibrated acoustic costs or Spanish closeness threshold are claimed; the Japanese 0.5 eligibility gate is not imported. Current 202-word preparation has no exact same-key groups. That does not establish the absence of regional homophones.

The separate `es-probes.json` contains 22 controlled checks: the original 20 frozen expectations plus a medial-ll merger and a glide/hiatus contrast. All 22 pass after canonical normalization, including silent h, b/v, seseo, stress, tap/trill, ñ and phrase boundaries. The frozen experiment's original raw 19/20 result remains unchanged as historical evidence.

## Regeneration and pack maintenance

Ordinary development/CI needs no model packages or phonemizer. Regenerate compact data from checked-in selected sources with:

```sh
node scripts/content/build-spanish-word-neighbors.mjs
node scripts/content/build-spanish-word-neighbors.mjs --check
```

The aggregate `npm run content:neighbors` / `content:neighbors:check` commands also run this preparation. Checks bind current unique membership/canonical metadata, intended meanings, picture exclusions, approved image bytes, raw source outputs, normalization and preparation recipes. Full semantic rankings allow pack filtering before the nearest-six selection window; learner selection changes require no model rerun.

When approved vocabulary, text or intended meanings change, prepare the **whole current unique pool**, not only new rows:

1. Register the approved bank in `src/content/spanish-vocabulary.ts` and `spanishBankFiles` in `scripts/content/spanish-neighbor-utils.mjs`, retaining matching canonical precedence. The app/preparation parity test checks unique IDs, all pack memberships, canonical media and effective exclusions, so missing a registry update fails verification.
2. Review shared identities and cross-pack picture ambiguity. Update approved content/exclusions. Image-only, picture-policy or pack-membership changes need runtime rebuilding and affected-choice review; unchanged spelling/senses need no model rerun.
3. In a separate Python 3.13 environment, install `scripts/content/es-semantic-neighbors-requirements.txt`, obtain the exact pinned model outside Git, and rerun selected semantic generation:

   ```sh
   python scripts/content/es_semantic_neighbors.py --model-file /path/to/spanish/model.bin
   ```

4. Build the pinned eSpeak source outside Git, then rerun all current words and control probes:

   ```sh
   python scripts/content/es_phonemes.py --binary /path/to/build/src/espeak-ng --data-prefix /path/to/build --source-dir /path/to/pinned/source
   ```

   The existing build used `USE_LIBPCAUDIO=OFF`, `USE_LIBSONIC=OFF`, `USE_MBROLA=OFF`, `USE_SPEECHPLAYER=OFF`, `USE_KLATT=OFF`, `ESPEAK_BUILD_MANPAGES=OFF`, and only targets `espeak-ng-bin` and `data`. It needs no audio output backend. Keep source, dictionary/data and binary hashes in the generated provenance.

5. Rebuild compact tables, run focused preparation/parity/homophone tests and the configured checks/browser journeys, then review affected semantic/sound/picture choices. A reading/IPA override or new pronunciation policy requires explicit transcriber/normalizer handling and regeneration rather than silently reusing surface-spelling transcriptions. Never overwrite the frozen experiment or remap collected answers.

Revisit method quality after a substantial later vocabulary expansion under [#235](https://github.com/ajhconway/kikimashta/issues/235). This follow-up does not postpone required whole-pool regeneration. Future listening comparisons should use one main judgment per distinct candidate pair, with optional targeted regional checks rather than mandatory four-voice repeats. The owner already completed all seven distinct initial pronunciation pairs; no repetitive completion is required for this release.
