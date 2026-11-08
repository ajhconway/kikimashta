# Project review — November 8, 2026

Work record: [#113](https://github.com/ajhconway/kikimashta/issues/113). Reviewed source: [`38f6619e63707df8db411a2697f21e726ea16c7e`](https://github.com/ajhconway/kikimashta/tree/38f6619e63707df8db411a2697f21e726ea16c7e).

The supplied workspace's Git HEAD is the initial planning commit, with an older untracked app snapshot. A clean shallow checkout of current GitHub main at `/tmp/kikimashta-project-review` was used for the authoritative review and checks. The original implementation files were left in place. Documentation changes are separate from the fixes below.

## New issues

All four findings are P2: address them in ordinary development; no critical defect was demonstrated.

| Issue | Evidence and user impact | Needed regression |
| --- | --- | --- |
| [#114 — Failed save disappears after Home](https://github.com/ajhconway/kikimashta/issues/114) | `src/App.tsx:188–193,267–278`: Home clears the active attempt; a later storage rejection is hidden by the active-ID guard. Start re-enables with no failure or retry and the answer is lost. | Exit during a pending write, reject it, show a retained retry, and persist the original ID exactly once after recovery. |
| [#117 — Clock skew blocks ordinary practice](https://github.com/ajhconway/kikimashta/issues/117) | `src/core/density.ts:133` rejects a valid synchronized review timestamp one minute ahead. `src/App.tsx:148–155` treats this as failed history loading and disables Start. Catching up alone does not recover the screen; retry/reload is also needed. | Keep valid future-dated history without blocking unrelated practice; cover backward clock changes and recovery without clearing data. |
| [#115 — Picture buttons omit identifying accessible names](https://github.com/ajhconway/kikimashta/issues/115) | `src/App.tsx:386`: “Choose picture N” overrides the descriptive image alternative. Screen-reader users focusing answers cannot identify their contents. | Assert descriptive names for picture buttons, retain keyboard activation, and verify VoiceOver on iPhone. |
| [#116 — Required CI omits artwork checks](https://github.com/ajhconway/kikimashta/issues/116) | `package.json` and `.github/workflows/ci.yml` omit all 18 card preparation tests and the content/DAG validator. Required checks can pass after regressions in reference readiness, batch membership, or teaching restrictions. | Run the existing deterministic Python tests and validator in required checks, without preparation or generation. |

Temporary isolated Vitest checks reproduced both gameplay/accessibility defects and the clock defect: 3/3 reproduction assertions passed against the existing behavior. The temporary files were removed. Permanent fix regressions belong in their implementation issues.

## Review coverage

Reviewed the session/quiz rules, retries, both exercise types, per-exercise FSRS history, forecasts, packs, font rotation/fallback, audio lifecycle, React interactions and existing tests. Content review checked catalog/library agreement, media references, active artwork provenance, preparation dependencies and feedback restrictions. Persistence/sync review covered immutable IDs, transaction behavior, account changes, guest migration, note tombstones/conflicts, pagination, HTTP boundaries, SQL grants/policies and deployment configuration. CI, licensing notices and production dependencies were also checked.

No additional substantiated defect was found in question generation, pack filtering, writing-font fallback, library feedback persistence, or the reviewed account-ownership policies. This is a bounded code and test review, not proof that every interaction or media recording is correct.

## Planning reconciliation

- PLAN and README now describe shipped adaptive practice, writing/fonts, the current home, ten packs, eight voices, and deployed sync. Actual counts are 166 eligible vocabulary items / 332 cards before filtering, 440 visible library entries, and 168 active approved illustrations.
- Supabase setup now requires both ordered migrations for a new project. Hosted history confirms `20261106045912_sync` and `20261107035952_audio_text_attempts`; repository migration timestamps differ historically. The hosted constraint currently supports `audio-text`.
- Merge documentation now records the active ruleset: `checks`, `database`, and `codex-review`, strict up-to-date checks, required PRs, conversation resolution and no bypass actors. It no longer recommends globally requiring the path-filtered `artifacts` workflow, which would block unrelated PRs waiting for a missing check. [GitHub guidance](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks).
- Artwork docs no longer describe a planning-only checkout. Batches 01–10 are active; batch 11 is ready to generate. Semantic-policy integration remains explicitly deferred to #79. Prompt approval, activation, and practice eligibility remain separate.
- Public source notice points to the reviewed revision. All 40 deliveries originally associated with #77 match current manifest SHA-256 hashes on the live site. That issue's deployment-pending text was stale; real-iPhone acceptance remains separate.
- GitHub's `v0` milestone is still open with zero open / five closed issues. `Sync` is open with #6. The old #76/#77 activation records overlap; consolidate them during issue housekeeping without treating this review as device acceptance.

## Verification

The clean checkout used Node 26.12.0, npm 11.20.0, Python 3 and installed FFmpeg. Dependencies were installed with `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund`. Normal setup remains `npm ci`.

The recorded checks above used the reviewed revision. For a new checkout, derive the revision being tested and use the same explicit test-only configuration for the build and browser checks:

```sh
export VITE_SUPABASE_URL=https://kikimashta-sync-test.supabase.co
export VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_kikimashta_browser_test
export SOURCE_REVISION="$(git rev-parse HEAD)"
npm run check
npm run test:e2e
```

These Supabase values are a fake HTTP test boundary. Never substitute a real project when running the simulated sign-in journeys. Omitting them skips those specs. Keep `SOURCE_REVISION` identical to the build's value for the license assertion.

| Check | Actual result |
| --- | --- |
| `npm run check` with the configuration above | Pass: lint, types, 177 Vitest tests, 129 Node script tests, 12 Python audio tests, production build. Vite reports a large-chunk warning; it does not fail the build. |
| `npm run test:e2e` | Initial local server binding was sandbox-blocked; approved execution ran Chromium and mobile WebKit: 47 passed, 2 license assertions failed because the command omitted `SOURCE_REVISION`, 1 intentional WebKit contact-sheet skip. |
| `npx playwright test e2e/licensing.spec.ts` with matching revision and test-service variables | 2/2 pass. Resolves the two configuration failures above; 49 browser checks passed across the two runs, with one intentional skip. No product code changed between runs. |
| `python3 -m unittest discover -s scripts/cards -p 'test_*.py'` | 18/18 pass. |
| `python3 scripts/cards/validate.py` | Pass: 445 prompts, 48 findings, 496-node acyclic graph, 22 batches, 45 exclusion groups. |
| Media/catalog checks | All referenced image/audio files exist; all 440 library entries match catalog text, readings, meanings and media paths. |
| `npm audit --omit=dev --json` | No known production dependency advisories returned at review time. Development dependencies were not included in this audit. |
| Current-main hosted [Checks run](https://github.com/ajhconway/kikimashta/actions/runs/42496296871) | Both `checks` and `database` succeeded. The latter applies both migrations and the rollback fixture. No local Postgres server was available. |
| Hosted Supabase, read only | Both migrations present; RLS enabled and forced on both event tables; SELECT/INSERT ownership policies use `auth.uid()`; writing attempts supported. No user/event rows were read or changed. |
| Supabase advisors | Health/performance: no findings. Security: leaked-password protection disabled; [remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The app uses email-code sign-in; password auth was not exercised. |
| Production/rules read-back | Live source revision and 40 artwork hashes match; ruleset configuration matches documented required checks. |
| `git diff --check` | Pass for the documentation update. |

Local browser tests used the existing quiet-audio fixture and real media playback/decoding; hosted CI retains unmuted autoplay coverage. No paid media generation, new live sign-in emails, database mutations, merges, or deployments were performed for this review.

## Still pending or already documented

Actual iPhone pronunciation, regional delivery, audio permissions, touch/layout, VoiceOver, session persistence, and two-device sync/guest-copy acceptance remain manual (#6). Existing semantic collisions and broader contextual teaching are tracked in #79; the review did not silently enable excluded content. Artwork generation continues in #72. The large bundle warning is a performance observation, without a measured user-facing regression. Offline practice and broader exercises remain later work in #48.
