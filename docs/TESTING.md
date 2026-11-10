# Lean testing policy (#247)

Tests should explain a meaningful failure with the smallest useful fixture. More
cases and more layers are not release criteria. Preserve data safety and learning
correctness; simplify cosmetic and historical checks deliberately.

## Ownership and budgets

| Behavior | Primary owner | Additional boundary |
| --- | --- | --- |
| Scheduling, retries, mastery, timers, selection | `src/core/*.test.ts` | A few App wiring examples |
| Rendering, accessibility, failure/retry controls | Component tests | Native input/layout sample |
| Account isolation, persistence, save races | Store/sync tests | Real IndexedDB reload and multi-context convergence |
| Content eligibility, approval, hashes, safe paths | Shared validator contracts and current-content integrity checks | A representative wrapper/late-failure integration |
| Media sequencing, browser storage, fonts, navigation | `e2e/` | Both Chromium and mobile WebKit |
| Publishing | Merge checks plus exact-tree reuse | Read-only live revision/resource smoke |

The routine browser budget is **24 scenarios**, normally run in both engines with
two workers and zero retries. A new pack, voice, artwork batch or cosmetic variant
does not justify a new journey. Extend an existing flow. Exceed the budget only
for a distinct native boundary, with its coverage and measured cost explained in
the PR; update the coverage map at the same time.

Use one or two lesson cards, seeded through real browser storage, and still reach
the session ending and reload assertions. Chunk sizes, all mastery levels and
timer values belong to their focused policy owner. Validate individual packs,
their full union and a few real overlaps; do not enumerate every subset.

Content guards use tiny PNG/audio fixtures. Retain exact owner approval, path
safety, corrupt-media rejection and late-failure atomicity where they protect
different implementations. Check current production byte hashes once rather
than decoding every unchanged image or reconstructing every completed release.
Preserve source media and approval records even when retiring a historical test.

When changing a suite, remove obsolete or lower-value coverage and document its
remaining owner or the deliberately retired behavior. Never hide files from
discovery, combine the same permutations under fewer names, or report a move to
a manual workflow as deletion. New unique low-impact visual details need not
each receive a test. Keep meaningful account/save/corruption regressions.

## Commands and comparison

Use Node 24.15+ and `npm ci`.

```sh
npm run check
npm run test:e2e -- --list
E2E_AUDIO=quiet E2E_PORT=4299 npm run test:e2e -- --workers=2
```

Build and test with the same `SOURCE_REVISION`, `VITE_BASE_PATH=/`,
`VITE_SUPABASE_URL=https://kikimashta-sync-test.supabase.co` and
`VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_kikimashta_browser_test`.
The fake service prevents browser account journeys from touching live accounts.

For suite changes, compare the original and changed revisions on the same
machine, worker count, audio mode, environment and built app. Do not run competing
test suites during the comparison. Report:

- Expanded focused cases and browser scenarios, with browser executions separate.
- Measured wall time and, when useful, aggregate per-test browser time.
- Setup/install/build time separately from test execution and Pages service waits.
- Failures, unsupported engine boundaries and unrun checks without calling them passes.

The review baseline at `3fcddfc9` is 780 Vitest, 479 Node script, 32 Python audio
and 27 Python artwork cases, plus 63 browser scenarios / 126 executions. Hosted
run [42741531841](https://github.com/ajhconway/kikimashta/actions/runs/42741531841)
reported 58.81s Vitest, 216.42s Node scripts and 7m33s total gate time.
Those hosted timings must not be compared directly with local measurements.
The owner's targets are 50% fewer maintained cases and 75% less test duration;
state measured shortfalls instead of deleting critical coverage to change a count.

### Verified reduction

The final integration includes the concurrently merged Travel level 5 pack
(`0e8084fd`), including its additional Python tests. It has **522 Vitest + 384
Node + 52 Python content + 27 Python artwork cases**, plus **23 browser scenarios /
46 executions**. Compared with the review baseline, that is **1,381 → 1,008
maintained logical cases (27.0% fewer)** and **63 → 23 journeys (63.5% fewer)**.
Count a browser scenario once here; engine executions are reported separately.
The overall 50% maintained-case target is not met.

Same-machine measurements (quiet audio, two browser workers; four Vitest workers):

| Command / metric | Review baseline | Final integration | Reduction |
| --- | ---: | ---: | ---: |
| Vitest, `--no-cache --maxWorkers=4 --configLoader runner`, wall | 18.856s | 9.635s | 48.9% |
| `node --test scripts/*.test.mjs scripts/content/*.test.mjs`, wall | 52.16s | 12.10s | 76.8% |
| Playwright, `--workers=2`, wall | 240.872s | 63.110s | 73.8% |
| Playwright, aggregate per-test time | 475.060s | 116.647s | 75.4% |

The original browser run passed 125 / skipped 1; final passed 45 / skipped 1,
with no failures, retries or flaky results. The skip is the same unsupported
WebKit fake-service/offline-auth combination. The 75% browser wall-time target
is narrowly unmet; aggregate time is a separate metric. Hosted gate and Pages
wall-time changes require actual hosted results, not these local numbers.

`npm run check` passed in 38.54s locally; final lint/types, both browser engines
and actionlint passed. No matching local baseline was recorded for the entire
check command, so that number is not a claimed whole-gate speedup.
The local read-only publication smoke verified nine real built resources.
Reconstructing the browser build from checked-out static media plus generated
outputs matched all 7,397 manifest resources while transferring 6,681,166 bytes.
SQL policy checks remain in required CI; the local environment lacks PostgreSQL
and Docker. Real-device/live-account acceptance remains in its existing issues.

## Merge and publication

PR Checks owns lint, types, focused/content/database validation, the built app
and both browser engines. Validation builds once and shares only generated
outputs with the browser job, which copies unchanged static media from its
checkout before overlaying those outputs. The required `checks`, `database` and `codex-review` names and
branch protections remain.

Only a successful canonical-repository PR Checks run may supply an unexpired
`validated-tree-<Git tree SHA>` completion marker. Main checks its exact tree
against those markers and independently reads the candidate commit tree from
GitHub's Git API; an artifact name alone is not proof. A mismatch, unavailable API, fork run, failed run or
expired marker runs full validation again. The marker contains no executable
application and no PR build artifact is deployed. Required review still gates
the merge independently.

Publication builds once with production variables and the merged source revision;
CI's fake-service build is never promoted as a production build. After Pages
reports success, at most nine concurrent read-only requests check the source
notice, app/library entry points, emitted scripts, worker/manifest and sample
image/audio bytes against that build. There is no full lesson, sign-in or repeated
browser suite after publication. Each request has a ten-second deadline and no
retry loop.

Keep the Pages artifact-selection regression conditional on publication workflow
changes. Decoder sweeps/contact sheets remain manual content-review tools, not
routine release journeys. Real-iPhone and live-account acceptance remain explicit
in their issues; engine emulation and the publication smoke do not complete them.
