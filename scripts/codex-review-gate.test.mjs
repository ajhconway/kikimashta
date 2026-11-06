import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApi, evaluateReview, refreshGate } from './codex-review-gate.mjs'

const head = 'a'.repeat(40)
const oldHead = 'b'.repeat(40)
const clean = { commit_sha: head, status: 'completed', has_any_findings: false, has_unresolved_findings: false }
const pr = { state: 'open', draft: false, base: { ref: 'main' }, head: { sha: head }, html_url: 'https://github.com/owner/repo/pull/1' }
function summary(review = clean, overrides = {}) {
  return {
    id: 1,
    user: { login: 'chatgpt-codex-connector[bot]', id: 199175422, type: 'Bot' },
    performed_via_github_app: { id: 1144995 },
    body: `<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ${JSON.stringify({ code_review: review })} -->`,
    ...overrides,
  }
}

test('passes a completed review of this commit with no unresolved findings', () => {
  assert.equal(evaluateReview(head, [summary()]).state, 'success')
  assert.equal(evaluateReview(head, [summary({ ...clean, has_any_findings: true })]).state, 'success')
})

test('waits for an absent, running, queued or outdated review', () => {
  assert.equal(evaluateReview(head, []).state, 'pending')
  for (const status of ['running', 'pending', 'queued']) {
    assert.equal(evaluateReview(head, [summary({ ...clean, status, has_unresolved_findings: null })]).state, 'pending')
  }
  assert.equal(evaluateReview(head, [summary({ ...clean, commit_sha: oldHead })]).state, 'pending')
})

test('blocks unresolved findings, failed reviews and unknown completion states', () => {
  assert.equal(evaluateReview(head, [summary({ ...clean, has_unresolved_findings: true })]).state, 'failure')
  for (const status of ['failed', 'cancelled', 'skipped', 'unknown', null]) {
    assert.equal(evaluateReview(head, [summary({ ...clean, status })]).state, 'failure')
  }
})

test('requires explicit boolean finding state; missing values cannot pass', () => {
  for (const field of ['has_any_findings', 'has_unresolved_findings']) {
    for (const value of [undefined, null, 'false', 0]) {
      assert.equal(evaluateReview(head, [summary({ ...clean, [field]: value })]).state, 'failure')
    }
  }
})

test('fails closed when the bot summary format is missing, malformed or changes version', () => {
  for (const body of [
    '<!-- codex-pull-request-review-summary --> Completed! 👍',
    '<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 {broken} -->',
    summary().body.replace('state:v1', 'state:v2'),
    summary().body.replace('code_review', 'different_review'),
  ]) {
    assert.equal(evaluateReview(head, [summary(clean, { body })]).state, 'failure')
  }
})

test('ignores copied summaries, prose, reactions and other authors or apps', () => {
  for (const overrides of [
    { user: { login: 'author', id: 1, type: 'User' } },
    { user: { login: 'chatgpt-codex-connector[bot]', id: 1, type: 'Bot' } },
    { user: { login: 'chatgpt-codex-connector[bot]', id: 199175422, type: 'User' } },
    { performed_via_github_app: { id: 1 } },
    { performed_via_github_app: null },
    { body: 'Codex found no issues 👍' },
  ]) {
    assert.equal(evaluateReview(head, [summary(clean, overrides)]).state, 'pending')
  }
})

test('the newest trusted summary supersedes earlier success regardless of list order', () => {
  const newer = summary({ ...clean, status: 'running' }, { id: 2 })
  for (const comments of [[newer, summary()], [summary(), newer]]) {
    assert.equal(evaluateReview(head, comments).state, 'pending')
  }
})

