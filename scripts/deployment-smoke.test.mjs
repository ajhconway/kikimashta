import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deploymentSmoke } from './deployment-smoke.mjs'

const revision = 'a'.repeat(40)
async function fixture(t) {
  const dist = await mkdtemp(join(tmpdir(), 'publication-smoke-'))
  t.after(() => rm(dist, { recursive: true, force: true }))
  const files = new Map([
    ['index.html', '<script type="module" src="/assets/app.js"></script>'],
    ['vocabulary/index.html', '<script type="module" src="/assets/library.js"></script>'],
    ['credits.html', 'data-source-link href="https://github.com/ajhconway/kikimashta/tree/' + revision + '"'],
    ['assets/app.js', 'app'], ['assets/library.js', 'library'],
    ['images/a.png', 'image'], ['audio/a.mp3', 'audio'], ['offline-worker.js', 'worker'],
  ])
  const hashes = Object.fromEntries([...files].map(([path, value]) => [path, createHash('sha256').update(value).digest('hex')]))
  files.set('offline-manifest.json', JSON.stringify({ hashes }))
  for (const [path, value] of files) {
    await mkdir(join(dist, path, '..'), { recursive: true })
    await writeFile(join(dist, path), value)
  }
  return { dist, files }
}
const response = (value, ok = true) => ({ ok, status: ok ? 200 : 404,
  arrayBuffer: async () => Buffer.from(value) })
const resource = url => url.pathname === '/' ? 'index.html'
  : url.pathname === '/vocabulary/' ? 'vocabulary/index.html' : url.pathname.slice(1)

test('publication smoke checks exact revision, both entry points, worker and representative asset bytes', async t => {
  const { dist, files } = await fixture(t), calls = []
  const count = await deploymentSmoke({ dist, revision, baseURL: 'https://example.test/', request: async (url, options) => {
    calls.push(url)
    assert.equal(url.searchParams.get('revision'), revision)
    assert.equal(options.redirect, 'error')
    return response(files.get(resource(url)))
  } })
  assert.equal(count, 9)
  assert.equal(calls.length, 9)
})

test('missing resources and stale deployed bytes fail the publication smoke', async t => {
  const { dist, files } = await fixture(t)
  for (const missing of [false, true]) {
    await assert.rejects(deploymentSmoke({ dist, revision, baseURL: 'https://example.test/', request: async url =>
      url.pathname === '/offline-worker.js' ? response('stale worker', !missing) : response(files.get(resource(url)))
    }), missing ? /HTTP 404/ : /bytes differ/)
  }
})

test('an incorrectly pinned build cannot pass by serving its own bytes', async t => {
  const { dist } = await fixture(t)
  await assert.rejects(deploymentSmoke({ dist, revision: 'b'.repeat(40), baseURL: 'https://example.test/',
    request: () => { throw new Error('must not request before preflight') } }), /source notice/)
})
