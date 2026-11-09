# Pronunciation comparison benchmark (#212)

This benchmark was hand-authored from the approved Japanese bank and controlled reading strings before inspecting kanasim distance data or any weighted rankings. It is a small diagnostic set, not a perceptually validated test set. The author did not listen to the comparison recordings or assign any human preference results.

## What the checks establish

The 24 triplets have an explicit separation:

- Eight invariants check normalization and the preservation of distinct readings. An identical normalized reading must be closer than a changed reading; vowel length, gemination, voicing, glide segmentation and the moraic nasal cannot be erased. These are technical correctness checks, reported separately from model-quality comparisons.
- Sixteen exploratory orderings express provisional expectations. Eight use controlled reading probes and eight use approved vocabulary. They cover voicing, shared vowels, vowel quality, glides, length, gemination and compound structure. Their rationale explains the expected relation; it does not establish how a native speaker or a learner will hear the recordings. Some expectations deliberately expose ties in unweighted mora distance.

Controlled probes are not claims that the strings are vocabulary entries, meaningful words or available audio. No draft-only words are admitted to the app. Approved-bank triplets and all listening targets have explicit item IDs and readings that must match `japaneseSemanticBank`.

Compute raw distances for triplet orderings before admission thresholds or pack/picture filtering. Report strict expected orderings, ties, reversals and unsupported inputs separately with a tolerance of 1e-9. Retain the declared denominator and report coverage rather than dropping unsupported probes. Do not count normalization invariants as evidence of superior phonetic prediction. Production-scoped coverage and validity are separate diagnostics.

The predeclared weighted experiment retains baseline mora segmentation and insertion/deletion cost one. It assigns cost one for substitutions involving the special units っ, ん or ー. Ordinary substitutions use self-offset, clamped, symmetrized Julius-derived biphone distances with equal consonant/vowel weights and off-diagonal median scaling. Consequently, special-mora checks largely exercise inherited policy rather than an acoustic model of timing. Neither model measures pitch accent or detects all long-vowel spelling equivalences. Retaining the baseline candidate gate isolates reranking within the current candidate set; it cannot demonstrate discovery of additional sound neighbors outside that gate.

## Listening review planned before rankings

Twelve target words are declared in the JSON, spanning short readings, affricates, gemination, palatalized morae, both long-vowel spellings, compounds, counters, a verb and a writing-only word with a known same-reading partner. This is deliberate coverage sampling rather than random sampling from the vocabulary.

For each target, compare top-three valid alternatives from the two methods using existing approved recordings. Use the same voice for the target and all alternatives in a trial; repeat with a second available native voice. The opposite A/B assignment on the second pass balances the 24 maximum trials. Freeze the assignment seed and presentation order. If the methods produce the same candidate set, classify it as unchanged rather than requesting or counting a preference. For targets with fewer than three valid neighbors, expose the actual count and avoid padding with unrelated words.

The listening presentation hides method names, scores and meanings before the judgment. Text readings can be revealed after saving a response or inspected separately. This conceals method labels from a reviewer; it is not a claim of a double-blind experiment. Provide A, B, tie, neither and uncertain responses, with replay and a downloadable response record. Missing ratings are pending, not losses. An unavailable recording makes a trial incomplete; do not substitute a different voice silently.

The question is which set sounds closer while remaining distinguishable. This asks for subjective phonetic similarity, not a timed recognition task or demonstrated learner confusion. Report responses by voice and show unchanged-set counts; a single reviewer and 12 intentionally selected words do not establish learning effectiveness or statistical superiority. Deployment remains unchanged until the measured rankings and actual listening review justify a separate decision.
