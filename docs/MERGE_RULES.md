# Required CI and Codex review

Merges to `main` should require passing app/browser and database checks plus a
completed Codex code review of the PR's current head with no unresolved findings.
Automatic Codex review by itself does not enforce a merge requirement.

## Activate in GitHub (repository owner)

The connected GitHub integration cannot edit administration settings. After
merging the review-gate workflow, open
[Settings → Rules → Rulesets](https://github.com/ajhconway/kikimashta/settings/rules)
and create a branch ruleset:

1. Name it `Main: CI and Codex review`, set enforcement to **Active**, and target
   `main`. Leave the bypass list empty so normal owner/agent merges also wait.
2. Enable **Require a pull request before merging**. Leave required approvals at
   **0**: the Codex bot reports findings/completion, not an approving human review.
3. Enable **Require status checks to pass** and add `checks`, `database`, and
   `codex-review`. Select GitHub Actions as their expected source. Enable
   **Require branches to be up to date before merging**.
4. Enable **Require conversation resolution before merging**, then save.

If the Pages artifact validation job from #83 has landed, also require its
`artifacts` check. Do not require the deployment job: it runs after merging.

The `codex-review` status first appears after this workflow is on the default
branch and has refreshed an open PR. For an existing PR, run **Actions → Codex
review gate → Run workflow**, using `main` and that PR number. Then select the
status in the rule. If no review exists for that commit, comment `@codex review`
on the PR; comment creation/edit events refresh the gate automatically.

Confirm on an open PR that GitHub blocks merging until every required check
passes. Push a new commit and verify CI and review are required again. Keep
Codex's automatic review trigger configured for new commits; otherwise request
the new review with `@codex review`.

## How the gate works

`.github/workflows/codex-review.yml` runs on PR lifecycle events and Codex summary
comment changes. It checks out only trusted default-branch code, installs no app
dependencies, and never executes PR code with its status-write token. Refreshes
for each PR are serialized and read current GitHub state instead of trusting an
old event's head or comment body. The status is attached to the PR head SHA, not
the default-branch workflow commit.

The gate accepts only the verified Codex bot/app's summary. It reads the observed
`codex-review-state:v1` metadata: missing, running, queued or stale reviews stay
pending; failed, unrecognized or malformed states and unresolved findings block
merging. Completion requires explicit finding state. After resolving findings,
let Codex update its summary or request a new review. A new commit always needs
its own review. Drafts remain pending.

This metadata is an observed integration format, not a documented API contract.
If Codex changes it, the gate blocks merging until the parser is updated. A
GitHub API/workflow failure can also require a manual refresh. No API keys or
additional account secrets are needed; the workflow uses `GITHUB_TOKEN`.

## Bootstrap and verification

The event workflow and helper must first reach the default branch. Before that,
CI runs the deterministic helper tests via `npm test`, but comment-driven status
updates are not live. Review the bootstrap PR and its CI/Codex results manually,
merge it, refresh an open PR, and activate the rule above. Until the rule is
active, GitHub continues to allow merges without these requirements.

Focused check: `node --test scripts/codex-review-gate.test.mjs`.

References: [Codex review setup](https://learn.chatgpt.com/docs/third-party/github),
[GitHub rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
[workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
