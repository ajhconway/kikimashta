# Listening practice app plan

A personal listening game, starting with Japanese and leaving room for other languages. Focused and chill, with understated charm. V0 should feel good enough to repeat; complete polish can come later.

## V0 experience

- A fixed mixed word bank organized into themes such as food, animals, and household objects. Default starting level: some basics.
- Introduce words with pictures and Japanese audio, then offer short, untimed sessions: hear a word and choose one of *k* pictures.
- Give clear feedback and a satisfying session ending. Save per-word results and individual practice attempts.
- Use pictures and audio by default. Require an internet connection initially.

## Implementation

| Part | Choice |
| --- | --- |
| App | React, TypeScript, and Vite; prioritize Safari on iPhone 17 |
| Local progress | IndexedDB, with stable item and attempt IDs, answers, picture choices, and timing |
| Content | JSON files and media in the repository; separate word banks and progress by language |
| Audio | Reusable, pregenerated ElevenLabs speech in eight approved voices; constant-gain volume matching around −22 LUFS with true-peak headroom ([#86](https://github.com/ajhconway/kikimashta/issues/86)) |
| Pictures | Start with AI-generated illustrations; also support library images and reuse suitable pictures across languages |
| Hosting | Public GitHub repository, GitHub Actions, and GitHub Pages |
| Code license | GNU AGPLv3 only (AGPL-3.0-only); separately licensed media retain their terms |

Keep the quiz interface, learning rules, and storage separate so each can evolve. Speech providers can vary by language.

Coordinate agent work through [AGENTS.md](AGENTS.md), GitHub Issues, and linked pull requests.

## Testing

- Use Vitest for quiz rules, content validation, and progress logic, plus React Testing Library for user interactions. Keep these tests beside the code.
- Keep a small Playwright suite in `e2e/`, checking the built app in WebKit and Chromium. Cover a complete session, real IndexedDB persistence after reload, and important failure paths.
- Keep tests readable, isolated, and deterministic, with small fixtures and controlled time and randomness. Assert observable behavior, mock external boundaries, and fix flaky tests. Use coverage to find important gaps.
- Each agent includes relevant tests with its changes. Review test quality and integration; require lint, type checks, tests, and a production build in GitHub Actions before merging or deploying.
- Check pronunciation, playback, touch interactions, and layout on the actual iPhone at playable milestones and before releases.

## Roadmap

Adaptive practice is playable and accepted. The 440-card review library is available, with 170 eligible words in adaptive lessons. The next milestone is optional sign-in and progress sync.

1. **Expand practice** ([#46](https://github.com/ajhconway/kikimashta/issues/46)). Bring a manageable selection from the library into lessons and quizzes. Start with small, coherent sets, use card feedback to improve them, and keep source levels provisional.
2. **Add adaptive review** ([#47](https://github.com/ajhconway/kikimashta/issues/47)). Revisit words when they need practice and gradually introduce new ones. Use FSRS for per-word scheduling and forecast review density to guide new-word intake.
3. **Sync progress** ([#6](https://github.com/ajhconway/kikimashta/issues/6)). Add Supabase sign-in and cross-device sync, preserving existing history and including card feedback.
4. **Broaden the exercises** ([#48](https://github.com/ajhconway/kikimashta/issues/48)). Introduce phrases, sentences, and other quiz formats. Explore timing challenges, Japanese writing, and offline practice as separate additions. English text remains an option.

### Audio-to-writing cards (#99)

Add a separately scheduled audio-to-writing card for each eligible vocabulary item, reusing its authored Japanese text and existing recordings. Shuffle picture and writing cards together in lesson previews, lesson mini-quizzes, due reviews, and dev review. Each question offers only pictures or only writing. Preserve playback, feedback, retries, and summaries.

Keep card identity specific to language, vocabulary item, and exercise. Existing attempts remain picture-card history. Forecast workload and admit lessons per card; a learned picture card does not exclude its new writing card. Preserve both exercise types through local persistence and account sync. Test mixed lessons/reviews, distinct unambiguous written options, independent schedules, legacy history, retries, and browser persistence.

Writing size scales with the number of displayed characters and the card dimensions: a single character is large, while longer kanji, hiragana, katakana, and mixed text get progressively smaller. Apply this consistently in previews, choices, and feedback. Font selection is a separate follow-up after this PR.

### Current milestone: progress sync

Add optional Supabase email sign-in and sync practice history and card notes across devices. Save locally first, retry interrupted sync, and prevent duplicate attempts. Keep each account's data separate; offer an explicit copy of existing local progress into the signed-in account. Preserve local-only practice and the unsaved dev review. Keep the account controls small and the active quiz unchanged by incoming sync.

The Supabase project is connected and its schema and access policies pass the hosted SQL checks. Resend SMTP and email-code templates are configured; live signup, later sign-in, and note edit/deletion convergence pass in isolated Chromium browsers. Complete release deployment and real iPhone verification; interrupted-transfer and account-isolation journeys remain covered by CI and hosted SQL checks. Track activation in [docs/SUPABASE.md](docs/SUPABASE.md).

### Adaptive practice reference

Replace fixed practice sets with adaptive sessions. Preserve stable item IDs and existing history.

- **Scheduler:** use FSRS with shared defaults, adapting each word after answers. Fit personal parameters once enough relevant history accumulates. Start with correctness; record replay use and timing without grading speed. Keep scheduling separate from session and workload policies.
- **Session:** snapshot the due queue at the start, complete that review block, then enter the lesson block. Shuffle missed quiz words back into their block until each is answered correctly. Save every answer, distinguishing immediate corrective retries from retention evidence. Newly due reviews wait for a later session; preserve FSRS due times.
- **Lessons:** introduce roughly ten words through pictures and audio, then give a shuffled mini-quiz of those words. This is initial learning; later reviews measure retention over time.
- **Density:** forecast reviews per day over the coming days, including repeat reviews. Offer lesson chunks toward the user's minimum; between minimum and maximum offer Finish or another chunk; at maximum stop introducing words. Smaller chunks can accommodate the maximum or a limited eligible pool. The user can always stop.
- **Presentation:** show Minimal, Light, Moderate, High, or Intense, with colors and potentially matching Kiku expressions. Show minimum, current, and maximum side by side. Each intensity is a complete wheel choice with its own Kiku, fixed color and label; keep all choices visible, disabling those outside the valid range. Use the same qualitative levels for the preferred range. Numeric thresholds and the forecast window remain adjustable; the maximum controls new intake rather than guaranteeing future workload.
- **Validation:** check delayed predictions against later first-attempt results. Picture-choice recognition is a specific skill, distinct from fluent comprehension. Preserve exercise context so later quiz formats can be evaluated separately.

Spacing and retrieval practice have research support; our density controller and the application of FSRS to audio-to-picture recognition need evaluation through use. References: [language-learning spacing meta-analysis](https://doi.org/10.1111/lang.12479), [aural vocabulary with picture choices](https://doi.org/10.1037/mac0000174), [FSRS model documentation](https://open-spaced-repetition.github.io/ts-fsrs/guide/model/).

Implementation proceeds through scheduling/history, workload forecasting, then the session interface. Keep forecast assumptions, density thresholds, and new-word selection explicit and adjustable.

Keep only the next milestone detailed in GitHub. Later stages remain flexible, with no fixed dates. Keep *k*, word counts, session length, visual details, and the learning algorithm adjustable.

## Writing font variation (#101)

Use Noto Sans JP consistently for lesson previews, their attached mini-quizzes, and lesson corrective retries. Later review quizzes (including dev review) rotate Noto Serif JP, Zen Maru Gothic, and Klee One on successive presentations of each language/item. All choices in a question use one stable font through replay and feedback. Lesson presentations do not consume review rotation. Preserve existing card sizing and shared learning progress. Self-host fonts with licenses and glyph coverage records; use the standard font for the whole question when a review font cannot cover its writing. Store only a local appearance preference across visits; unavailable storage never blocks practice.

## Selectable card packs (#108)

Organize the WaniKani library into ten packs: levels 1–5, separately for pictures and writing. Allow any combination for practice and remember the selection on this device. Apply it to lessons, due reviews, dev review, answer choices, and workload forecasting, while preserving all saved history and stable language/item/exercise identities. Keep the existing approved practice subset; browsing a pack does not approve additional content. Remove the two starter packs and retire starter-only words from active practice (#111). Retain their saved history, and keep WaniKani words with shared starter IDs and assets available. Restored pack preferences discard retired starter selections.

## Contextual listening pilot (#119)

The owner approved this plan on November 8, 2026. Track the milestone in [#119](https://github.com/ajhconway/kikimashta/issues/119), under the broader exercise roadmap (#48).

### Experience

Play a Japanese sentence containing the target word, pause briefly, then play a Japanese question about it. Start with simple contexts containing one short event or fact and direct questions. Later introduce contrastive contexts requiring the learner to keep multiple facts straight. Support both questions whose answer is the target word and questions about another detail of its sentence. Offer pictures or Japanese written choices, with one answer format per presentation. Each authored question declares the formats for which it has clear choices. The existing approved audition examples form the contrastive material.

After answering, reveal the Japanese sentence and question, their English meanings, and the correct answer. Keep contextual feedback visible until Continue, with replay available. Keep the target vocabulary identity separate from the correct answer identity.

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

The text pilot is review content, not an active practice pack. Pending or rejected text and missing/unreviewed recordings cannot become ordinary practice questions.

The text pilot is in `content/contextual/ja-pilot.json`: ten targets, twenty contexts, and forty questions, including sixteen picture-capable questions. All forty support written choices. The owner approved the actual text for the first audio sample; `content/contextual/text-approval.json` binds approval to the reviewed text digest and source snapshot. Validate with `npm run content:contextual:validate` and build the local gallery with `npm run content:contextual:review`; append `-- --github` to print the GitHub review. Declared answer formats reflect actual choice coverage: car, teacher and running contexts initially support writing only. Position-icon transfer and the older beer distractor picture remain explicit owner-review points.

The first audio sample ([#124](https://github.com/ajhconway/kikimashta/issues/124)) covers three contexts in Otani and Morioki: eighteen provider-original clips and twelve sentence/question WAV previews with a 650 ms gap. The previews decode volume-matched MP3 deliveries without additional lossy encoding; all eighteen deliveries meet the approved profile without level limitations. Listening approval, full-bank generation, gameplay/progress integration, and real-iPhone acceptance remain pending. Review assets stay in `artifacts/contextual-audio-review/first-sample/`; ordinary practice remains unchanged. The approved text and both approval states are separate from later media acceptance.

The simple comparison ([#133](https://github.com/ajhconway/kikimashta/issues/133)) adds three short counterparts for 上, 水 and 走る in `content/contextual/ja-simple-pilot.json`, with six questions and explicit links to the existing contrastive contexts. The owner approved this actual text for generation; `content/contextual/simple-text-approval.json` binds it to the reviewed digest and source snapshot. The simple audio sample ([#136](https://github.com/ajhconway/kikimashta/issues/136)) contains eighteen provider-original Otani/Morioki clips and twelve paired WAV previews with the same 650 ms pause. All eighteen normalized deliveries meet the approved volume profile without level limitations; originals, exact requests and normalization records are privately archived. Listening approval remains pending, and no practice recordings are activated.

`npm run content:contextual:validate` checks both banks. `npm run content:contextual:comparison` builds `artifacts/contextual-audio-review/first-sample/simple-comparison.html`, showing text, readings, meanings, choices and both stages' recordings. Simple previews and provenance live in its `simple-audio/` subdirectory. The original contrastive bank, approval and recordings remain intact. Audio generation and preview building accept `--stage simple`; the default remains the original contrastive audition. Compare both tiers before gameplay integration.

### Acceptance

Cover questions whose answer differs from their target; sentence/question ordering, replay and cancellation; failure in either audio segment; feedback text staying readable until Continue; stable corrective retries; interval boundaries below, exactly at and above seven days; qualifying scheduled-review unlocks and retained access after later misses; target/language/format/stage isolation; selected scope and workload; independent contextual schedules; legacy history and real browser persistence. Validate the authored bank and each supported answer format, including clear picture semantics. Run the configured lint, types, focused tests, production build and appropriate Chromium/WebKit journeys. Browser emulation supplements real-iPhone acceptance.