test('refreshes from the live PR and paginates comments before publishing on the current head', async () => {
  const calls = []
  let prReads = 0
  const result = await refreshGate({
    event: { pull_request: { number: 1, head: { sha: oldHead } } },
    api: async (path, body) => {
      calls.push({ path, body })
      if (path === 'pulls/1') return ++prReads === 1 ? { ...pr, head: { sha: oldHead } } : pr
      if (body) return {}
      if (path.endsWith('page=1')) return Array.from({ length: 100 }, (_, id) => ({ id, body: 'unrelated' }))
      if (path.endsWith('page=2')) return [summary()]
      throw new Error(`Unexpected request ${path}`)
    },
  })
  assert.equal(result.state, 'success')
  assert.deepEqual(calls.filter(c => c.body).map(c => [c.path, c.body.state, c.body.context]), [
    [`statuses/${oldHead}`, 'pending', 'codex-review'],
    [`statuses/${head}`, 'success', 'codex-review'],
  ])
  assert.equal(calls.at(-1).body.target_url, pr.html_url)
})

test('comment events and manual refreshes work without trusting event comment content', async () => {
  for (const event of [{ issue: { number: 1 }, comment: summary() }, { inputs: { pull_request: '1' } }]) {
    const writes = []
    const result = await refreshGate({ event, api: async (path, body) => {
      if (body) { writes.push(body); return {} }
      return path === 'pulls/1' ? pr : []
    } })
    assert.equal(result.state, 'pending')
    assert.equal(writes.at(-1).state, 'pending')
  }
})

test('does not pass draft PRs or publish statuses for closed PRs and other target branches', async () => {
  for (const change of [{ draft: true }, { state: 'closed' }, { base: { ref: 'other' } }]) {
    const writes = []
    const result = await refreshGate({ event: { issue: { number: 1 } }, api: async (path, body) => {
      if (body) { writes.push(body); return {} }
      return path === 'pulls/1' ? { ...pr, ...change } : [summary()]
    } })
    if (change.draft) assert.equal(result.state, 'pending')
    else { assert.equal(result, null); assert.equal(writes.length, 0) }
  }
})

test('an interrupted refresh leaves pending status, not a previous success', async () => {
  const writes = []
  await assert.rejects(refreshGate({ event: { issue: { number: 1 } }, api: async (path, body) => {
    if (body) { writes.push(body); return {} }
    if (path === 'pulls/1') return pr
    throw new Error('API unavailable')
  } }), /API unavailable/)
  assert.deepEqual(writes.map(w => w.state), ['pending'])
})

test('a bot edit that removes its summary marker invalidates a same-head success', async () => {
  let comments = [summary()]
  let latestStatus
  const api = async (path, body) => {
    if (body) { latestStatus = body; return {} }
    return path === 'pulls/1' ? pr : comments
  }
  const event = { issue: { number: 1 }, action: 'edited' }
  await refreshGate({ api, event })
  assert.equal(latestStatus.state, 'success')
  comments = [summary(clean, { body: 'Changed integration format' })]
  await refreshGate({ api, event })
  assert.equal(latestStatus.state, 'pending')
  assert.equal(latestStatus.context, 'codex-review')
})

test('rejects malformed PR numbers without making requests', async () => {
  for (const value of ['1; malicious', '-1', '1.5', '0', undefined]) {
    await assert.rejects(refreshGate({ event: { inputs: { pull_request: value } }, api: () => assert.fail('No request expected') }), /valid pull request/)
  }
})

test('GitHub requests use the fixed API origin, token header and POSTed JSON status', async () => {
  const calls = []
  const api = createApi('test-token', 'owner/repo', async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ ok: true }) }
  })
  await api('pulls/1')
  await api(`statuses/${head}`, { state: 'pending' })
  assert.equal(calls[0].url, 'https://api.github.com/repos/owner/repo/pulls/1')
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls[0].options.headers.authorization, 'Bearer test-token')
  assert.equal(calls[1].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[1].options.body), { state: 'pending' })
})

test('API errors do not leak tokens or response bodies and invalid configuration is rejected', async () => {
  assert.throws(() => createApi('', 'owner/repo'), /required/)
  assert.throws(() => createApi('token', '../invalid'), /required/)
  const api = createApi('secret', 'owner/repo', async () => ({ ok: false, status: 403 }))
  await assert.rejects(api('pulls/1'), { message: 'GitHub API 403 for pulls/1' })
})
