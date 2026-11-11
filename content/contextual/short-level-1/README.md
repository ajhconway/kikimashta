# Short level-1 contextual drafts (#253)

The owner liked the ten short examples in #250 and requested **two total prompts per level-1 word**, with frequent shared answer-card reuse. This bank contains 74 prompts for all 37 `sourceLevel: 1` catalog entries, including the eight previously word-first targets. The ten existing demo examples count toward the total. The old accepted simple/contrastive bank, speech and practice eligibility remain unchanged.

Review all questions at [the private draft review](https://kikimashta-short-context-250.cornell-tech-5688.chatgpt.site/drafts.html). Filter by word, show the correct answers, or switch to the shared-card inventory. The original ten-example player remains available. This is a text and answer-card review; the thirteen missing shared pictures are labeled artwork concepts, and no new speech is generated for this bank.

## Authoring rules

- The purpose of these simple contexts is to hear the word in a short sentence or question. Direct picture matching is enough. Do not add inference, counterfactual, masking or no-echo requirements from the older contrastive authoring workflow.
- Prefer one short sentence. Add at most one short question only when useful; counting and direct requests need no repeated “how many?” question. Current sentences are at most 13 written Japanese characters and questions at most 10. Keep supporting words familiar; length alone does not prove beginner difficulty.
- Choose a reusable answer set **before** writing the prompt. Reference existing card IDs; do not copy pictures or create IDs per word/question. Share the same cards across words, variants, correct answers and distractors whenever the pictured meaning fits.
- Each card must appear in at least two prompts. Most should cross word boundaries. Review reuse as a whole bank, not just within a word. Shared quantity sets keep one object type per question, so the quantity distinguishes the answers.
- Give each prompt exactly one correct answer. Reuse must preserve visible quantities, subjects, relations and motion. Do not put two valid “two people” or “entering” pictures in the same set. A static above/below scene does not depict lifting/lowering.
- Preserve source bytes, hashes, media approval status and exact target identity. Reusing pending demo art does not approve it. Missing pictures stay explicit shared concepts until produced through the established artwork protocol.
- Record Japanese, reading, English, exact spoken target occurrence and its segment. Inflected surface readings must match the inflection. 大きさ is heard in the short question; the other targets occur in the sentence.
- Text review precedes fresh speech generation. Use the approved Otani/Morioki contextual workflow after exact text approval. Generation, media acceptance, publication and ordinary-practice activation remain separate.

## Shared cards

`bank.json` owns the 37 frozen target identities, 74 prompts, 21 answer sets and 69 shared card concepts. It references 56 existing images and thirteen missing pictures. All 69 cards appear at least twice; 55 are shared across different words, and 38 serve as both correct answers and distractors. The full bank has 296 answer slots.

Examples:

- 一つ・二つ・三つ share the same apples 1–4 and cookies 1–4; 下さい reuses the apple set.
- 七つ・八つ・九つ share oranges 6–9 and eggs 6–9.
- 一人・二人・三人・人口 share the same four human group counts. The two-person card is the same `adults` card used for 大人, with no copied alias.
- 上・下 share all four cat/box relation cards. IDs describe the **box relative to the cat**, including inverse questions.
- 山・川 share house-location and destination pictures. The Fuji card is a separate missing landmark picture, not a renamed generic mountain.
- 入り口・入る share the inward-arrow doorway. 上げる・下げる share one matched movement set; those movement cards also serve as doorway distractors. 力・力いっぱい share the push/pull/effort set.
- 大きい・大きさ share the same four size/object pictures. Their reference, scale and framing must match, so resizing each subject to fill its card cannot erase the size cue.

The thirteen shared artwork briefs cover three/four people, large/small box/ball, lifting/lowering a box, Fuji, and natural/artificial flower/grass. The artificial turf must show its manufactured backing/roll and natural grass its roots/soil. Tiny seams or color alone are insufficient. The two natural negative 大した examples reuse the existing minor-injury card; that word remains a harder review point.

## Validate and prepare

```sh
node --test scripts/content/short-level1.test.mjs
node scripts/content/prepare-short-level1-review.mjs
```

Preparation checks the complete frozen scope, two variants per word, short complete text, spoken occurrences/readings, four distinct answer references, correct keys, repeat use, source status and every existing image hash. It writes a complete Markdown review and exact correct/distractor/word reuse inventory to `artifacts/short-context-level1-253/`, plus the demo's public source records. Catalog image bytes are copied once per image; existing demo image paths are reused directly.

`npm run check` includes structural regressions. The complete-media hash pass belongs to preparation; it does not add another routine decoder sweep. Japanese entailment and picture distinction still require review. A separate read-only review covered all 74 prompts and 21 sets; its corrections to inflected readings and the second 大した phrase are incorporated.
