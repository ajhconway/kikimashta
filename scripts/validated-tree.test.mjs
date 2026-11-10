import test from 'node:test'
import assert from 'node:assert/strict'
import { validatedRun } from './validated-tree.mjs'

const repository = 'owner/app', tree = 'a'.repeat(40)
const identity = { repository, tree, runId: 100, token: 'private-test-token' }
const current = { workflow_id: 7, repository: { id: 1 } }
const artifact = { name: 'validated-tree-' + tree, expired: false,
  workflow_run: { id: 99, repository_id: 1, head_repository_id: 1 } }
const run = { id: 99, workflow_id: 7, path: '.github/workflows/ci.yml', repository: { full_name: repository },
  head_repository: { full_name: repository }, head_sha: 'b'.repeat(40),
  status: 'completed', conclusion: 'success', event: 'pull_request' }
function api({ artifacts = [artifact], completed = run, commitTree = tree } = {}) {
  const calls = []
  return { calls, request: async (url, options) => {
    calls.push(url)
    assert.equal(new URL(url).origin, 'https://api.github.com')
    assert.equal(options.headers.authorization, 'Bearer private-test-token')
    assert.equal(options.redirect, 'error')
    const data = url.endsWith('/100') ? current : url.includes('/artifacts?') ? { artifacts }
      : url.includes('/git/commits/') ? { tree: { sha: commitTree } } : completed
    return { ok: true, json: async () => data }
  } }
}

test('reuses only a completed same-repository Checks run for the exact requested tree', async () => {
  const boundary = api()
  assert.equal(await validatedRun({ ...identity, request: boundary.request }), 99)
  assert.ok(boundary.calls[1].includes('name=validated-tree-' + tree))
  assert.equal(await validatedRun({ ...identity, request: api({ artifacts: [] }).request }), null)
})

test('expired, different-tree, fork and current-run markers cannot waive checks', async () => {
  for (const change of [
    { expired: true }, { name: 'validated-tree-' + 'b'.repeat(40) },
    { workflow_run: { ...artifact.workflow_run, repository_id: 2 } },
    { workflow_run: { ...artifact.workflow_run, head_repository_id: 2 } },
    { workflow_run: { ...artifact.workflow_run, id: 100 } },
  ]) {
    const boundary = api({ artifacts: [{ ...artifact, ...change }] })
    assert.equal(await validatedRun({ ...identity, request: boundary.request }), null)
    assert.equal(boundary.calls.length, 2)
  }
})

test('failed, pending, foreign-workflow and non-PR runs cannot waive checks', async () => {
  for (const change of [
    { conclusion: 'failure' }, { conclusion: 'cancelled' }, { status: 'in_progress' },
    { workflow_id: 8 }, { path: '.github/workflows/other.yml' },
    { head_repository: { full_name: 'fork/app' } }, { repository: { full_name: 'owner/other' } },
    { event: 'push' },
  ]) assert.equal(await validatedRun({ ...identity, request: api({ completed: { ...run, ...change } }).request }), null)
})

test('lookup failures and invalid identities fail rather than returning reusable proof', async () => {
  await assert.rejects(validatedRun({ ...identity, request: async () => ({ ok: false, status: 403 }) }), /HTTP 403/)
  await assert.rejects(validatedRun({ ...identity, repository: '../other' }), /Invalid validation identity/)
})

test('a marker naming this tree cannot substitute for GitHub commit-tree verification', async () => {
  assert.equal(await validatedRun({ ...identity, request: api({ commitTree: 'c'.repeat(40) }).request }), null)
  assert.equal(await validatedRun({ ...identity, request: api({ completed: { ...run, head_sha: undefined } }).request }), null)
})
