import test from 'node:test'
import { inspectPngAlpha } from './png-alpha.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = new URL('../../', import.meta.url)
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'))
const activation = read('content/card-regeneration/activation.json')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const banks = [read('content/ja.json'), read('content/catalog/ja.json')]
const library = read('public/vocabulary/library-data.json').cards

test('all 192 active illustrations resolve to the approved or owner-authorized draft selection in the app and library', () => {
  assert.equal(activation.assets.length, 192)
  assert.equal(new Set(activation.assets.map(asset => asset.id)).size, 192)
  for (const asset of activation.assets) {
    const manifest = read(asset.manifestPath)
    const selected = manifest.assets.find(item => item.id === asset.id)
    assert.equal(manifest.status, 'approved')
    if (asset.replaceLater) {
      assert.equal(selected.status, 'replace-later')
      assert.equal(selected.publishDraft, true)
      assert.equal(manifest.deferredDraftPublication.authorized, true)
      assert.ok(manifest.deferredDraftPublication.cardIds.includes(asset.id))
    } else assert.equal(selected.status, 'approved')
    assert.equal(asset.sourcePath, selected.path)
    assert.equal(hash(readFileSync(new URL(asset.sourcePath, root))), selected.sha256)
    const delivery = readFileSync(new URL(asset.path, root))
    assert.equal(hash(delivery), asset.sha256)
    assert.equal(delivery.length, asset.bytes)
    if (selected.transparentBackground) {
      assert.equal(asset.format, 'png')
      const pixels = inspectPngAlpha(delivery)
      assert.equal(pixels.width, 640)
      assert.equal(pixels.height, 640)
      assert.ok(pixels.transparentPixels > 0)
      assert.ok(pixels.opaquePixels > 0)
      const sourcePixels = inspectPngAlpha(readFileSync(new URL(asset.sourcePath, root)))
      const scale = pixels.width * pixels.height / (sourcePixels.width * sourcePixels.height)
      if (sourcePixels.opaqueWhitePixels * scale >= Math.max(1, sourcePixels.opaquePixels * scale / 1000)) assert.ok(pixels.opaqueWhitePixels > 0)
    } else assert.equal(delivery.subarray(0, 2).toString('hex'), 'ffd8', 'Historical opaque delivery must retain JPEG bytes')
    const items = banks.flatMap(bank => bank.items).filter(item => item.id === asset.id)
    assert.ok(items.length)
    for (const item of items) assert.equal(`public/${item.image.src}`, asset.path)
    const card = library.find(item => item.id === asset.id)
    if (card) {
      assert.equal(card.image.src, `../${asset.path.slice('public/'.length)}`)
      assert.equal(card.image.alt, items[0].image.alt)
      assert.equal(card.concept, items[0].image.alt)
      assert.equal(card.replaceLater, asset.replaceLater)
    }
    if (selected.followUp) assert.equal(asset.followUp, selected.followUp)
  }
})

test('legacy SVG regeneration preserves active raster files and their visual descriptions', t => {
  const target = mkdtempSync(join(tmpdir(), 'kikimashta-approved-artwork-'))
  t.after(() => rmSync(target, { recursive: true, force: true }))
  for (const path of ['scripts/content', 'content/catalog', 'content/visuals']) {
    cpSync(new URL(path, root), join(target, path), { recursive: true })
  }
  for (const asset of activation.assets) {
    mkdirSync(dirname(join(target, asset.path)), { recursive: true })
    cpSync(new URL(asset.path, root), join(target, asset.path))
  }
  for (const script of ['illustrate-levels-1-2.mjs', 'illustrate-levels-3-4.mjs', 'illustrate-level-5.mjs']) {
    execFileSync(process.execPath, [join(target, 'scripts/content', script)], { cwd: target })
  }
  for (const asset of activation.assets) assert.equal(hash(readFileSync(join(target, asset.path))), asset.sha256)
  for (const file of ['levels-1-2.json', 'levels-3-4.json', 'level-5.json']) {
    const after = JSON.parse(readFileSync(join(target, 'content/visuals', file), 'utf8'))
    for (const before of read(`content/visuals/${file}`)) {
      if (activation.assets.some(asset => asset.id === before.id)) assert.deepEqual(after.find(item => item.id === before.id), before)
    }
  }
})


test('the five approved numerical reference replacements are selected in their original batches without duplicate activation records', () => {
  const numerical = read('artifacts/card-regeneration/batch-10/manifest.json')
  assert.equal(numerical.assets.length, 33)
  assert.equal(numerical.approvedReferenceRevisions.length, 5)
  assert.deepEqual(numerical.referenceRevisions, [])
  for (const revision of numerical.approvedReferenceRevisions) {
    const original = read(revision.promotedToManifest)
    const selected = original.assets.find(asset => asset.id === revision.id)
    assert.equal(selected.path, revision.promotedPath)
    assert.equal(selected.sha256, revision.sha256)
    assert.equal(selected.status, 'approved')
    assert.ok(selected.previousVersions.some(old => old.path === revision.approvedSourcePath && old.sha256 === revision.approvedSourceSha256))
    assert.deepEqual(readFileSync(new URL(selected.path, root)), readFileSync(new URL(revision.path, root)))
    const records = activation.assets.filter(record => record.id === revision.id)
    assert.equal(records.length, 1)
    assert.equal(records[0].sourcePath, selected.path)
    assert.equal(records[0].sourceSha256, selected.sha256)
  }
})

test('batch11 publishes15approved selections and nine explicitly authorized Replace later drafts while removed Form stays inactive', () => {
  const reviewed = read('artifacts/card-regeneration/batch-11/manifest.json')
  assert.equal(reviewed.status, 'approved')
  const approved = reviewed.assets.filter(asset => asset.status === 'approved')
  const deferred = reviewed.assets.filter(asset => asset.status === 'replace-later')
  const removed = reviewed.assets.filter(asset => asset.status === 'removed')
  assert.equal(approved.length, 15)
  assert.equal(deferred.length, 9)
  assert.equal(removed.length, 1)
  assert.equal(reviewed.assets.length, 25)
  for (const asset of [...approved, ...deferred]) {
    const active = activation.assets.find(record => record.id === asset.id)
    assert.equal(active.sourcePath, asset.path)
    assert.equal(active.sourceSha256, asset.sha256)
    assert.ok(library.some(card => card.id === asset.id))
  }
  assert.deepEqual(new Set(reviewed.deferredDraftPublication.cardIds), new Set(deferred.map(asset => asset.id)))
  for (const asset of deferred) {
    assert.equal(asset.publishDraft, true)
    assert.equal(activation.assets.find(record => record.id === asset.id).replaceLater, true)
    assert.equal(library.find(card => card.id === asset.id).replaceLater, true)
  }
  for (const asset of removed) assert.ok(!activation.assets.some(record => record.id === asset.id))
  const removedId = 'ja-v-4fd3d09440c1'
  assert.equal(removed[0].id, removedId)
  assert.ok(!library.some(card => card.id === removedId))
  assert.ok(read('content/catalog/review-overrides.json')[removedId].removalReason)
})
