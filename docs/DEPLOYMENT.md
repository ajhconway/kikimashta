# Pages publication and recovery

`Checks` runs on pull requests and main pushes. `Publish v0` publishes only after
successful push-triggered Checks on main. It checks out the successful run's
`head_sha`, builds with the repository's production variables, and pins the
source notice to that revision. Publication remains serialized through the
`github-pages` concurrency group.

Each publication attempt uploads `github-pages-<run ID>-<attempt>` and passes that
same name to `deploy-pages`. A retry rebuilds the original checked revision and
selects its newly uploaded artifact. Artifacts from earlier attempts can remain;
there is no need to delete them or rerun Checks just to avoid duplicate names.

## Diagnose a failure

The run summary records the source revision, artifact name/ID, and build,
upload, and Pages service outcomes. Step timings distinguish preparation from
time spent inside Pages.

- Failed build or upload: inspect that step's error before retrying.
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
4. Open https://kikimashta.com and its source/license link. Confirm the published
   source notice points to the expected commit, then smoke-check the app and card
   library. The Pages deployment's own commit metadata can reflect the workflow
   revision; the app's source notice identifies the revision actually built.

## Verification

The PR-only **Verify Pages artifacts** workflow has read-only repository/Actions
permissions and no Pages or OIDC write permissions. It reads the production
artifact naming configuration, packages a tiny revision fixture with the actual
Pages upload action, verifies an exact-name match and artifact ID, downloads the
selected archive, and verifies its source/run/attempt markers. Re-run its job to
exercise a second attempt while the previous artifact remains in the same run.
This checks retry selection without publishing unreviewed code.

After merging a publication change, verify the first production publish and one
publication retry, checking artifact IDs and the public source notice each time.
Record the actual results and any Pages service queue delay in the linked PR.

## Verified release state — November 8, 2026

The public source notice identifies `38f6619e63707df8db411a2697f21e726ea16c7e`. Its [main Checks run](https://github.com/ajhconway/kikimashta/actions/runs/42496296871) completed successfully for both `checks` and `database`. All 40 original approved deliveries from batches 01–04 match the current activation-manifest SHA-256 hashes on the public site, resolving the old deployment/hash-verification concern recorded in #77. The manifest now contains 168 active approved illustrations in total. This read-only smoke check does not replace real-iPhone acceptance or demonstrate a new publication retry.

## Offline demo (#234)

Every normal publication also includes an explicitly pinned offline feature snapshot at [kikimashta.com/offline-demo/](https://kikimashta.com/offline-demo/). The root app still builds from the successful main Checks revision and keeps its own source notice, assets and domain configuration. This demo needs no Cloudflare Access gate or developer machine.

`OFFLINE_DEMO_REVISION` in `pages.yml` is a full reviewed source commit. A separate `contents: read` build job checks out that snapshot with persisted credentials disabled, sets `VITE_BASE_PATH=/offline-demo/` and `VITE_STORAGE_NAMESPACE=offline-demo`, and builds with the public production cloud configuration. Demo browser storage and authentication sessions are separate from the root app; explicit app sign-in may sync with the same real account.

The publication job builds main normally, downloads the successful demo job's named artifact, and runs `scripts/offline-demo-release.mjs` to validate its offline asset hashes, subpath HTML and pinned source notice. It nests the build under `dist/offline-demo/` and verifies that every original root file remains byte-identical. A generated `/offline-demo/offline-demo-release.json` identifies the demo revision and namespace. Updating the demo pin requires normal code review; later root releases retain that pin until it is deliberately changed or removed.

A failed-job publication retry downloads the artifact name returned by the successful demo build job, even when that artifact belongs to an earlier attempt. The production Pages artifact continues to use its existing unique run/attempt name. Rerunning all jobs builds a fresh demo artifact for the new attempt.

Focused composition check: `node --test scripts/offline-demo-release.test.mjs`. Before publishing a new demo pin, verify the actual built app and library at the subpath in Chromium and mobile WebKit, including worker scope, offline reload/audio/storage and root isolation. After publication, verify both source notices, demo release metadata and exact asset hashes. Physical-iPhone acceptance remains in #223.
