import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { inspectFoodLevel1Art, buildFoodLevel1ArtReview } from './build-spanish-food-level-1-art-review.mjs'
const source = fileURLToPath(new URL('../../', import.meta.url)), ART = 'artifacts/spanish-food-1-art', DRAFT = 'content/spanish-food-1/draft.json', AUTH = 'content/spanish-food-1/generation-approval.json'
const hash = b => createHash('sha256').update(b).digest('hex'), json = async p => JSON.parse(await readFile(p, 'utf8'))
const save = async (root, path, value) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n') }
async function fixture(t, full = true) {
  const root = await mkdtemp(join(tmpdir(), 'food-art-review-')); t.after(() => rm(root, { recursive: true, force: true }))
  const draft = await json(join(source, DRAFT)), requests = await json(join(source, ART, 'requests.json'))
  const paths = [DRAFT, AUTH, ART + '/requests.json', ART + '/selection.json']
  if (full) for (const item of draft.items) {
    if (item.artwork.source === 'approved-reuse') paths.push(item.artwork.path, item.artwork.evidence)
    if (item.existingBank) paths.push(item.existingBank)
  }
  if (full) paths.push(requests.requests[0].referencePath)
  for (const path of new Set(paths)) { await mkdir(dirname(join(root, path)), { recursive: true }); await copyFile(join(source, path), join(root, path)) }
  return { root, draft, requests }
}
async function generateFixture(root, q) {
  const bytes = await readFile(join(root, q.referencePath)), path = `originals/${q.slug}-v1.png`
  await save(root, ART + '/' + path, bytes)
  const record = { id: q.id, slug: q.slug, version: 1, path, sha256: hash(bytes), promptSha256: hash(q.prompt), referenceSha256: q.referenceSha256, tool: 'built-in image_gen' }
  await save(root, ART + `/records/${q.slug}-v1.json`, record)
  return { record, bytes }
}
async function galleryBytes(root) {
  return Promise.all(['manifest.json', 'review.html', 'artwork.html'].map(file => readFile(join(root, ART, file))))
}
async function rebindFixture(root, draft) {
  await save(root, DRAFT, draft)
  const requests = await json(join(root, ART, 'requests.json')), auth = await json(join(root, AUTH))
  auth.draftSha256 = hash(await readFile(join(root, DRAFT))); requests.draftSha256 = auth.draftSha256
  await save(root, ART + '/requests.json', requests)
  auth.requestsSha256 = hash(await readFile(join(root, ART, 'requests.json')))
  await save(root, AUTH, auth)
}

test('artwork-only authorization and immutable input hashes fail before media is read', async t => {
  const { root } = await fixture(t, false), requestBytes = await readFile(join(root, ART, 'requests.json')), path = join(root, AUTH), bytes = await readFile(path), auth = JSON.parse(bytes)
  auth.audioGenerationAuthorized = true
  await save(root, AUTH, auth)
  await assert.rejects(inspectFoodLevel1Art(root), /authorization/)
  await writeFile(path, bytes)
  await save(root, ART + '/requests.json', '{}')
  await assert.rejects(inspectFoodLevel1Art(root), /approved inputs changed/)
  await save(root, ART + '/requests.json', requestBytes)
  await save(root, ART + '/selection.json', { issue: 218, pack: 'es-419-food-1', versions: 3 })
  await assert.rejects(inspectFoodLevel1Art(root), /request or selection scope changed/)
  await assert.rejects(readFile(join(root, ART, 'manifest.json')), { code: 'ENOENT' })
})

