# Listening practice app plan

A personal listening game, starting with Japanese and leaving room for other languages. Keep it relaxed, untimed, and simple enough to improve through use.

## Current state — November 8, 2026

Adaptive practice and optional account sync are deployed at [kikimashta.com](https://kikimashta.com). This plan was reconciled against revision `38f6619e63707df8db411a2697f21e726ea16c7e` during [review #113](https://github.com/ajhconway/kikimashta/issues/113); findings and verification are in [docs/REVIEW.md](docs/REVIEW.md).

- The library has 440 visible entries from 441 catalog records. The approved practice pool has 166 vocabulary items, each with independently scheduled picture and writing cards: 332 cards before pack filtering. Retired starter-only words keep their history.
- Ten selectable WaniKani packs cover levels 1–5, separately for pictures and writing. Selection is remembered on this device and scopes lessons, due reviews, answer choices, dev review, and forecasts. Browsing a pack does not approve more content for practice.
- Sessions snapshot due reviews, then offer lessons in chunks of roughly ten cards. Picture and writing cards mix within each block; each question offers one answer format. Missed cards return until answered correctly. Corrective retries are saved but excluded from retention evidence.
- Writing lessons use Noto Sans JP. Later reviews rotate approved print and handwriting fonts, with coverage checks and a standard-font fallback. Font appearance is a local preference.
- Each item has eight approved pregenerated ElevenLabs voices. Artwork activation covers 168 approved illustrations from batches 01–10. Batch 11 is ready to generate; later artwork still follows the owner's feedback gates.
- Home centers Kiku and uses the current review-intensity color across the screen. The pace selector wheels were removed in #105. The density policy still uses saved device preferences or the Light–Moderate default.
- Answers save to IndexedDB. Optional email-code sign-in adds account-scoped history and note sync, with explicit guest-progress copy. Dev review remains unsaved.
- Code and documentation use AGPL-3.0-only; separately licensed media retain their terms.

## Current milestone: finish progress-sync acceptance (#6)

The Supabase schema, Resend SMTP, code-email templates, and production configuration are activated. Signup, later sign-in, and note edit/deletion convergence were verified in isolated Chromium browsers; the initial sync release was deployed in #71. The live site's source notice now identifies the reviewed revision. [Setup and activation evidence](docs/SUPABASE.md).

Keep [#6](https://github.com/ajhconway/kikimashta/issues/6) open for acceptance on the actual iPhone: complete audio/touch/session flow, persistence after reload, and sync with a second device, including notes and explicit guest-progress copy. Browser emulation does not complete this acceptance.

The review recorded [save failure after leaving practice (#114)](https://github.com/ajhconway/kikimashta/issues/114), [picture-answer accessibility (#115)](https://github.com/ajhconway/kikimashta/issues/115), [missing artwork checks in CI (#116)](https://github.com/ajhconway/kikimashta/issues/116), and [clock-skew practice lockout (#117)](https://github.com/ajhconway/kikimashta/issues/117). Each finding has its own implementation task. #116 is addressed by the required card checks described below.

## Implementation

| Part | Choice |
| --- | --- |
| App | React, TypeScript, and Vite; prioritize Safari on iPhone 17 |
| Learning | Pinned `ts-fsrs` 6.0.0, explicit FSRS-6 model, 90% desired retention; separate scheduling, session, and workload policies |
| Local progress | IndexedDB with stable attempt IDs and language/item/exercise identity; retain original answers, choices, recording, retries, replay counts, and timing |
| Sync | Optional Supabase email-code auth; append-only private attempts and note events, idempotent uploads, paginated downloads, separate account databases |
| Content | Repository JSON and static media, separate language banks; shared vocabulary and pictures can support later languages |
| Audio | Eight approved ElevenLabs voices; constant-gain matching around −22 LUFS with true-peak headroom; constrained clips retain review notes |
| Hosting | Public GitHub repository, GitHub Actions, and GitHub Pages at `kikimashta.com` |
| Code license | GNU AGPLv3 only; media exceptions recorded in notices and provenance |

Keep the interface, learning rules, content, and storage separate. Speech providers can vary by language. Coordinate through [AGENTS.md](AGENTS.md), GitHub Issues, and linked pull requests.

## Learning and workload policy

Correctness maps to Good/Again; speed and replay use are recorded without grading speed. Existing fixed-round attempts remain unchanged and surface known picture cards for review without inventing delayed-retention evidence. Personal parameter fitting waits for enough relevant history.

The due queue is fixed at session start. Newly due reviews wait for a later session, preserving their actual FSRS due times. Valid future-dated history from clock differences waits for its original review/due times, stays known for lesson admission, and keeps its saved timestamps. Unrelated practice remains available (#117). Lesson previews introduce cards before a shuffled mini-quiz; learning a picture card does not mark its writing card learned.

Forecast reviews over seven days with 32 deterministic scenarios, one session per day, and an initial 80% lesson success assumption. Qualitative bands are Minimal, Light, Moderate, High, and Intense. Preferred minimum and maximum guide new intake; they cannot guarantee future demand. Thresholds, forecast assumptions, chunk size, and choice count remain adjustable. The user can always stop.

Spacing and retrieval practice have research support; this density controller and FSRS for audio-choice recognition still need evaluation through use. Picture recognition and writing recognition are distinct skills, separate from fluent comprehension. References: [spacing meta-analysis](https://doi.org/10.1111/lang.12479), [aural vocabulary with picture choices](https://doi.org/10.1037/mac0000174), [FSRS model documentation](https://open-spaced-repetition.github.io/ts-fsrs/guide/model/).

## Testing and release

- `npm run check` runs lint, type checks, Vitest/React Testing Library, JavaScript script tests, Python audio/artwork tests, the card metadata validator, and the production build. Focused tests stay beside the code.
- After building, `npm run test:e2e` checks Chromium and mobile WebKit journeys in `e2e/`, including complete sessions, actual IndexedDB persistence, both exercise formats, pack selection, failed audio, notes, and account isolation/convergence against a simulated HTTP service.
- `npm run test:cards` runs the artwork preparation regressions and content/dependency validator. It is included in `npm run check`, so invalid metadata blocks required CI. Preparation and media generation remain manual.
- Tests must be deterministic, isolated, and assert observable behavior. Use small fixtures, control time and randomness, mock external boundaries, and fix flaky tests instead of adding retries.
- The active GitHub ruleset requires `checks`, `database`, and a current `codex-review`, plus resolved conversations. Deployment follows successful main checks. See [merge rules](docs/MERGE_RULES.md) and [deployment recovery](docs/DEPLOYMENT.md).
- Verify pronunciation, playback, touch, layout, and VoiceOver on the real iPhone at playable milestones and releases. Hosted SQL checks and browser tests do not replace device acceptance.

## Language framework (#143)

Add a small registry of learning languages, each owning its practice pool, packs, and writing presentation. The home language selector scopes all practice and remembers the language and per-language pack selection on this device. Preserve existing Japanese identifiers and preferences. Progress and notes already include language identity. Latin American Spanish (`es-419`) is the second language, with a Travel level 1 picture pack (six vocabulary items). Reuse existing suitable artwork. Six Mexican Spanish recordings from ElevenLabs are generated and volume-matched, with originals and provenance preserved; owner pronunciation and real-iPhone acceptance remain pending. The owner will perform iPhone testing on the deployed version; a phone-accessible local preview is deferred. Menus stay in English; later travel levels remain flexible. Following owner demo feedback, use a single styled language control with a globe and chevron, and remove Spanish vocabulary writing packs for now. Reserve written Spanish answers for future contextual exercises; retain any existing writing history. Add a language-scoped card-library link so the Spanish travel pack can be inspected with pictures, Spanish text, English meanings, audio playback, search and notes, reusing the existing library. Keep unavailable content explicit and do not substitute Japanese audio. Cover switching, persistence, and isolation in focused and browser tests.

## Later work

- Continue artwork regeneration and feedback in [#72](https://github.com/ajhconway/kikimashta/issues/72). Preserve approved sources, rejected variants, restrictions, and stable IDs. Review semantic choice policies separately in [#79](https://github.com/ajhconway/kikimashta/issues/79); artwork approval does not resolve contextual ambiguity.
- [#48](https://github.com/ajhconway/kikimashta/issues/48) remains the flexible roadmap for phrases, sentences, contextual exercises, timing challenges, English text, and offline practice. Audio-to-writing cards and font variation have already shipped.

Keep only the next milestone detailed. Avoid fixed dates and commitments to every later exercise. Evaluate learning and workload predictions through use before adding complexity.


## Adaptive timer pilot (#121)

Timers adapt per language, vocabulary item, and exercise. Lessons, new/learning cards, and corrective retries stay untimed. Review timers now follow the interval mastery levels defined in #135 below. This is an adjustable pilot policy, not a validated fluency measure.

Unsaved Dev review samples untimed/10/5/3/1.5 seconds with equal probability for each presentation, including retries, regardless of mastery. Replays keep that question's selected limit and deadline. This lets the pilot feedback be tried without altering learning history.

Start the countdown after the recording ends, all choices have entered, and their pictures have loaded. Replays do not pause or reset it. Elapsed wall time continues while the page is hidden. Expiry never submits an answer or ends a quiz: a late correct answer is partial success and completes the question; an incorrect answer remains a failure with an untimed corrective retry.

Show elapsed time as soft amber filling the background from top to bottom. Use a browser-native linear transform animation for smooth visual progress; keep the wall-clock expiry and grading independent, and realign the visual when visibility changes (#128). Give partial success an amber response, a gentle card/companion wobble, slower outward departures that curve downward over 1.1 seconds, and a distinct badge and message; respect reduced motion. Keep full-success and failure responses. Count partial successes as completed questions and identify their count in the summary.

Persist explicit outcomes and the countdown limit/start alongside existing attempt timing. FSRS policy v2 maps success/partial/failure to Good/Hard/Again, retains v1 historical grading, and still excludes corrective retries from retention evidence. Local history and sync preserve the optional new fields without rewriting old attempts; the existing JSON payload constraint accepts these additions. Already-open v1 clients need a refresh before syncing v2 history. Review timing thresholds, exercise differences, and feedback after deployment and real iPhone use in [#122](https://github.com/ajhconway/kikimashta/issues/122).

## Interval mastery (#135)

Derive mastery independently for each language/item/exercise from the scheduled gap between last review and next due date, never time remaining. New cards have no review evidence. Levels: Learning <4 hours, Improving <1 day, Familiar <7 days, Steady <30 days, Strong <90 days, Confident <365 days, Mastered thereafter. Months use fixed 30/90-day boundaries.

Show both lowest and average mastery on packs; average means the floor of the mean level ordinal, including New cards, across approved practice cards in that pack. Keep picture and writing cards separate in the library and show their individual mastery. Show an up/down arrow and the new label after a saved answer changes level; retries and Dev review do not change mastery.

Attach timers to these levels: New/Learning untimed, Improving/Familiar 10 seconds, Steady 5 seconds, Strong 3 seconds, Confident/Mastered 1.5 seconds. Lessons and corrective retries remain untimed. Dev review samples the available timer choices. Mastery is derived from existing history without a storage migration. Test boundaries, aggregation, answer transitions, identity separation, timers, library display, and browser persistence; real iPhone acceptance remains manual.

## Mastery demo (#140)

Offer an unsaved Mastery demo alongside the existing random-timer Dev review. The demo presents all eight levels in order, using selected-pack cards and separate in-memory sample schedules. Show the current sample level and its timer; after answers, use the normal FSRS grading and mastery arrows against the sample schedule. Corrective retries stay untimed and do not advance the sample schedule. Keep all sample state separate from real mastery, saved attempts, account sync, and library/pack summaries. If a selected pool is small, repeat cards with separate demo identities so every level remains available. Verify all levels, timer mapping, arrows, retry isolation, and unchanged real browser storage. Serve the completed demo locally for owner review.

## Mastery feedback presentation (#141)

Replace the visible answer slogans with a prominent level-change badge: a direction arrow and the new mastery label, without extra Level up/down text. Level ups use a brief pop and sparkle animation; decreases use a gentler downward entrance. When mastery does not change, keep a simple outcome symbol and a screen-reader announcement. Preserve save gating, grading, question timing, reduced-motion support, and the existing feedback space so cards and Continue remain steady. Use a solid pink fill from the app’s palette for level ups, without a gradient. Keep the enlarged arrows and labels while restoring the earlier card sizes and quiz spacing. Fit the caption-free badges into the original reserved feedback area without moving cards or Continue after an answer. Show the current mastery level and effective timer duration in larger text at the bottom, inside the feedback area. Level-change badges cover that text after an answer, including for saved reviews and the unsaved mastery demo. Keep demo-only explanatory text out of the visible quiz header. Update the demo and ordinary review checks for the new presentation.
## Contextual listening pilot (#119)

The owner approved this plan on November 8, 2026. Track the milestone in [#119](https://github.com/ajhconway/kikimashta/issues/119), under the broader exercise roadmap (#48).

### Experience

Play a Japanese sentence containing the target word, pause briefly, then play a Japanese question about it. Start with simple contexts containing one short event or fact and direct questions. Later introduce contrastive contexts requiring the learner to keep multiple facts straight. Support both questions whose answer is the target word and questions about another detail of its sentence. Offer pictures or Japanese written choices, with one answer format per presentation. Each authored question declares the formats for which it has clear choices. The existing approved audition examples form the contrastive material.

The owner revised the contextual presentation after actual iPhone and Mac use: match the existing word-review layout and controls. Correct answers show compact success feedback and advance automatically like word reviews, with no transcript or explanation. After a miss, keep Continue manual; offer Show Japanese for the sentence/question and an optional English reveal after that. Keep the answer grid stable, use the existing replay/companion/card styling, and avoid extra panels, visible instruction headings and repeated readings. Lesson previews and the full content-inspection review retain access to their authored details. Keep the target vocabulary identity separate from the correct answer identity.

### Content

Use a separate authored contextual bank referencing existing stable vocabulary IDs. Store stable sentence and question IDs, revisions, Japanese text/readings, English meanings, paired recordings, explicit answer options and correct option, grammar requirements, supporting vocabulary, and review state. A sentence may support several questions and a target may have several sentence variants. Record inflected target occurrences explicitly where needed.

Keep grammar roughly within Genki I and supporting vocabulary in an everyday beginner-friendly range; words beyond existing cards are allowed. Tag sentence, question and answer requirements so grammar filtering can become user-configurable later. The [publisher's syllabus](https://bookclub2.japantimes.co.jp/download/files/genki3/genki-3rd_syllabus_E.pdf) is a scope reference. The pilot does not add a grammar-settings interface.

Author plausible distractors for each question. Check natural Japanese, one defensible answer, target relevance, and comparable difficulty across variants. Reuse existing pictures when they clearly represent an answer; picture approval does not establish sentence or question readiness. Prepare drafts ahead of time rather than generating quizzes in the browser.

### Learning and progress

Progress per word from word recognition to simple contextual practice, then contrastive contextual practice. Gate advancement using the FSRS-assigned next review interval, with an initial configurable threshold of strictly more than seven days. In the current scheduler adapter this interval is `dueAt - lastReviewedAt`; compare it with `7 * 24 * 60 * 60 * 1000`. Use the interval assigned after a saved, correct first attempt in a scheduled review. Initial lessons, corrective retries, unsaved dev review and time merely passing do not earn a stage unlock. This replaces the proposed fixed review-count and minimum-variant-count gate.

For word recognition to simple context, either existing word-picture or word-writing card can earn the threshold, preserving the agreed prerequisite relationship. For simple to contrastive context, the prerequisite is the same language, target word and answer format's simple contextual card. Evaluate mastery through the scheduled interval rather than directly substituting the card's stability value. Keep grammar requirements separately tagged from contextual stage difficulty.

Once a qualifying interval earns an unlock, retain it. Later misses adjust the appropriate FSRS schedule while preserving earned stage access. Reaching the threshold makes the next stage eligible for later new-card admission; selected vocabulary scope, fixed active-session snapshots and existing workload limits still apply. Keep the initial seven-day threshold adjustable without adding a settings interface to this pilot.

Keep independent schedules for each language, target word, contextual stage and answer format, separate from existing word-picture and word-writing progress. Comparable sentence/question variants share their target/stage/format schedule. Adding variants does not add scheduled cards.

Log the contextual stage, exact sentence/question IDs and revisions, question kind, ordered choices, correct and selected answers, paired recordings, replays and learning phase on each immutable attempt. Attribute progress to the target exercise even when the answer is another word or phrase. Preserve the chosen sentence, question and recordings for replay and corrective retries; later reviews may choose another approved variant. Corrective retries remain distinct from delayed retention evidence. Admit only approved contextual content with usable media. Preserve existing history and the fixed active-session snapshot.

### Pilot sequence and approval gates

1. Publish this plan and its issue before implementation.
2. Prepare about ten currently eligible target words with two or three sentence contexts each, covering both question kinds and answer formats. Supply a readable review of all sentences, questions, translations and choices, plus deterministic structural/content validation.
3. Obtain owner approval of the actual pilot text before generating speech. Plan approval is not text or media approval.
4. After text approval, generate a small sentence/question audio batch using approved voices. Preserve originals, exact text/settings and provenance; review pronunciation, rhythm, pause and volume before expanding the batch.
5. Integrate ordered playback and recovery, manual contextual feedback, explicit-answer grading, stable retries, automatic unlocks, eligible cards, workload accounting and independent persisted progress.
6. Complete real-iPhone listening and interaction acceptance before expanding coverage.

Authored banks stay separate from runtime media acceptance. Pending or rejected text and missing/unreviewed recordings cannot become ordinary practice questions. Accepted contexts enter practice only through their stage prerequisites and normal new-card admission.

The text pilot is in `content/contextual/ja-pilot.json`: ten targets, twenty contexts, and forty questions, including sixteen picture-capable questions. All forty support written choices. The owner approved the actual text for the first audio sample; `content/contextual/text-approval.json` binds approval to the reviewed text digest and source snapshot. Validate with `npm run content:contextual:validate` and build the local gallery with `npm run content:contextual:review`; append `-- --github` to print the GitHub review. Declared answer formats reflect actual choice coverage: car, teacher and running contexts initially support writing only. Position-icon transfer and the older beer distractor picture remain explicit owner-review points.

The first audio sample ([#124](https://github.com/ajhconway/kikimashta/issues/124)) covers three contexts in Otani and Morioki: eighteen provider-original clips and twelve sentence/question WAV previews with a 650 ms gap. The previews decode volume-matched MP3 deliveries without additional lossy encoding; all eighteen deliveries meet the approved profile without level limitations. The owner accepted the simple/contrastive comparison. Review assets stay in `artifacts/contextual-audio-review/first-sample/`; `content/contextual/accepted-media.json` records the separate listening acceptance and verified normalized practice deliveries.

The simple comparison ([#133](https://github.com/ajhconway/kikimashta/issues/133)) adds three short counterparts for 上, 水 and 走る in `content/contextual/ja-simple-pilot.json`, with six questions and explicit links to the existing contrastive contexts. The owner approved this actual text for generation; `content/contextual/simple-text-approval.json` binds it to the reviewed digest and source snapshot. The accepted simple audio sample ([#136](https://github.com/ajhconway/kikimashta/issues/136)) contains eighteen provider-original Otani/Morioki clips and twelve paired WAV previews with the same 650 ms pause. All eighteen normalized deliveries meet the approved volume profile without level limitations; originals, exact requests and normalization records are privately archived. These three simple and three contrastive contexts are available to gated practice.

`npm run content:contextual:validate` checks all three authored banks. `npm run content:contextual:comparison` builds `artifacts/contextual-audio-review/first-sample/simple-comparison.html`, showing text, readings, meanings, choices and both stages' recordings. Simple previews and provenance live in its `simple-audio/` subdirectory. The original contrastive bank, approval and recordings remain intact. Audio generation and preview building accept `--stage simple`; the default remains the original contrastive audition.

### Acceptance

The owner accepted the simple/contrastive audio comparison and approved expansion to ten targets (上, 下, 大きい, 小さい, 本, 水, コーヒー, 車, 先生, 走る), with two variants per word and stage and two question kinds per context: forty contexts and eighty questions. The seventeen additional simple contexts live in `content/contextual/ja-simple-expansion.json`; their actual text was approved in [this review](https://github.com/ajhconway/kikimashta/issues/139#issuecomment-6725981021), bound by `expansion-text-approval.json`. Generation uses `--batch expansion` to select only the seventeen remaining contexts per stage, preserving the sample plans and recordings.

Implement progression and a dedicated contextual dev review in [#139](https://github.com/ajhconway/kikimashta/issues/139). The dev review covers every authored question with stage, word, question-kind and format filters, direct navigation, replay and manual feedback. It bypasses mastery and workload for evaluation, saves no attempts and earns no unlocks. Draft or missing-audio content supports explicitly marked text inspection; only approved text and accepted audio enters ordinary practice. Share the contextual interaction between dev and scheduled practice, preserving sentence/question order, replay, cancellation and retry identity. Keep existing word practice intact and preserve contextual history through account sync.

The implementation is in [#142](https://github.com/ajhconway/kikimashta/pull/142). Open `?review=contextual` for the complete dev review; it bypasses selected packs and mastery for evaluation while regular practice retains both. Contextual lessons keep the same sentence/question/voice through preview and mini-quiz. `generated-media.json` stages deliveries awaiting listening review; accepted entries move to `accepted-media.json` with the owner's evidence and earlier acceptance history preserved. The owner authorized pilot release, and the contextual-attempt database migration is applied as hosted `20261108202250_contextual_attempts`; see [activation evidence](docs/SUPABASE.md#contextual-progression-release-139). Isolated PostgreSQL CI validates the migration and account isolation. Real-iPhone release verification remains pending.

All forty contexts and eighty questions now have Otani/Morioki audio: 240 normalized MP3 clips in total. The expansion added 204 provider-original clips for 2,996 Japanese characters; all 204 deliveries meet the approved loudness/peak profile without level limitations. Source identity, normalization and complete decode passed before preparation of the 136 new paired previews and public dev-review deliveries. Private originals and normalization records are archived and hash-verified. All 240 MP3s passed native Chromium/WebKit playback checks. The owner [accepted the full dev review](https://github.com/ajhconway/kikimashta/issues/139#issuecomment-6726427897). All forty contexts are now eligible for ordinary practice through the agreed FSRS stage gates, selected scope and workload limits: eighty writing-capable questions, thirty-two picture-capable questions, and thirty-four independently scheduled stage/format cards. Variants share schedules, and the dev review remains unsaved.

Cover questions whose answer differs from their target; sentence/question ordering, replay and cancellation; failure in either audio segment; feedback text staying readable until Continue; stable corrective retries; interval boundaries below, exactly at and above seven days; qualifying scheduled-review unlocks and retained access after later misses; target/language/format/stage isolation; selected scope and workload; independent contextual schedules; legacy history and real browser persistence. Validate the authored bank and each supported answer format, including clear picture semantics. Run the configured lint, types, focused tests, production build and appropriate Chromium/WebKit journeys. Browser emulation supplements real-iPhone acceptance.

## Pack selection in the library (#146)

Choose practice packs in the card library alongside pack mastery summaries. Keep browsing filters independent of practice selection and preserve the existing device preference. Home links to the library with the selected count; empty selection disables practice. Verify saved selection, browser return/reload, format scoping, and storage failure feedback.

## Global practice voices (#148)

Select one or more of the eight approved voices in the card library, remembered on this device. All voices are enabled by default. Each new presentation randomly selects among preferred recordings; replays keep their recording. If no preferred voice exists for a card, use its available recordings. Keep library auditions independent, reject empty selections, report storage failures, and verify reload/return, both formats, demos, and saved recording identity.

## Voice accent labels (#149)

Show accent/style descriptions beside each global practice voice and card audition button. Display the owner’s Tokyo (standard) label for Otani/Morioki, Kansai for Goro/Tsuki, Kyushu for Takeshi/Lime, and Anime (standard) for Ritsuto/Itsuki. Reuse the approved registry’s accent and anime-style metadata. Keep labels visible through playback and expose them as accessible descriptions. Voice identity and saved preferences stay unchanged.

## Contextual practice evaluation (#145)

The owner completed reviews and lessons without seeing contextual cards and wants to evaluate their actual session presentation. Investigate earned unlocks, selected scope and workload admission before changing the normal progression policy. Keep the existing fixed-session rules unless the investigation justifies a documented correction.

Add a clearly unsaved contextual practice demo using the normal App quiz, feedback, retries, progress and summary, with bounded simple/contrastive picture/writing examples. It bypasses admission only for evaluation, keeps all real history and account sync untouched, and is directly accessible from Home and a shareable query link. Home reports unlocked contextual lesson cards in the selected scope and whether the workload ceiling is holding new lessons back. The existing full content review remains available. Verify isolation with real browser storage and regression checks; track work in [#145](https://github.com/ajhconway/kikimashta/issues/145).

The owner reviewed the contextual practice on iPhone and Mac and requested a simpler presentation in #145. Correct contextual answers now follow the ordinary automatic-advance timing and save/audio recovery gates; mistakes retain manual Continue and optional Japanese → English disclosure. Update the shared practice UI and corresponding browser regressions before publishing this follow-up.
