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

Adaptive practice is playable and accepted. The 441-card review library is available, with 170 eligible words in adaptive lessons. The next milestone is optional sign-in and progress sync.

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

Use Noto Sans JP, Noto Serif JP, and Klee One for writing. Rotate through the pool on later presentations of each language/item, including previews and corrective retries; all choices in a question use one stable font through replay and feedback. Keep existing card sizing and shared progress. Self-host the reviewed fonts with licenses and glyph coverage records. Store only a small local appearance preference to carry rotation across visits; unavailable storage never blocks practice. Zen Maru Gothic remains an optional future addition.
