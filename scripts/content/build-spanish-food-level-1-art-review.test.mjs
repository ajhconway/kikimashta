import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { inspectFoodLevel1Art, buildFoodLevel1ArtReview, loadFoodArtworkAcceptance } from './build-spanish-food-level-1-art-review.mjs'
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
  await save(root, ART + '/selection.json', { issue: 218, pack: 'es-419-food-1', versions: {} })
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


test('rice/beans/tomato amendment verifies original snapshots and changes only three selected pictures', async t => {
  const { root, draft, requests } = await fixture(t), amendmentPath = 'content/spanish-food-1/artwork-revisions-v1.json'
  const amendmentBytes = await readFile(join(source, amendmentPath)), amendment = JSON.parse(amendmentBytes)
  const copy = async path => { await mkdir(dirname(join(root, path)), { recursive: true }); await copyFile(join(source, path), join(root, path)) }
  for (const q of requests.requests) {
    await copy(ART + `/records/${q.slug}-v1.json`)
    await copy(ART + `/originals/${q.slug}-v1.png`)
  }
  for (const path of [amendmentPath, amendment.previousManifest, amendment.previousSelection, 'content/catalog/ja.json', ...amendment.targets.map(t => t.request)]) await copy(path)
  await save(root, ART + '/selection.json', { issue: 218, pack: 'es-419-food-1', versions: { rice: 1, beans: 2, tomato: 2 } })
  const previous = await json(join(root, amendment.previousManifest))
  const protectedPaths = [...new Set([DRAFT, AUTH, ART + '/requests.json', amendment.previousManifest, amendment.previousSelection, 'content/catalog/ja.json', ...previous.images.map(i => i.path), ...requests.requests.map(q => ART + `/records/${q.slug}-v1.json`), ...draft.items.map(i => i.existingBank).filter(Boolean)])]
  const originalInputs = new Map(await Promise.all(protectedPaths.map(async path => [path, await readFile(join(root, path))])))
  const pending = await buildFoodLevel1ArtReview(root)
  assert.equal(pending.pendingImages, 3); assert.equal(pending.reusedImages, 24); assert.equal(pending.generatedImages, 9)
  assert.equal(pending.status, 'artwork-generation-in-progress')
  const pictureBytes = await readFile(join(root, requests.requests[0].referencePath))
  for (const target of amendment.targets) {
    const q = await json(join(root, target.request)), path = `originals/${target.slug}-v${target.version}.png`
    await save(root, ART + '/' + path, pictureBytes)
    await save(root, ART + `/records/${target.slug}-v${target.version}.json`, { id: target.id, slug: target.slug, version: target.version, path, sha256: hash(pictureBytes),
      promptSha256: hash(q.prompt), referenceSha256: q.referenceSha256, tool: 'built-in image_gen', supersedes: target.previousPath, supersedesSha256: target.previousSha256 })
  }
  const complete = await buildFoodLevel1ArtReview(root)
  assert.equal(complete.generatedImages, 12); assert.equal(complete.reusedImages, 24); assert.equal(complete.pendingImages, 0); assert.equal(complete.expectedNewImages, 12)
  assert.equal(complete.images.length, 36); assert.equal(new Set(complete.images.map(i => i.id)).size, 36); assert.equal(complete.verifiedOriginalVersions, 14)
  assert.equal(complete.artworkAmendmentSha256, hash(amendmentBytes)); assert.equal(complete.status, 'generated-awaiting-owner-artwork-review')
  assert.equal(complete.images.filter(image => {
    const old = previous.images.find(i => i.id === image.id)
    return old.path === image.path && old.sha256 === image.sha256
  }).length, 33)
  assert.equal(complete.images.find(i => i.id === 'es-419-travel-rice').source, 'generated')
  assert.equal(complete.images.find(i => i.id === 'es-419-food-beans').version, 2)
  assert.equal(complete.images.find(i => i.id === 'es-419-food-tomato').version, 2)
  const rawRice = amendment.targets[0]
  assert.equal(complete.japaneseRicePreserved.path, rawRice.previousPath); assert.equal(complete.japaneseRicePreserved.sha256, rawRice.previousSha256)
  for (const [path, data] of originalInputs) assert.deepEqual(await readFile(join(root, path)), data)
  const before = await galleryBytes(root)
  const expectUnchanged = async (pattern) => { await assert.rejects(buildFoodLevel1ArtReview(root), pattern); assert.deepEqual(await galleryBytes(root), before) }
  await save(root, amendmentPath, JSON.stringify({ ...amendment, ownerMessage: 'changed feedback' }))
  await expectUnchanged(/Authorized Food artwork amendment changed/)
  await writeFile(join(root, amendmentPath), amendmentBytes)
  const snapshotBytes = await readFile(join(root, amendment.previousManifest))
  await save(root, amendment.previousManifest, Buffer.concat([snapshotBytes, Buffer.from(' ')]))
  await expectUnchanged(/snapshots changed/)
  await writeFile(join(root, amendment.previousManifest), snapshotBytes)
  const target = amendment.targets[1], requestBytes = await readFile(join(root, target.request)), q = JSON.parse(requestBytes)
  q.referencePath = '../../unapproved.png'
  await save(root, target.request, q)
  await expectUnchanged(/revision request changed/)
  await writeFile(join(root, target.request), requestBytes)
  const recordPath = ART + `/records/${target.slug}-v${target.version}.json`, recordBytes = await readFile(join(root, recordPath)), record = JSON.parse(recordBytes)
  record.path = '../../unapproved.png'
  await save(root, recordPath, record)
  await expectUnchanged(/revision record changed/)
  await writeFile(join(root, recordPath), recordBytes)
  const revisedPath = ART + '/' + JSON.parse(recordBytes).path
  await save(root, revisedPath, 'changed revised image')
  await expectUnchanged(/Revised Food image bytes changed/)
  await save(root, revisedPath, pictureBytes)
  const originalBeanBytes = await readFile(join(root, target.previousPath))
  await save(root, target.previousPath, 'changed original bean image')
  await expectUnchanged(/Generated Food image bytes changed/)
  await writeFile(join(root, target.previousPath), originalBeanBytes)
  const japaneseBytes = await readFile(join(root, 'content/catalog/ja.json')), japanese = JSON.parse(japaneseBytes)
  japanese.items.find(i => i.id === 'ja-v-0958f7553d9f').image.src = 'images/approved/changed.png'
  await save(root, 'content/catalog/ja.json', japanese)
  await expectUnchanged(/Japanese uncooked rice mapping changed/)
  await writeFile(join(root, 'content/catalog/ja.json'), japaneseBytes)
  await rm(join(root, recordPath)); await symlink(join(root, 'missing-revision-record'), join(root, recordPath))
  await expectUnchanged(/symlinks/)
  await rm(join(root, recordPath)); await writeFile(join(root, recordPath), recordBytes)
  for (const [path, data] of originalInputs) assert.deepEqual(await readFile(join(root, path)), data)
})


