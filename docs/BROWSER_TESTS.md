# Browser journey coverage (#202)

Keep browser journeys focused on integration boundaries that need a real engine:
native media, browser storage, layout/fonts, pointer/keyboard input and navigation.
Run the required suite in both Chromium and mobile WebKit, with zero retries.
Exhaustive content and learning-rule permutations belong in focused tests.

## Consolidated coverage

| Boundary | Browser journey | Focused coverage for additional permutations |
| --- | --- | --- |
| Complete lesson and mixed-format persistence | `practice.spec.ts`: complete ten-card picture/writing lesson, summary and reload | `App.test.tsx`, `core/session.test.ts`, `core/scheduler.test.ts` |
| Review snapshot and corrective retry | `practice.spec.ts`: two due formats, writing miss/retry, reload and a later-added card in the next session | `App.test.tsx`, `core/session.test.ts` |
| Contextual introduction and later review | `contextual.spec.ts`: first encounter, explicit answers/revisions, stable retry audio, translation dialog, reload and scheduled review | `App.contextual.test.tsx`, `core/contextual-progression.test.ts` |
| Native timers and reduced motion | `quiz-timer.spec.ts`: normal picture and reduced-motion writing; `dev-review.spec.ts`: paired-audio countdown | `App.test.tsx`, `core/quiz-timer.test.ts`, `components/ContextualQuiz.test.tsx` |
| Unsaved Dev review | `dev-review.spec.ts`: configured word/contextual interaction and unchanged real browser history | `App.test.tsx`, `core/dev-review.test.ts` cover full rounds, random timers and retries |
| Language, pack and voice preferences | `languages.spec.ts`, `voices.spec.ts`: representative scoped answers, selected recordings, reload and independent language preferences | `core/languages.test.ts`, `core/packs.test.ts`, `core/spanish-packs.test.ts`, `core/voices.test.ts` cover every pack and accepted media |
| Library navigation and media recovery | `contextual-library.spec.ts`: old-link redirect, Back/reload, native failure then complete ordered retry, cancellation and unchanged history | `components/ContextualLibrary.test.tsx` covers filters, authored details and playback cancellation permutations |
| Clock skew | Existing real-storage journeys retain persistence checks | `App.clock.test.tsx` exercises the real progress store with fake IndexedDB; `core/density.test.ts` covers clock/calendar rules |

Retain the focused native animation/font/layout and keyboard/pointer journeys,
quiet-audio fixture, local-save recovery, feedback downloads, forecast refresh,
account isolation/convergence and Basic Spanish foundation introduction. Those
boundaries are not replaced by assertions against mocked media or storage.

## Running and comparing

Use the explicit fake sync service and matching build/test `SOURCE_REVISION` in
[REVIEW.md](REVIEW.md#verification), then run `npm run check` and
`npm run test:e2e -- --workers=2`. Use a free `E2E_PORT` for an isolated preview.
Keep audio mode, worker count and machine fixed when comparing durations. Native
media clocks continue independently of the Playwright clock.

The default suite excludes `e2e/content-review/`. Full decoder sweeps and contact
sheets remain available through `npm run test:content-review` and its manual
workflow. Real-iPhone acceptance remains separate from mobile WebKit.

CI runs Chromium shard 1 followed by WebKit shard 2 on one runner, with the inverse
pair on the other. Each engine/shard combination still runs exactly once. This
counterbalances expensive halves without another runner or custom test partition.
Reports are named by their actual engine/shard, and all shards remain required.

## Measurement

The reviewed baseline is `dadc123`: 55 scenarios / 110 browser executions. Its
[hosted run](https://github.com/ajhconway/kikimashta/actions/runs/42564788201)
spent approximately 2m42s and 1m42s in the two runners' browser execution phases.
The consolidation has 44 scenarios / 88 executions, a 20% reduction. Local
before/after measurements are recorded in the linked pull request; local
timings do not predict hosted setup, scheduling or container startup time.
