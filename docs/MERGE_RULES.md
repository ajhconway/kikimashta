# Required CI and Codex review

Merges to `main` require passing app/browser and database checks plus a
completed Codex code review of the PR's current head with no unresolved findings.
Automatic Codex review by itself does not enforce a merge requirement.

## Active configuration — November 8, 2026

The [CI and Codex Review ruleset](https://github.com/ajhconway/kikimashta/rules/26727902) is active on the default branch. Read-back confirmed required contexts `checks`, `database`, and `codex-review`, strict up-to-date checks, required PRs with zero human approvals, conversation resolution, and no bypass actors. Activation was recorded in #89.

## Recreate in GitHub (repository owner)

The connected GitHub integration cannot edit administration settings. To restore this configuration if needed, open
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

Keep `artifacts` optional while `.github/workflows/pages-artifacts.yml` has a workflow-level path filter. Requiring it globally would leave unrelated PRs waiting for a check that never runs. First change the workflow to report a result on every PR if making it mandatory. [GitHub documents skipped required workflows](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks). Do not require the deployment job: it runs after merging.

The `codex-review` status first appears after this workflow is on the default
branch and has refreshed an open PR. For an existing PR, run **Actions → Codex
review gate → Run workflow**, using `main` and that PR number. Then select the
status in the rule. If no review exists for that commit, comment `@codex review`
on the PR; comment creation/edit events refresh the gate automatically.

Confirm on an open PR that GitHub blocks merging until every required check
passes. Push a new commit and verify CI and review are required again. Keep
Codex's automatic review trigger configured for new commits; otherwise request
the new review with `@codex review`.

## Keeping validation responsive (#171)

Checks cancels superseded PR runs, while main-push checks remain available for publication. Independent validation and two browser shards run concurrently. Both Chromium and mobile WebKit remain covered with zero retries. The required `checks` job accepts only successful validation and successful completion of every browser shard; failures, cancellations and skips cannot clear it. The separate `database` requirement remains unchanged.

After the final commit or an update from main, request a review of the new head promptly if its summary is stale. Run review alongside CI. The gate refresh only reports review state and does not request a review. Avoid duplicate requests for a head already under review. Automatic review triggering is an account integration setting; this change does not alter it.

The gate uses a filtered sparse checkout of only its trusted default-branch script. Production publication still follows successful full main checks and rebuilds with production variables. Compare Actions job timings with #171 before claiming a speedup.

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

The workflow and helper are already on the default branch, and live comment-driven updates and the active rule were verified in #89. For a future replacement, review its bootstrap PR manually before switching the required status. Confirm the replacement gate on the current PR head before relying on it.

Focused check: `node --test scripts/codex-review-gate.test.mjs`.

References: [Codex review setup](https://learn.chatgpt.com/docs/third-party/github),
[GitHub rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
[workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
