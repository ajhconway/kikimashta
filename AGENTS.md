# Agent working agreements

Read `PLAN.md` before starting. Keep the product and plan simple, flexible, and focused on the current milestone.

## Coordination

- The main agent coordinates the work. Delegate independent, bounded tasks to subagents when useful, with at most three workers active at once.
- Before app implementation, push the planning files to GitHub and create the initial milestones and issues. Every implementation task must reference a GitHub issue.
- Establish the app skeleton and shared data types before parallel feature implementation. The coordinator owns shared interfaces, project configuration, integration, and final verification.
- Give each worker an outcome, completion criteria, dependencies, owned files, and expected checks. Workers should request coordination before changing files owned by another task.
- Use one branch and worktree per implementation task when the environment permits it. If Git metadata writes are restricted, keep disjoint file ownership in the shared workspace and publish through the GitHub connector; report this limit.
- Workers return their changes, files touched, verification results, and unresolved concerns to the coordinator. The coordinator reviews and integrates them. Workers do not merge, push, or deploy independently.

| Worker role | Responsibility |
| --- | --- |
| Gameplay | Previews, quiz interactions, feedback, and session flow |
| Content | Language banks, media preparation, and content validation |
| Progress | Local persistence, attempt history, and later synchronization |
| Reviewer | Independent review of correctness, test quality, and integration; read only unless assigned a fix |

Assign roles per task; use fewer workers when work overlaps. Use GitHub Issues and linked pull requests as the durable work record. Repository setup can use task briefs in the active conversation until GitHub is ready. Issues do not launch background agents automatically.

- After the final PR commit (including updates from main), promptly request a Codex review of that head when the existing review is stale. Start review alongside CI instead of waiting for CI to finish. The status-refresh workflow does not launch a review. Avoid duplicate requests while that head is already being reviewed.

## Issue resolution

- Keep each issue's current summary and completion checklist aligned with delivered work. After a partial delivery or merge, record completed criteria, implementation PRs/commits, actual verification results, and the remaining work or acceptance. Clearly label superseded scope and preserve dated historical evidence.
- Use `Refs #N` for partial work and `Closes #N` only when the PR completes all required criteria on merge. An open or superseded PR alone does not prove integration; link the PR or commit that actually reached the target branch.
- Before closing, record the resolution and supporting evidence on the issue. Keep required deployment, owner/media approval, real-iPhone, and live-account checks open until accepted. Move independent remaining work only to an explicitly linked follow-up, without implying its acceptance is complete.
- Close duplicates with a link to the canonical issue and retain any unique requirements there. Record canceled or superseded work as such rather than marking it completed.
- Update affected repository guidance when behavior or workflow changes. The coordinator verifies issue states and residual acceptance alongside final integration checks.

## Engineering and tests

- Keep the interface, learning rules, content, and storage separate. Use stable item and attempt IDs, and keep progress specific to its language and item.
- Each agent delivers relevant tests with behavior changes and meaningful regression tests with bug fixes. Follow the testing approach in `PLAN.md`.
- Assert observable behavior. Keep tests isolated and deterministic, fixtures small, time and randomness controlled, and mocks at external boundaries. Use real browser storage in end-to-end persistence checks.
- Keep focused tests beside the code and browser journeys in `e2e/`. Reuse a small set of helpers and fix flaky tests rather than hiding them with retries.
- Review test quality as well as the implementation. Before integration, run the relevant checks and the configured lint, type checks, tests, and production build. Report actual commands and results; do not claim unavailable checks passed.
- Check audio and interaction on the real iPhone at playable milestones and releases. Browser emulation supplements device testing.

## Model guidance

Start with GPT-6.1 Sol at Medium effort for routine development. Use High for difficult debugging, architecture, or detailed review when needed. Workers inherit the active session's model and effort unless an explicit override is requested; these recommendations do not change app settings.

## Project setup

Use Node 24.15 or newer and `npm ci`. Run `npm run dev` for development, `npm run check` for lint, types, focused tests and build, and `npm run test:e2e` for browser tests after building. CI checks the `/` deployment path used by `kikimashta.com` in Chromium and mobile WebKit.

Japanese word-neighbor preparation uses `npm run content:neighbors`; its deterministic data and reviewed-image check is `npm run content:neighbors:check`, included in `npm run check`. Offline semantic model regeneration remains separate; app development and ordinary checks need no Python model packages.

The same preparation command rebuilds pronunciation rows using the current shared mora normalization, the existing unit-cost similarity eligibility gate and the selected acoustic-weighted ordering. Checked-in kanasim tables and their recipe are pinned in [pronunciation provenance](content/pronunciation-neighbors/README.md); no pronunciation model download or training is needed. Keep the baseline gate, normalized homophone exclusions, special-mora costs, six-valid-neighbor shuffle and mastery quotas intact unless a separate policy change is authorized. Resolve unsupported-reading preparation errors explicitly. Preserve frozen experiment inputs and collected listening responses under `artifacts/pronunciation-neighbors-212/`.

When a pack expands approved Japanese vocabulary, regenerate semantic rankings and pronunciation neighbors across the entire approved pool, then review affected choices. Follow the [pack and neighbor maintenance checklist](content/semantic-neighbors/README.md#adding-packs-and-maintaining-neighbors), including its reading-only and selection-only rules.

When another worktree is serving the default preview port, use `E2E_PORT=4199 npm run test:e2e` (or another free port). An explicit E2E_PORT starts an isolated production preview rather than reusing another server. The card library has Words and Contextual questions views. Open `vocabulary/?view=contextual&language=ja-JP` for authored contextual cards; old `?review=contextual` links redirect there. Browsing saves no attempts.

Some sandboxes restrict npm network access and local listening servers. Use the available approved execution path or GitHub Actions when local preview is unavailable. Keep `SOURCE_REVISION` consistent between build and browser tests when setting it. Never claim emulated WebKit is a real iPhone test.

Contextual quiz text preparation for issue #119 uses `npm run content:contextual:validate` for a read-only preflight and `npm run content:contextual:review` to rebuild `artifacts/contextual-pilot/review.html`. The review command's `-- --github` option prints a readable GitHub review. These commands do not approve content, generate speech, or activate practice cards. Obtain owner approval of the actual pilot text before speech generation, as recorded in PLAN.md. The usual `npm test` includes the checked-in pilot's validation and review-tool regression checks.

Local ElevenLabs generation loads `ELEVENLABS_API_KEY` from the command environment or `~/.config/kikimashta/elevenlabs.env` (private mode 600), so separate worktrees can use one secret outside Git. Read it only through `scripts/content/elevenlabs-key.mjs` for generation. Never print, copy into the repository, include in browser code, or record its value in logs/provenance. See `docs/ELEVENLABS.md` for setup.

Card artwork preparation for issue #72 uses Python 3 standard-library scripts in `scripts/cards/`: `prepare.py`, `render_review.py`, `validate.py`, and `python3 -m unittest discover -s scripts/cards -p 'test_*.py'`. Generation uses the built-in image tool. Once the owner approves a pack’s generation scope, finish the full pack before requesting artwork feedback, unless the owner explicitly asks for intermediate batch reviews. Preserve every original and prompt; keep final media acceptance separate from generation authorization. The card tests and validator run through `npm run test:cards`, included in `npm run check` and the required CI job. Preparation and gallery rendering remain manual.

Account-sync browser specs require the explicit fake service configuration in [docs/REVIEW.md](docs/REVIEW.md#verification), so local runs do not silently skip sync coverage.
