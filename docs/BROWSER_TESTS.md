# Browser journey coverage (#247)

Keep browser journeys focused on real engine boundaries: native media, IndexedDB,
fonts/layout, pointer/keyboard input and navigation. The routine budget is
**23 scenarios / 46 engine executions**, within the 24-scenario budget, with two workers and zero retries.
Follow [test ownership and measurement](TESTING.md) before adding a scenario.

## Retained coverage

| Boundary | Journey | Focused owner for additional permutations |
| --- | --- | --- |
| Complete mixed lesson, summary and reload | `practice.spec.ts`, two remaining cards | App/session/scheduler tests own full chunk size and ordering |
| Fixed due snapshot, writing miss/retry, later due work | `practice.spec.ts` | Session rules and saved-attempt regressions |
| Failed save after Home, exactly-once recovery | `practice.spec.ts` | App/save/store races |
| Keyboard, held pointer, reduced motion, writing fit | `practice.spec.ts` | Component accessibility and timing hooks |
| Failed audio, stable replay, premature-answer prevention | `practice.spec.ts` | Audio and App recovery |
| Native timer and audio-first entrances | `quiz-timer.spec.ts`, picture timer switching to reduced motion | Core timer table and entrance hook; mixed lesson owns writing |
| Contextual paired audio, miss/retry, scheduled reload | `contextual.spec.ts` | Contextual interaction/progression/admission rules |
| Authored library redirect, audio retry/cancel, unchanged history | `contextual-library.spec.ts` | ContextualLibrary component filters/details |
| Unsaved Dev review wiring | `dev-review.spec.ts` | Core Dev-review combinations and App wiring |
| Language, voice and pack preferences with isolated answer | `languages.spec.ts`, one remaining Spanish card | Language/pack/voice rules and current-media validation |
| Basic Spanish direct contextual entry | `spanish-basic.spec.ts` | Foundation content/admission rules |
| Library search and native voice retry | `vocabulary.spec.ts` | Library navigation and preference tests |
| Notes/export and failed-save draft | `feedback.spec.ts` | Note-store/account convergence |
| Forecast refresh across tabs and scope | `forecast.spec.ts` | App/core calendar, forecast and DST rules |
| Small-screen settings and focus return | `settings.spec.ts` | Settings/OfflinePanel behavior |
| Persisted badge rendering and reduced-motion upgrade | `pack-badges.spec.ts` | Small badge presentation contracts |
| Offline download, one-card complete lesson, reload and cache removal | `offline.spec.ts` | Worker/client selection and interrupted-download contracts |
| Cross-context accounts, offline answer retry, note deletion | `sync.spec.ts` | Sync engine/store/remote/account isolation |
| Expired auth offline, reconnect and retained account history | `sync.spec.ts`, Chromium | Auth runtime plus WebKit offline media/storage journey |

WebKit service-worker requests bypass the fake cloud HTTP routes. Its combined
offline-auth scenario is explicitly unsupported and skipped; Chromium exercises
that combination. Both engines still test offline media/storage and ordinary
account convergence. An emulator is not real-iPhone acceptance.

## Retired repetition

Per-release artwork, pack counts/prerequisites and every voice belong to current
content/manifest validation. Distractor quotas, homophones, pack cross-products,
DST examples and timer values belong to focused core tests. Separate quiet-audio
fixture tests and long Dev-review/mastery/badge tours duplicate native boundaries
already exercised by the retained flows. Detailed cosmetic animation phases are
deliberately no longer exhaustively simulated.

The complete contextual practice journey owns native sentence/question playback;
the library journey checks failure/retry/cancellation without playing every voice
to completion again. Production licensing/source packaging is checked by focused
tests and the publication smoke.

## Running

Build with the explicit fake sync service and matching `SOURCE_REVISION` described
in [TESTING.md](TESTING.md), then use an unused port:

```sh
E2E_AUDIO=quiet E2E_PORT=4299 npm run test:e2e -- --workers=2
```

CI overlays validation's generated outputs onto checked-out static media, without
transferring the media again, and runs both engines once in a
single browser job. Main reuses successful premerge checks only for an identical
Git tree; it does not rerun the journeys during publication.

The default suite excludes `e2e/content-review/`. Decoder sweeps/contact sheets
remain available through `npm run test:content-review` and its manual workflow.
They are content review tools, not another routine release gate.

## Measurement

Baseline `3fcddfc9` discovers 63 scenarios / 126 executions. The hosted
[baseline run](https://github.com/ajhconway/kikimashta/actions/runs/42741531841)
passed 125 and skipped the unsupported WebKit offline-auth combination, with
688.231 seconds aggregate per-test time across the engine executions.

Record comparable local before/after measurements and their environment in
issue #247 and its PR. Do not compare hosted aggregate time with local wall time,
or include setup/build/Pages service waits in a test-execution speedup.
Earlier #179/#202 timings are historical and do not describe this suite.
