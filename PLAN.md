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

Add a small registry of learning languages, each owning its practice pool, packs, and writing presentation. The home language selector scopes all practice and remembers the language and per-language pack selection on this device. Preserve existing Japanese identifiers and preferences. Progress and notes already include language identity. Latin American Spanish (`es-419`) is the second language, with a Travel level 1 picture pack (six vocabulary items). Reuse existing suitable artwork. Six Mexican Spanish recordings from ElevenLabs are generated and volume-matched, with originals and provenance preserved; owner pronunciation and real-iPhone acceptance remain pending. Menus stay in English; later travel levels remain flexible. Following owner demo feedback, use a single styled language control with a globe and chevron, and remove Spanish vocabulary writing packs for now. Reserve written Spanish answers for future contextual exercises; retain any existing writing history. Add a language-scoped card-library link so the Spanish travel pack can be inspected with pictures, Spanish text, English meanings, audio playback, search and notes, reusing the existing library. Keep unavailable content explicit and do not substitute Japanese audio. Cover switching, persistence, and isolation in focused and browser tests.

## Later work

- Continue artwork regeneration and feedback in [#72](https://github.com/ajhconway/kikimashta/issues/72). Preserve approved sources, rejected variants, restrictions, and stable IDs. Review semantic choice policies separately in [#79](https://github.com/ajhconway/kikimashta/issues/79); artwork approval does not resolve contextual ambiguity.
- [#48](https://github.com/ajhconway/kikimashta/issues/48) remains the flexible roadmap for phrases, sentences, contextual exercises, timing challenges, English text, and offline practice. Audio-to-writing cards and font variation have already shipped.

Keep only the next milestone detailed. Avoid fixed dates and commitments to every later exercise. Evaluate learning and workload predictions through use before adding complexity.


## Adaptive timer pilot (#121)

Timers adapt per language, vocabulary item, and exercise. Lessons, new/learning cards, and corrective retries stay untimed. Established review cards use FSRS stability in days: below 1 stays untimed; at 1/3/7/21 days use 10/7/5/3 seconds. This is an adjustable pilot policy, not a validated fluency measure.

Unsaved Dev review samples untimed/10/7/5/3 seconds with equal probability for each presentation, including retries, regardless of mastery. Replays keep that question's selected limit and deadline. This lets the pilot feedback be tried without altering learning history.

Start the countdown after the recording ends, all choices have entered, and their pictures have loaded. Replays do not pause or reset it. Elapsed wall time continues while the page is hidden. Expiry never submits an answer or ends a quiz: a late correct answer is partial success and completes the question; an incorrect answer remains a failure with an untimed corrective retry.

Show elapsed time as soft amber filling the background from top to bottom. Use a browser-native linear transform animation for smooth visual progress; keep the wall-clock expiry and grading independent, and realign the visual when visibility changes (#128). Give partial success an amber response, a gentle card/companion wobble, slower outward departures that curve downward over 1.1 seconds, and a distinct badge and message; respect reduced motion. Keep full-success and failure responses. Count partial successes as completed questions and identify their count in the summary.

Persist explicit outcomes and the countdown limit/start alongside existing attempt timing. FSRS policy v2 maps success/partial/failure to Good/Hard/Again, retains v1 historical grading, and still excludes corrective retries from retention evidence. Local history and sync preserve the optional new fields without rewriting old attempts; the existing JSON payload constraint accepts these additions. Already-open v1 clients need a refresh before syncing v2 history. Review timing thresholds, exercise differences, and feedback after deployment and real iPhone use in [#122](https://github.com/ajhconway/kikimashta/issues/122).
