/** Reuse successful premerge checks only for exactly the same Git tree (#247).
 * The artifact is a completion marker, never application code or a deployable build.
 */
import { appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function validatedRun({ repository, runId, tree, token, request = fetch }) {
  if (!/^[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*$/i.test(repository) || !/^\d+$/.test(String(runId)) || !/^[a-f0-9]{40}$/.test(tree)) {
    throw new Error('Invalid validation identity.')
  }
  const signal = AbortSignal.timeout(10_000)
  const get = async path => {
    const response = await request('https://api.github.com/repos/' + repository + path, {
      headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json' },
      signal,
      redirect: 'error',
    })
    if (!response.ok) throw new Error('Validation lookup failed: HTTP ' + response.status)
    return response.json()
  }
  const current = await get('/actions/runs/' + runId)
  const name = 'validated-tree-' + tree
  // A bounded lookup can only miss reuse and cause a full run, never waive checks.
  const { artifacts = [] } = await get('/actions/artifacts?name=' + name + '&per_page=20')
  for (const artifact of artifacts) {
    if (artifact.name !== name || artifact.expired !== false
      || artifact.workflow_run?.repository_id !== current.repository?.id
      || artifact.workflow_run?.head_repository_id !== current.repository?.id
      || !Number.isSafeInteger(artifact.workflow_run?.id)
      || artifact.workflow_run.id === Number(runId)) continue
    const run = await get('/actions/runs/' + artifact.workflow_run.id)
    // GitHub may qualify the workflow file with its ref, such as ci.yml@main.
    const workflowPath = typeof run.path === 'string' ? run.path.split('@', 1)[0] : null
    if (run.workflow_id === current.workflow_id && workflowPath === '.github/workflows/ci.yml'
      && run.repository?.full_name === repository && run.head_repository?.full_name === repository
      && run.status === 'completed' && run.conclusion === 'success'
      && run.event === 'pull_request' && /^[a-f0-9]{40}$/.test(run.head_sha)) {
      // Bind the marker to GitHub's commit tree, not a claim made by PR code.
      // Strict up-to-date PRs have the same head tree as their merge candidate.
      // If they differ, a full main run is the conservative fallback.
      const commit = await get('/git/commits/' + run.head_sha)
      if (commit.tree?.sha === tree) return run.id
    }
  }
  return null
}

async function main() {
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim()
  let run = null
  if (process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === 'refs/heads/main') {
    try {
      run = await validatedRun({ repository: process.env.GITHUB_REPOSITORY,
        runId: process.env.GITHUB_RUN_ID, tree, token: process.env.GITHUB_TOKEN })
    } catch {
      // No successful proof (including an unavailable API) means full validation.
      console.log('No reusable validation proof; running the complete merge gate.')
    }
  }
  appendFileSync(process.env.GITHUB_OUTPUT, 'tree=' + tree + '\nreuse=' + Boolean(run) + '\n')
  console.log(run ? 'Reusing successful Checks run ' + run + ' for tree ' + tree : 'Validating tree ' + tree)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
