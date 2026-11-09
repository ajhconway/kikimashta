# WaniKani level 1 contextual comprehension review (#183)

The bank covers 29 targets, with two simple and two contrastive contexts per target, two questions per context and four choices per question: 116 contexts and 232 questions. Every question must require the meaning of its vocabulary target, including questions about another detail. All 232 original and counterfactual answer keys receive individual semantic review; questions that already pass can remain, and failed questions or sentences are rewritten.

Questions require interpreting quantities, inverse relations, resulting states, request intent, comparisons or paraphrases. Copying a uniquely repeated sentence fragment, changing only a verb ending, answering from the question alone, guessing an unstated intention, or answering while ignoring the target does not qualify. Masking the target must make the answer indeterminate; redundant clues such as an unrelated action cannot replace the target meaning. Simple questions stay within one short coherent situation; contrastive questions bind additional facts. Grammar stays roughly within Genki I and supporting vocabulary remains beginner-friendly.

The four authoring files are `counters.json`, `nouns.json`, `actions.json` and `relations.json`. Tuples contain Japanese, kana reading and English. Each context records stage, variant, spoken target occurrence, vocabulary and grammar requirements. Questions declare four choices, a zero-based correct index, `comprehension.operation`/`evidence`/`noEcho`, and `targetDependency` with a natural replacement expression, a different correct index, semantic evidence and a masking explanation. Preparation constructs the counterfactual by replacing only the tracked target expression in the sentence. The question, choices and other facts stay fixed. Inflected or idiomatic target expressions may include the minimal grammatical wrapper needed for a natural replacement; the word meaning must still be needed with surrounding grammar visible. Source `kind` declares the **focus** (target meaning or situation detail). The compiled runtime `kind` continues to describe the **actual answer concept**: a result of 上げる can be 上 without giving 上 the vocabulary ID for 上げる.

`previous-questions.json` preserves the full first-review baseline at commit `322704347f720ba8e8859e2ae178336538f95079`, including all 24 pilot questions. The new pending replacements for 上・下・大きい use new context/question IDs. Previously approved banks, recorded speech and historical attempts are unchanged. The other drafts retain their stable IDs with incremented revisions. `target-dependence-baseline.json` preserves the immediately prior review at `ab42fe810811db4ef23618c26502b94196692142`, including the rejected sleeping example. The current audit compares against that version, preserving both earlier review snapshots. Changed content increments revisions; unchanged passing questions keep their revisions.

Run:

```sh
npm run content:contextual:pack1
npm run content:contextual:pack1:validate
node --test scripts/content/contextual-pack-1.test.mjs
```

Preparation writes `content/contextual/ja-wanikani-1-draft.json`, the audit JSON and the HTML/Markdown reviews in `artifacts/contextual-pack-1/`. Validation checks structural correctness, complete audit coverage, reproducibility, a narrow copying shortcut and exact target-only replacement with a different answer key. Automated checks do not prove Japanese entailment or target dependence. Independent review must verify the original and counterfactual keys, naturalness, the masking explanation and absence of other clues that bypass the target. Grammar/vocabulary requirements are conservative at context level and retain inflected dictionary-form verbs and contrasted quantities.

Serve the repository root with `python3 -m http.server 5207 --bind 127.0.0.1`, then open `http://127.0.0.1:5207/artifacts/contextual-pack-1/review.html`. Filter by word, stage and original pilot/expansion source. Each question shows Japanese, readings, English, all choices and its answer, with an expandable Target-word check showing the original answer, counterfactual sentence and changed answer, plus comprehension evidence and the previous version. `comprehension-audit.md` contains the complete before/after review.

The seven bare numerals 一・二・三・七・八・九・十 and ふじ山 remain word-first. 人工・人口 retain standalone recognition with homophonic distractors excluded. 下さい・力いっぱい・大した remain contextual-only; future runtime work must provide direct simple-stage entry followed by the FSRS gate. This text task does not alter runtime admission.

All 116 revised contexts remain pending, contain no recordings and are outside ordinary practice. Owner approval of the actual revised text precedes speech generation. Listening acceptance and activation follow separately.

The owner has approved the text snapshot at `bd6011142069354c0c60855b23606453e06af7c9`; see `text-approval.json` for exact file/text hashes. The reviewed bank stays frozen with staging flags until media preparation applies that approval. Audio has not been generated or accepted, and the bank is not active practice content.
