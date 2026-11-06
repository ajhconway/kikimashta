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

The current sandbox restricts npm network access and local listening servers. Dependencies have been installed from integrity-verified tarballs; use GitHub Actions for browser checks when local preview is unavailable. Never claim emulated WebKit is a real iPhone test.

Card artwork preparation for issue #72 uses Python 3 standard-library scripts in `scripts/cards/`: `prepare.py`, `render_review.py`, `validate.py`, and `python3 -m unittest discover -s scripts/cards -p 'test_*.py'`. Generation uses the built-in image tool and pauses for feedback after each batch. These checks supplement the app checks above.