test('artwork acceptance updates only HTML and rejects stale or broader acceptance before any gallery writes', async t => {
  const { root, requests } = await fixture(t), amendmentPath = 'content/spanish-food-1/artwork-revisions-v1.json'
  const amendment = await json(join(source, amendmentPath)), acceptancePath = 'content/spanish-food-1/artwork-acceptance.json'
  const paths = [amendmentPath, amendment.previousManifest, amendment.previousSelection, ART + '/selection.json', 'content/catalog/ja.json', ...amendment.targets.map(target => target.request)]
  for (const q of requests.requests) paths.push(ART + `/originals/${q.slug}-v1.png`, ART + `/records/${q.slug}-v1.json`)
  for (const target of amendment.targets) paths.push(ART + `/originals/${target.slug}-v${target.version}.png`, ART + `/records/${target.slug}-v${target.version}.json`)
  for (const path of new Set(paths)) { await mkdir(dirname(join(root, path)), { recursive: true }); await copyFile(join(source, path), join(root, path)) }
  const manifest = await inspectFoodLevel1Art(root), manifestText = JSON.stringify(manifest, null, 2) + '\n'
  assert.equal(hash(manifestText), 'c47af3dc7cd25a15529988ceebe323640210dc3a75e730d6774ec33c7a457e87')
  assert.equal(await loadFoodArtworkAcceptance(root, manifest), null)
  await buildFoodLevel1ArtReview(root)
  assert.ok((await readFile(join(root, ART, 'review.html'), 'utf8')).includes('Artwork acceptance remains pending'))
  const acceptedBytes = await readFile(join(source, acceptancePath)), acceptance = JSON.parse(acceptedBytes)
  await save(root, acceptancePath, acceptedBytes)
  assert.equal((await loadFoodArtworkAcceptance(root, manifest)).status, 'artwork-accepted')
  const result = await buildFoodLevel1ArtReview(root)
  assert.deepEqual(result, manifest); assert.equal(await readFile(join(root, ART, 'manifest.json'), 'utf8'), manifestText)
  const before = await galleryBytes(root)
  for (const html of before.slice(1).map(bytes => bytes.toString())) {
    assert.ok(html.includes('All 36 pictures are accepted by the owner'))
    assert.ok(html.includes('New audio and runtime activation remain separate'))
    assert.ok(!html.includes('Artwork acceptance remains pending'))
    assert.equal((html.match(/<img /g) ?? []).length, 36)
  }
  for (const mutate of [
    a => { a.status = 'artwork-generation-authorized' },
    a => { a.artworkManifestSha256 = 'changed-manifest-hash' },
    a => { a.selectionSha256 = 'changed-selection-hash' },
    a => { a.artworkAmendmentSha256 = 'changed-amendment-hash' },
    a => { a.images[0].sha256 = 'changed-picture-hash' },
    a => { a.images.reverse() },
    a => { a.pictures = 35 },
    a => { a.scope = 'Artwork and runtime activation accepted' },
  ]) {
    const changed = structuredClone(acceptance); mutate(changed)
    await save(root, acceptancePath, changed)
    await assert.rejects(loadFoodArtworkAcceptance(root, manifest), /Food artwork acceptance differs/)
    assert.deepEqual(await galleryBytes(root), before)
  }
  await assert.rejects(buildFoodLevel1ArtReview(root), /Food artwork acceptance differs/)
  assert.deepEqual(await galleryBytes(root), before)
  assert.equal(await readFile(join(root, ART, 'manifest.json'), 'utf8'), manifestText)
})
