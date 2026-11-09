# WaniKani level 1 contextual comprehension review (#183)

The bank covers 29 targets, with two simple and two contrastive contexts per target, two questions per context and four choices per question: 116 contexts and 232 questions. All 232 questions have been rewritten and individually reviewed for meaning-based comprehension. Sentences change where needed to support two useful questions.

Questions require interpreting quantities, inverse relations, resulting states, request intent, comparisons or paraphrases. Copying a uniquely repeated sentence fragment, changing only a verb ending, answering from the question alone, or guessing an unstated intention does not qualify. Simple questions stay within one short coherent situation; contrastive questions bind additional facts. Grammar stays roughly within Genki I and supporting vocabulary remains beginner-friendly.

The four authoring files are `counters.json`, `nouns.json`, `actions.json` and `relations.json`. Tuples contain Japanese, kana reading and English. Each context records stage, variant, spoken target occurrence, vocabulary and grammar requirements. Questions declare four choices, a zero-based correct index and `comprehension.operation`, `evidence` and `noEcho`. Source `kind` declares the **focus** (target meaning or situation detail). The compiled runtime `kind` continues to describe the **actual answer concept**: a result of 上げる can be 上 without giving 上 the vocabulary ID for 上げる.

`previous-questions.json` preserves the full first-review baseline at commit `322704347f720ba8e8859e2ae178336538f95079`, including all 24 pilot questions. The new pending replacements for 上・下・大きい use new context/question IDs. Previously approved banks, recorded speech and historical attempts are unchanged. The other drafts retain their stable IDs with incremented revisions. The generated audit links every previous question to its rewrite, interpretation and copying-shortcut check.

Run:

```sh
npm run content:contextual:pack1
npm run content:contextual:pack1:validate
node --test scripts/content/contextual-pack-1.test.mjs
```

Preparation writes `content/contextual/ja-wanikani-1-draft.json`, the audit JSON and the HTML/Markdown reviews in `artifacts/contextual-pack-1/`. Validation checks structural correctness, complete audit coverage, reproducibility and a narrow unique-verbatim-answer copying shortcut. These automated checks do not prove Japanese comprehension quality; the individual semantic evidence and independent language review remain necessary. Grammar/vocabulary requirements are conservative at context level and retain inflected dictionary-form verbs and contrasted quantities.

Serve the repository root with `python3 -m http.server 5207 --bind 127.0.0.1`, then open `http://127.0.0.1:5207/artifacts/contextual-pack-1/review.html`. Filter by word, stage and original pilot/expansion source. Each question shows Japanese, readings, English, all choices and its answer, with expandable comprehension evidence and the previous version. `comprehension-audit.md` contains the complete before/after review.

The seven bare numerals 一・二・三・七・八・九・十 and ふじ山 remain word-first. 人工・人口 retain standalone recognition with homophonic distractors excluded. 下さい・力いっぱい・大した remain contextual-only; future runtime work must provide direct simple-stage entry followed by the FSRS gate. This text task does not alter runtime admission.

All 116 revised contexts remain pending, contain no recordings and are outside ordinary practice. Owner approval of the actual revised text precedes speech generation. Listening acceptance and activation follow separately.
