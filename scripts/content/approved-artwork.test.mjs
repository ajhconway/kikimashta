import test from 'node:test'
import { inspectPngAlpha } from './png-alpha.mjs'
import { reviewedImage } from './reviewed-image.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = new URL('../../', import.meta.url)
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'))
const activation = read('content/card-regeneration/activation.json')
const source = path => reviewedImage({ root: fileURLToPath(root), reviewPath: path }).bytes
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const banks = [read('content/ja.json'), read('content/catalog/ja.json')]
const library = read('public/vocabulary/library-data.json').cards

test('all 264 active illustrations resolve to the approved selection in the app and library', () => {
  assert.equal(activation.assets.length, 264)
  assert.equal(new Set(activation.assets.map(asset => asset.id)).size, 264)
  for (const asset of activation.assets) {
    const manifest = read(asset.manifestPath)
    const selected = manifest.assets.find(item => item.id === asset.id)
    assert.equal(manifest.status, 'approved')
    assert.equal(selected.status, 'approved')
    assert.equal(asset.sourcePath, selected.path)
    assert.equal(hash(source(asset.sourcePath)), selected.sha256)
    const delivery = readFileSync(new URL(asset.path, root))
    assert.equal(hash(delivery), asset.sha256)
    assert.equal(delivery.length, asset.bytes)
    if (selected.transparentBackground) {
      assert.equal(asset.format, 'png')
      const pixels = inspectPngAlpha(delivery)
      assert.equal(Math.max(pixels.width, pixels.height), 640)
      assert.ok(pixels.transparentPixels > 0)
      assert.ok(pixels.opaquePixels > 0)
      const sourcePixels = inspectPngAlpha(source(asset.sourcePath))
      assert.ok(Math.abs(pixels.width / pixels.height - sourcePixels.width / sourcePixels.height) < 0.01, 'Delivery preserves source proportions')
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

test('all 22 shipped visual-reference selections retain exact owner approval and existing practice eligibility', () => {
  const manifest = read('artifacts/visual-reference-art-213/manifest.json')
  const approvals = read('artifacts/visual-reference-art-213/approvals.json')
  const planned = read('content/card-regeneration/prompts.json').cards
  const pool = read('content/practice-pool.json').itemIds
  assert.equal(manifest.assets.length, 22)
  assert.equal(manifest.releaseApproval.selections.length, 22)
  assert.equal(approvals.approvals.length, 22)
  for (const asset of manifest.assets) {
    const record = activation.assets.find(record => record.id === asset.id)
    assert.equal(record.manifestPath, 'artifacts/visual-reference-art-213/manifest.json')
    assert.equal(record.sourcePath, asset.path)
    assert.equal(asset.approval.sha256, asset.sha256)
    assert.equal(asset.approval.selectedVersion, asset.selectedVersion)
    assert.equal(asset.approval.scope, 'artwork only')
    assert.ok(asset.approval.ownerStatement)
    assert.ok(asset.versions.some(version => version.version === asset.selectedVersion && version.path === asset.path && version.sha256 === asset.sha256))
    assert.deepEqual(approvals.approvals.find(a => a.id === asset.id), { id: asset.id, text: asset.text, path: asset.path, ...asset.approval })
    assert.deepEqual(manifest.releaseApproval.selections.find(a => a.id === asset.id), { id: asset.id, path: asset.path, sha256: asset.sha256, selectedVersion: asset.selectedVersion })
    assert.equal(planned.find(card => card.id === asset.id).artworkStatus, 'approved')
    assert.ok(!pool.includes(asset.id), 'Artwork shipment does not add new picture practice eligibility')
  }
  assert.equal(manifest.assets.find(a => a.text === '年').selectedVersion, 1)
  assert.equal(manifest.assets.find(a => a.text === '左手').selectedVersion, 4)
  assert.equal(manifest.assets.find(a => a.text === '右手').selectedVersion, 5)
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
    assert.deepEqual(source(selected.path), source(revision.path))
    const records = activation.assets.filter(record => record.id === revision.id)
    assert.equal(records.length, 1)
    assert.equal(records[0].sourcePath, selected.path)
    assert.equal(records[0].sourceSha256, selected.sha256)
  }
})

test('all 31 shipped picture selections retain exact batch acceptance, version history and frozen review scope', () => {
  const manifest = read('artifacts/picture-art-229/manifest.json')
  const approvals = read('artifacts/picture-art-229/approvals.json')
  const plan = read('artifacts/picture-art-229/plan.json')
  const planned = read('content/card-regeneration/prompts.json').cards
  assert.equal(manifest.assets.length, 31)
  assert.equal(manifest.releaseApproval.ownerStatement, "Ok, let's ship this updated artwork.")
  assert.equal(manifest.releaseApproval.selections.length, 31)
  assert.equal(approvals.assets.length, 31)
  assert.deepEqual(manifest.assets.map(asset => asset.id).sort(), plan.items.map(item => item.id).sort())
  assert.ok(plan.items.every(item => item.category === 'picture'))
  for (const asset of manifest.assets) {
    const record = activation.assets.find(record => record.id === asset.id)
    assert.equal(record.manifestPath, 'artifacts/picture-art-229/manifest.json')
    assert.equal(record.sourcePath, asset.path)
    assert.equal(asset.approval.sha256, asset.sha256)
    assert.equal(asset.approval.selectedVersion, asset.selectedVersion)
    assert.equal(asset.approval.scope, 'artwork only')
    assert.ok(asset.approval.ownerStatement)
    assert.ok(asset.versions.some(version => version.version === asset.selectedVersion && version.path === asset.path && version.sha256 === asset.sha256))
    const approval = approvals.assets.find(approval => approval.id === asset.id)
    assert.equal(approval.sha256, asset.sha256)
    assert.equal(approval.selectedVersion, asset.selectedVersion)
    assert.equal(approval.path, asset.path)
    assert.deepEqual(manifest.releaseApproval.selections.find(selection => selection.id === asset.id), { id: asset.id, path: asset.path, sha256: asset.sha256, selectedVersion: asset.selectedVersion })
    assert.equal(planned.find(card => card.id === asset.id).artworkStatus, 'approved')
    for (const version of asset.versions) assert.equal(hash(source(version.path)), version.sha256, 'Original and selected PNG versions stay intact')
    if (asset.sourceKind === 'shared-new') {
      const shared = manifest.assets.find(source => source.id === asset.sharedFromId)
      assert.equal(asset.path, shared.path)
      assert.equal(asset.sha256, shared.sha256)
    }
    assert.equal(asset.transparentBackground, asset.text !== '白')
  }
  assert.equal(manifest.assets.find(asset => asset.text === '皮').selectedVersion, 4)
  assert.equal(manifest.assets.find(asset => asset.text === '町').selectedVersion, 4)
  assert.equal(manifest.assets.find(asset => asset.text === '月見').selectedVersion, 2)
  assert.equal(manifest.assets.find(asset => asset.text === '金玉').selectedVersion, 3)
})

test('active review notes describe the revised child, skin and euphemistic body-part artwork', () => {
  const visuals = ['levels-1-2.json', 'levels-3-4.json', 'level-5.json'].flatMap(file => read(`content/visuals/${file}`))
  const expectations = [
    ['ja-v-27d5744f36a2', /juvenile proportions/i, /toy/i],
    ['ja-v-d0c8497457bd', /healthy forearm skin/i, /cross-section/i],
    ['ja-v-26d771953f4b', /clothed adult crotch/i, /simplified educational anatomy/i],
  ]
  for (const [id, currentCue, staleCue] of expectations) {
    const visual = visuals.find(record => record.id === id)
    const card = library.find(record => record.id === id)
    assert.equal(visual.reviewRequired, true)
    assert.equal(card.reviewRequired, true)
    assert.equal(card.reviewNote, visual.reviewNote)
    assert.match(card.reviewNote, currentCue)
    assert.doesNotMatch(card.reviewNote, staleCue)
  }
})

test('scene release retains the frozen 43-card review, approved related Night and every selected version', () => {
  const release = read('artifacts/scene-art-233/release-manifest.json')
  const manifest = read('artifacts/scene-art-233/manifest.json')
  const plan = read('artifacts/scene-art-233/plan.json')
  const releasePlan = read('artifacts/scene-art-233/release-plan.json')
  const approvals = read('artifacts/scene-art-233/approvals.json')
  const planned = read('content/card-regeneration/prompts.json').cards
  assert.equal(manifest.assets.length, 43)
  assert.equal(manifest.generatedVersionCount, 101)
  assert.deepEqual(manifest.assets.map(asset => asset.id).sort(), plan.items.map(item => item.review.id).sort())
  assert.ok(plan.items.every(item => item.review.category === 'staged-picture'))
  assert.equal(release.assets.length, 44)
  assert.equal(approvals.assets.length, 44)
  assert.equal(new Set(release.assets.map(asset => asset.path)).size, 43)
  assert.equal(release.releaseApproval.ownerStatement, "Great, let's ship these. Auto-merge.")
  assert.deepEqual(release.assets.map(({ id, path, sha256, selectedVersion }) => ({ id, path, sha256, selectedVersion })).sort((a, b) => a.id.localeCompare(b.id)), releasePlan.selections)
  for (const asset of release.assets) {
    const record = activation.assets.find(record => record.id === asset.id)
    assert.equal(record.manifestPath, 'artifacts/scene-art-233/release-manifest.json')
    assert.equal(record.sourcePath, asset.path)
    assert.equal(asset.status, 'approved')
    assert.equal(asset.transparentBackground, true)
    assert.equal(asset.approval.sha256, asset.sha256)
    assert.equal(asset.approval.selectedVersion, asset.selectedVersion)
    assert.equal(asset.approval.scope, 'artwork only')
    assert.ok(asset.approval.ownerStatement)
    assert.equal(asset.versions.filter(version => version.version === asset.selectedVersion && version.path === asset.path && version.sha256 === asset.sha256).length, 1)
    const approval = approvals.assets.find(record => record.id === asset.id)
    assert.equal(approval.path, asset.path)
    assert.equal(approval.sha256, asset.sha256)
    assert.equal(approval.selectedVersion, asset.selectedVersion)
    assert.deepEqual(release.releaseApproval.selections.find(record => record.id === asset.id), { id: asset.id, path: asset.path, sha256: asset.sha256, selectedVersion: asset.selectedVersion })
    assert.equal(planned.find(card => card.id === asset.id).artworkStatus, 'approved')
    for (const version of asset.versions) assert.equal(hash(source(version.path)), version.sha256, 'All earlier artwork versions remain intact')
  }
  const inside = release.assets.find(asset => asset.text === '中')
  assert.equal(inside.sourceKind, 'existing-approved')
  assert.equal(inside.ownerSourceKindOverride.sha256, inside.sha256)
  assert.equal(inside.sourceProvenance.sourceId, 'es-419-basic-inside')
  const shared = release.assets.find(asset => asset.text === '休む')
  const rest = release.assets.find(asset => asset.text === '休み')
  assert.equal(shared.sourceKind, 'shared-new')
  assert.equal(shared.sharedFromId, rest.id)
  assert.equal(shared.path, rest.path)
  assert.equal(shared.sha256, rest.sha256)
  const night = release.assets.find(asset => asset.id === 'ja-v-ba0c8a160c33')
  assert.equal(manifest.relatedFamilyCandidates.length, 1)
  assert.equal(manifest.relatedFamilyCandidates[0].sha256, night.sha256)
  assert.equal(night.path, 'artifacts/scene-art-233/ja-v-ba0c8a160c33-family-v1.png')
  assert.equal(activation.assets.filter(asset => asset.id === night.id).length, 1)
  const oldNight = read('artifacts/card-regeneration/batch-09/manifest.json').assets.find(asset => asset.id === night.id)
  assert.equal(hash(source(oldNight.path)), oldNight.sha256)
})
