# Agent working agreements

Read `PLAN.md` before starting. Keep the product and plan simple, flexible, and focused on the current milestone.

## Coordination

- The main agent coordinates the work. Delegate independent, bounded tasks to subagents when useful, with at most three workers active at once.
- Before app implementation, push the planning files to GitHub and create the initial milestones and issues. Every implementation task must reference a GitHub issue.
- Establish the app skeleton and shared data types before parallel feature implementation. The coordinator owns shared interfaces, project configuration, integration, and final verification.
- Give each worker an outcome, completion criteria, dependencies, owned files, and expected checks. Workers should request coordination before changing files owned by another task.
- Use one branch and worktree per implementation task once Git is initialized. Until then, give workers disjoint file ownership in the shared workspace.
- Workers return their changes, files touched, verification results, and unresolved concerns to the coordinator. The coordinator reviews and integrates them. Workers do not merge, push, or deploy independently.

| Worker role | Responsibility |
| --- | --- |
| Gameplay | Previews, quiz interactions, feedback, and session flow |
| Content | Language banks, media preparation, and content validation |
| Progress | Local persistence, attempt history, and later synchronization |
| Reviewer | Independent review of correctness, test quality, and integration; read only unless assigned a fix |

Assign roles per task; use fewer workers when work overlaps. Use GitHub Issues and linked pull requests as the durable work record. Repository setup can use task briefs in the active conversation until GitHub is ready. Issues do not launch background agents automatically.

## Merge and deployment defaults

- Unless the user asks otherwise, the coordinator completes local verification, pushes the task branch, opens or updates the linked pull request, and enables GitHub auto-merge without asking for merge approval. If all required checks and reviews have already passed, merge directly.
- Preserve required checks, reviews, and branch protections. If auto-merge is unavailable or merging is blocked, report the blocker and link the pull request.
- After submitting the merge or auto-merge request, finish the task without waiting for the pull request to merge or for deployment to complete. Wait or monitor only when the user explicitly asks.
- In the final response, link the pull request and state the observed merge and deployment status, including anything still pending. Do not claim that a queued merge or deployment has completed.
- Workers continue to return their work to the coordinator; the coordinator owns pushing, merging, and deployment decisions.

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

The app has not been scaffolded yet. Add verified setup, test, and build commands here when they exist.