test('read-only preflight preserves 24 Spanish identities and builds pending then complete 36-picture artwork review', async t => {
  const { root, draft, requests } = await fixture(t)
  const inputs = await Promise.all([DRAFT, AUTH, ART + '/requests.json'].map(path => readFile(join(root, path))))
  const pending = await inspectFoodLevel1Art(root)
  assert.equal(pending.generatedImages, 0); assert.equal(pending.reusedImages, 25); assert.equal(pending.pendingImages, 11)
  assert.equal(pending.status, 'artwork-generation-in-progress')
  await assert.rejects(readFile(join(root, ART, 'review.html')), { code: 'ENOENT' })
  for (const q of requests.requests) await generateFixture(root, q)
  const complete = await buildFoodLevel1ArtReview(root)
  assert.equal(complete.words, 36); assert.equal(complete.generatedImages, 11); assert.equal(complete.reusedImages, 25); assert.equal(complete.pendingImages, 0)
  assert.equal(complete.status, 'generated-awaiting-owner-artwork-review')
  assert.equal(complete.audioGenerationAuthorized, false); assert.equal(complete.runtimeActivationAuthorized, false)
  const existing = complete.images.filter(i => i.membership === 'existing-spanish-item')
  assert.equal(existing.length, 24); assert.deepEqual(existing.map(i => i.id), draft.items.filter(i => i.membership === 'existing-spanish-item').map(i => i.id))
  const html = await readFile(join(root, ART, 'review.html'), 'utf8')
  assert.equal((html.match(/<article /g) ?? []).length, 36); assert.equal((html.match(/<img /g) ?? []).length, 36)
  assert.ok(html.includes('All 36 pictures are ready')); assert.ok(html.includes('New illustration')); assert.ok(html.includes('Approved artwork reuse'))
  assert.ok(!html.includes('<audio')); assert.ok(!html.includes('Picture generation pending'))
  assert.ok(html.includes('id="search"')); assert.ok(html.includes('id="group"')); assert.ok(html.includes('id="source"'))
  assert.deepEqual(await Promise.all([DRAFT, AUTH, ART + '/requests.json'].map(path => readFile(join(root, path)))), inputs)
})

test('tampered generated/reused media, source identity and record paths preserve every prior output', async t => {
  const { root, draft, requests } = await fixture(t), q = requests.requests[0], generated = await generateFixture(root, q)
  await buildFoodLevel1ArtReview(root); const before = await galleryBytes(root)
  await save(root, ART + '/' + generated.record.path, 'changed generated PNG')
  await assert.rejects(buildFoodLevel1ArtReview(root), /Generated Food image bytes changed/)
  assert.deepEqual(await galleryBytes(root), before)
  await save(root, ART + '/' + generated.record.path, generated.bytes)
  const reused = draft.items.find(i => i.artwork.source === 'approved-reuse'), reuseBytes = await readFile(join(root, reused.artwork.path))
  await save(root, reused.artwork.path, 'changed accepted image')
  await assert.rejects(buildFoodLevel1ArtReview(root), /Approved reuse bytes changed/)
  assert.deepEqual(await galleryBytes(root), before)
  await save(root, reused.artwork.path, reuseBytes)
  generated.record.path = '../../unreviewed.png'
  await save(root, ART + `/records/${q.slug}-v1.json`, generated.record)
  await assert.rejects(buildFoodLevel1ArtReview(root), /record identity changed/)
  assert.deepEqual(await galleryBytes(root), before)
  generated.record.path = `originals/${q.slug}-v1.png`
  await save(root, ART + `/records/${q.slug}-v1.json`, generated.record)
  reused.artwork.sourceId = 'another-accepted-source'
  await rebindFixture(root, draft)
  await assert.rejects(buildFoodLevel1ArtReview(root), /Existing Spanish identity or evidence changed/)
  assert.deepEqual(await galleryBytes(root), before)
})

test('dangling input links and output symlinks reject without altering originals or existing gallery files', async t => {
  const { root, requests } = await fixture(t), q = requests.requests[0]
  await buildFoodLevel1ArtReview(root); const before = await galleryBytes(root)
  const recordPath = ART + `/records/${q.slug}-v1.json`
  await mkdir(dirname(join(root, recordPath)), { recursive: true })
  await symlink(join(root, 'missing-record'), join(root, recordPath))
  await assert.rejects(buildFoodLevel1ArtReview(root), /symlinks/)
  assert.deepEqual(await galleryBytes(root), before)
  await rm(join(root, recordPath))
  await save(root, 'sentinel.txt', 'unchanged target')
  await rm(join(root, ART, 'artwork.html'))
  await symlink(join(root, 'sentinel.txt'), join(root, ART, 'artwork.html'))
  await assert.rejects(buildFoodLevel1ArtReview(root), /symlinks/)
  assert.deepEqual(await readFile(join(root, ART, 'manifest.json')), before[0])
  assert.deepEqual(await readFile(join(root, ART, 'review.html')), before[1])
  assert.equal(await readFile(join(root, 'sentinel.txt'), 'utf8'), 'unchanged target')
})
