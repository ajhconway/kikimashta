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
