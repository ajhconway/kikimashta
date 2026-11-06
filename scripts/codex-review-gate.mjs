import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const summaryMarker = '<!-- codex-pull-request-review-summary -->'
const context = 'codex-review'

function isCodexSummary(comment) {
  return comment.user?.login === 'chatgpt-codex-connector[bot]' &&
    comment.user?.id === 199175422 && comment.user?.type === 'Bot' &&
    comment.performed_via_github_app?.id === 1144995 &&
    typeof comment.body === 'string' && comment.body.includes(summaryMarker)
}

// Codex currently publishes this machine-readable state in its summary comment.
// This is an observed integration format, not a guaranteed API. Fail closed if
// the format changes; do not infer completion from prose, reactions or reviews.
export function evaluateReview(headSha, comments) {
  const summary = comments.filter(isCodexSummary).sort((a, b) => b.id - a.id)[0]
  if (!summary) return { state: 'pending', description: 'Waiting for a Codex review of this commit' }
  let review
  try {
    const match = summary.body.match(/<!-- codex-review-state:v1\s+([\s\S]*?)\s+-->/)
    review = JSON.parse(match?.[1]).code_review
    if (!review || typeof review.commit_sha !== 'string') throw new Error('Invalid state')
  } catch {
    return { state: 'failure', description: 'Cannot read Codex review state; refresh or inspect the review' }
  }
  if (review.commit_sha !== headSha) {
    return { state: 'pending', description: 'Waiting for Codex to review the latest commit' }
  }
  if (review.status === 'running' || review.status === 'pending' || review.status === 'queued') {
    return { state: 'pending', description: 'Codex review is in progress' }
  }
  if (review.status !== 'completed') {
    return { state: 'failure', description: 'Codex review did not complete successfully; inspect the review' }
  }
  if (typeof review.has_any_findings !== 'boolean' || typeof review.has_unresolved_findings !== 'boolean') {
    return { state: 'failure', description: 'Codex review has incomplete finding state; inspect the review' }
  }
  if (review.has_unresolved_findings) {
    return { state: 'failure', description: 'Resolve the outstanding Codex findings before merging' }
  }
  return { state: 'success', description: 'Codex reviewed this commit with no unresolved findings' }
}

export function createApi(token, repository, fetchImpl = fetch) {
  if (!token || !/^[\w-]+\/[\w-][\w.-]*$/.test(repository ?? '')) {
    throw new Error('GH_TOKEN and a valid GITHUB_REPOSITORY are required')
  }
  return async (path, body) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`GitHub API ${response.status} for ${path}`)
    return response.json()
  }
}

export async function refreshGate({ api, event }) {
  const number = Number(event.pull_request?.number ?? event.issue?.number ?? event.inputs?.pull_request)
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('A valid pull request number is required')
  const initialPr = await api(`pulls/${number}`)
  if (initialPr.state !== 'open' || initialPr.base.ref !== 'main') return null
  // Invalidate an earlier success before refreshing a same-commit review.
  await api(`statuses/${initialPr.head.sha}`, {
    state: 'pending', description: 'Refreshing Codex review state', context, target_url: initialPr.html_url,
  })
  const comments = []
  for (let page = 1; ; page += 1) {
    const batch = await api(`issues/${number}/comments?per_page=100&page=${page}`)
    comments.push(...batch)
    if (batch.length < 100) break
  }
  // Read the PR after comments, so a stale webhook cannot pass a previous head.
  const pr = await api(`pulls/${number}`)
  if (pr.state !== 'open' || pr.base.ref !== 'main') return null
  const result = pr.draft
    ? { state: 'pending', description: 'Mark the draft ready for Codex review' }
    : evaluateReview(pr.head.sha, comments)
  await api(`statuses/${pr.head.sha}`, { ...result, context, target_url: pr.html_url })
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const api = createApi(process.env.GH_TOKEN, process.env.GITHUB_REPOSITORY)
  const result = await refreshGate({ api, event })
  console.log(result ? `${context}: ${result.state} — ${result.description}` : 'No open PR targeting main')
}
