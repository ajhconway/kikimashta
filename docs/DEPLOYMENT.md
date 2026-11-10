# Pages publication and recovery

`Checks` runs on pull requests and main pushes. `Publish v0` publishes only after
successful push-triggered Checks on main. PR Checks owns full validation. Main
reuses only an unexpired successful same-repository PR Checks marker for its exact
Git tree; absent or invalid proof runs full validation. See [the lean-suite
policy](TESTING.md) for the trust boundary and fallback. Publication checks out the successful run's
`head_sha`, builds with the repository's production variables, and pins the
source notice to that revision. Publication remains serialized through the
`github-pages` concurrency group.

Validation shares generated build outputs with the browser job; static media
comes from the same checkout. Publication still builds once
with production variables: the CI artifact uses a fake account service and must
never be deployed. User journeys run at the merge gate, not again after publishing.

After Pages succeeds, `scripts/deployment-smoke.mjs` makes at most nine concurrent
read-only requests with ten-second deadlines and no retries. It verifies the
source notice, both HTML entry points, emitted scripts, offline manifest/worker
and representative image/audio bytes against the production build. It makes no
account requests or saved answers. Real-iPhone and live-account acceptance remain
in their existing issues.

Each publication attempt uploads `github-pages-<run ID>-<attempt>` and passes that
same name to `deploy-pages`. A retry rebuilds the original checked revision and
selects its newly uploaded artifact. Artifacts from earlier attempts can remain;
there is no need to delete them or rerun Checks just to avoid duplicate names.

## Diagnose a failure

The run summary records the source revision, artifact name/ID, and build,
upload, Pages service and live-smoke outcomes. Step timings distinguish preparation from
time spent inside Pages.

- Failed build or upload: inspect that step's error before retrying.
- Failed live smoke after successful Pages: inspect the mismatched resource or
  revision. Retain that evidence; do not rerun the entire browser suite or
  repeatedly republish simply to wait for a response.
- Failed Pages step after successful build/upload: inspect **Deploy through Pages
  service** for its last status. `deployment_queued` and `syncing_files` indicate
  waiting inside Pages, rather than a slow app build. They do not by themselves
  establish a global service outage. Check GitHub Status if appropriate.
- The Pages action times out after ten minutes and attempts to cancel the
  deployment. Its failure remains visible; the workflow does not retry silently.

## Retry a publication

1. Confirm that the summary's source revision is the one you intend to publish.
   Retrying an older run can republish older code after a newer release.
2. Open the failed **Publish v0** run in Actions and use **Re-run failed jobs**
   (or **Re-run all jobs**). The attempt number increases, producing a new artifact
   name for the same checked source revision. Wait for the prior Pages deployment
   to finish or cancel before retrying if it remains active.
3. Confirm that build, upload, and Pages all succeed. Inspect the summary's new
   artifact name and ID. If Pages is still queued, retain that evidence and retry
   later; artifact naming does not fix service-side availability.
4. Confirm the automated live smoke passed. The Pages deployment's own commit
   metadata can reflect the workflow revision; the app's source notice identifies
   the revision actually built. Open the site manually when investigating a
   publication-specific failure or performing explicit device acceptance.

## Verification

The PR-only **Verify Pages artifacts** workflow has read-only repository/Actions
permissions and no Pages or OIDC write permissions. It reads the production
artifact naming configuration, packages a tiny revision fixture with the actual
Pages upload action, verifies an exact-name match and artifact ID, downloads the
selected archive, and verifies its source/run/attempt markers. Re-run its job to
exercise a second attempt while the previous artifact remains in the same run.
This checks retry selection without publishing unreviewed code.

When changing artifact naming/selection, rerun the small PR fixture to exercise
attempt selection. Do not trigger an extra production publication just to test a
retry. Retry a real failed deployment only when needed. Record actual results
and Pages service queue delay separately from test timing.

## Verified release state — November 8, 2026

The public source notice identifies `38f6619e63707df8db411a2697f21e726ea16c7e`. Its [main Checks run](https://github.com/ajhconway/kikimashta/actions/runs/42496296871) completed successfully for both `checks` and `database`. All 40 original approved deliveries from batches 01–04 match the current activation-manifest SHA-256 hashes on the public site, resolving the old deployment/hash-verification concern recorded in #77. The manifest now contains 168 active approved illustrations in total. This read-only smoke check does not replace real-iPhone acceptance or demonstrate a new publication retry.

## Retired offline preview (#245)

Offline practice is part of the normal root app. The temporary preview page, isolated storage configuration, source pin, composition job and dedicated browser project are removed. `/offline-demo/` returns404 after publication. A small replacement at its former worker URL unregisters installed preview workers, deletes only preview caches and navigates preview tabs to `/`. It preserves all practice history, auth data and root caches. This retirement worker and its scoped cleanup regressions are the only retained preview-path implementation.
