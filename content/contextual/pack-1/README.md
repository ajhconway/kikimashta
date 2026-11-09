# WaniKani level 1 contextual draft (#183)

This expansion covers the 29 contextual targets selected in the owner's level 1 review. Each target has two simple and two contrastive contexts, with one target-answer and one other-detail question per context, and exactly four choices per question. The twelve existing approved contexts for 上, 下 and 大きい are reused for review, without modifying their source banks or media. The 26 new targets add 104 contexts and 208 questions.

The seven bare numerals 一・二・三・七・八・九・十 and ふじ山 remain word-first. 人工 and 人口 retain standalone word cards; exclude homophonic distractors in standalone questions. 下さい・力いっぱい・大した are designated contextual-only. Future integration must admit those three directly into simple contextual practice and use the existing FSRS interval gate for contrastive practice. This draft does not implement that admission change or activate any vocabulary.

The three JSON files in this directory are the authored sources. Tuples contain Japanese text, kana reading and English meaning. Each context explicitly records its stage, variant, target occurrence, supporting vocabulary, grammar requirements and two questions. Each question names its correct answer by zero-based index. Optional `pictureOptions` lists the four catalogue pictures whose meanings have been checked for that question. Phrase answers are allowed where needed to express the target naturally. Requirements are conservative at context level, including contrasted quantities and answer vocabulary; dictionary-form verbs remain referenced when speech uses an inflection. Options inherit the context's grammar profile so phrase answers keep their requirements.

Run:

```sh
npm run content:contextual:pack1
npm run content:contextual:pack1:validate
node --test scripts/content/contextual-pack-1.test.mjs
```

Preparation deterministically writes `content/contextual/ja-wanikani-1-draft.json` and the readable HTML/Markdown review in `artifacts/contextual-pack-1/`. The compiler reuses the existing bank validator while allowing the selected catalogue targets for authoring only. It does not add them to the approved runtime practice pool. The separate bank is not imported into the app, all new text remains pending and no recordings exist.

For local review, serve the repository root with `python3 -m http.server 5207 --bind 127.0.0.1`, then open `http://127.0.0.1:5207/artifacts/contextual-pack-1/review.html`. Filter by word, simple/contrastive stage and new/existing status. Both the HTML and Markdown show all Japanese, readings, English meanings, choices, correct answers, explanations and semantic review notes. The page does not save progress or contact speech services.

Owner approval of the actual new text is required before speech generation under PLAN.md. Text review, listening acceptance and runtime activation remain separate. Existing speech and picture assets, acceptance records and historical attempt identities are unchanged.
