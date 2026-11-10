import test from 'node:test'
import { deflateSync } from 'node:zlib'
import { inspectPngAlpha } from './png-alpha.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync, symlinkSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { activateArtwork } from './activate-approved-artwork.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'kikimashta-activate-artwork-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), JSON.stringify(value)) }
  const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'))
  const item = { id: 'ja-test', text: '古い', reading: 'ふるい', meaning: 'Old', audio: [{ src: 'audio/keep.mp3', voice: 'keep' }], image: { src: 'images/old.svg', source: 'generated', alt: 'Old chest' } }
  put('content/catalog/ja.json', { items: [item, { ...item, id: 'ja-untouched' }] })
  put('content/ja.json', { items: [] })
  put('content/practice-pool.json', { itemIds: ['ja-test'] })
  put('content/card-regeneration/activation.json', { assets: [{ id: 'ja-existing', path: 'public/images/keep.jpg', sha256: 'keep' }] })
  const visual = { id: 'ja-test', concept: 'Old chest', visualGroup: 'old', reviewRequired: true, reviewNote: 'Keep restriction' }
  for (const file of ['levels-1-2.json', 'levels-3-4.json', 'level-5.json']) put(`content/visuals/${file}`, file === 'levels-1-2.json' ? [visual] : [])
  const path = 'artifacts/card-regeneration/batch-05/old.png'
  mkdirSync(dirname(join(root, path)), { recursive: true })
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex')
  writeFileSync(join(root, path), png)
  const manifest = { status: 'approved', assets: [{ id: 'ja-test', status: 'approved', path, sha256: hash(png), visualReview: 'Broken rusty bicycle' }] }
  put('artifacts/card-regeneration/batch-05/manifest.json', manifest)
  const encode = (_, target) => writeFileSync(target, Buffer.from('ffd8ffe00000ffd9', 'hex'))
  return { root, put, read, item, visual, manifest, encode }
}

test('activation changes artwork in catalogue while preserving identity, voices, flags and eligibility', t => {
  const f = fixture(t)
  activateArtwork({ root: f.root, batches: ['batch-05'], encode: f.encode })
  const [updated, untouched] = f.read('content/catalog/ja.json').items
  assert.deepEqual({ ...updated, image: f.item.image }, f.item)
  assert.deepEqual(untouched, { ...f.item, id: 'ja-untouched' })
  assert.match(updated.image.src, /^images\/approved\/ja-test-[a-f0-9]{12}\.jpg$/)
  assert.equal(updated.image.alt, 'Broken rusty bicycle')
  assert.deepEqual(f.read('content/visuals/levels-1-2.json')[0], { ...f.visual, concept: 'Broken rusty bicycle' })
  assert.deepEqual(f.read('content/practice-pool.json'), { itemIds: ['ja-test'] })
  assert.deepEqual(f.read('content/card-regeneration/activation.json').assets[0], { id: 'ja-existing', path: 'public/images/keep.jpg', sha256: 'keep' })
  const before = f.read('content/card-regeneration/activation.json')
  activateArtwork({ root: f.root, batches: ['batch-05'], encode: () => { throw new Error('Should reuse existing delivery') } })
  assert.deepEqual(f.read('content/card-regeneration/activation.json'), before)
})

for (const failure of ['unapproved', 'hash mismatch', 'unknown id']) test(`preflight rejects ${failure} without changing mappings`, t => {
  const f = fixture(t)
  if (failure === 'unapproved') f.manifest.assets[0].status = 'awaiting-user-feedback'
  if (failure === 'hash mismatch') f.manifest.assets[0].sha256 = 'wrong'
  if (failure === 'unknown id') f.manifest.assets[0].id = 'ja-missing'
  f.put('artifacts/card-regeneration/batch-05/manifest.json', f.manifest)
  assert.throws(() => activateArtwork({ root: f.root, batches: ['batch-05'], encode: () => assert.fail('Must validate before encoding') }))
  assert.deepEqual(f.read('content/catalog/ja.json').items[0], f.item)
  assert.equal(existsSync(join(f.root, 'public/images/approved')), false)
})

for (const previouslyActivated of [false, true]) test(`regenerates an untrusted delivery (${previouslyActivated ? 'corrupted recorded file' : 'unrecorded file'})`, t => {
  const f = fixture(t)
  const options = { root: f.root, batches: ['batch-05'] }
  if (previouslyActivated) activateArtwork({ ...options, encode: f.encode })
  const target = join(f.root, `public/images/approved/ja-test-${f.manifest.assets[0].sha256.slice(0, 12)}.jpg`)
  mkdirSync(dirname(target), { recursive: true })
  const stale = Buffer.from('ffd800000000', 'hex')
  writeFileSync(target, stale)
  let encodes = 0
  activateArtwork({ ...options, encode: (source, staged) => {
    encodes++
    assert.notEqual(staged, target)
    assert.deepEqual(readFileSync(target), stale, 'leave the old file intact until encoding completes')
    f.encode(source, staged)
  } })
  assert.equal(encodes, 1)
  const delivery = readFileSync(target)
  assert.notDeepEqual(delivery, stale)
  const record = f.read('content/card-regeneration/activation.json').assets.find(asset => asset.id === 'ja-test')
  assert.equal(record.sha256, hash(delivery))
  assert.equal(record.bytes, delivery.length)
  assert.deepEqual(readdirSync(dirname(target)), [target.split('/').at(-1)])
})

for (const failure of ['encoder error', 'invalid output']) test(`failed regeneration preserves mappings and delivery after ${failure}`, t => {
  const f = fixture(t)
  const target = join(f.root, `public/images/approved/ja-test-${f.manifest.assets[0].sha256.slice(0, 12)}.jpg`)
  mkdirSync(dirname(target), { recursive: true })
  const stale = Buffer.from('ffd800000000', 'hex')
  writeFileSync(target, stale)
  const before = f.read('content/card-regeneration/activation.json')
  assert.throws(() => activateArtwork({ root: f.root, batches: ['batch-05'], encode: (_, staged) => {
    writeFileSync(staged, 'partial')
    if (failure === 'encoder error') throw new Error('Interrupted encoder')
  } }), failure === 'encoder error' ? /Interrupted encoder/ : /Delivery must be JPEG/)
  assert.deepEqual(readFileSync(target), stale)
  assert.deepEqual(f.read('content/catalog/ja.json').items[0], f.item)
  assert.deepEqual(f.read('content/card-regeneration/activation.json'), before)
  assert.deepEqual(readdirSync(dirname(target)), [target.split('/').at(-1)])
})

// Real two-by-two RGBA PNG fixtures include transparent, white and colored pixels.
// CRCs and compressed pixels allow both the exporter and native image decoders to read them.
function rgbaPng(pixels, width = 2, height = 2) {
  const chunk = (name, data) => {
    const type = Buffer.from(name), size = Buffer.alloc(4), checksum = Buffer.alloc(4)
    size.writeUInt32BE(data.length)
    let crc = 0xffffffff
    for (const byte of Buffer.concat([type, data])) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([size, type, data, checksum])
  }
  const header = Buffer.from('00000002000000020806000000', 'hex')
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4)
  const raw = Buffer.concat(Array.from({ length: height }, (_, row) => Buffer.from([0, ...pixels.slice(row * width * 4, (row + 1) * width * 4)])))
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const transparentPixels = [0, 0, 0, 0, 255, 255, 255, 255, 63, 36, 104, 255, 63, 36, 104, 128]
function transparentFixture(t, pixels = transparentPixels) {
  const f = fixture(t), asset = f.manifest.assets[0]
  const source = rgbaPng(pixels)
  writeFileSync(join(f.root, asset.path), source)
  Object.assign(asset, { sha256: hash(source), transparentBackground: true })
  f.put('artifacts/card-regeneration/batch-05/manifest.json', f.manifest)
  return { ...f, source }
}

test('transparent source uses PNG delivery and retains clear and opaque white pixels on reuse', t => {
  const f = transparentFixture(t)
  activateArtwork({ root: f.root, batches: ['batch-05'], encode: (source, target, options) => {
    assert.equal(options.format, 'png')
    assert.match(target, /\.png$/)
    writeFileSync(target, readFileSync(source))
  } })
  const record = f.read('content/card-regeneration/activation.json').assets.at(-1)
  assert.match(record.path, /\.png$/)
  assert.equal(record.format, 'png')
  assert.equal(record.alpha, 'preserved')
  assert.deepEqual(inspectPngAlpha(readFileSync(join(f.root, record.path))), { width: 2, height: 2, transparentPixels: 1, opaquePixels: 2, opaqueWhitePixels: 1 })
  const before = f.read('content/card-regeneration/activation.json')
  activateArtwork({ root: f.root, batches: ['batch-05'], encode: () => assert.fail('Verified PNG delivery should be reused') })
  assert.deepEqual(f.read('content/card-regeneration/activation.json'), before)
})

for (const failure of ['flattened RGBA', 'JPEG bytes', 'white detail removed', 'missing IEND', 'bad CRC', 'trailing bytes']) test(`transparent regeneration rejects ${failure} atomically`, t => {
  const f = transparentFixture(t)
  const before = f.read('content/card-regeneration/activation.json')
  const target = join(f.root, `public/images/approved/ja-test-${f.manifest.assets[0].sha256.slice(0, 12)}.png`)
  mkdirSync(dirname(target), { recursive: true })
  const old = Buffer.from('old untrusted delivery')
  writeFileSync(target, old)
  assert.throws(() => activateArtwork({ root: f.root, batches: ['batch-05'], encode: (_, staged) => {
    const pixels = [...transparentPixels]
    if (failure === 'flattened RGBA') for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255
    if (failure === 'white detail removed') pixels.splice(4, 3, 63, 36, 104)
    let output = failure === 'JPEG bytes' ? Buffer.from('ffd8ffe00000ffd9', 'hex') : rgbaPng(pixels)
    if (failure === 'missing IEND') output = output.subarray(0, output.length - 12)
    if (failure === 'bad CRC') output[29] ^= 1
    if (failure === 'trailing bytes') output = Buffer.concat([output, Buffer.from('unexpected')])
    writeFileSync(staged, output)
  } }), failure === 'white detail removed' ? /lost opaque white/ : failure === 'JPEG bytes' ? /must be PNG/ : failure === 'missing IEND' ? /Missing PNG IEND/ : failure === 'bad CRC' ? /CRC/ : failure === 'trailing bytes' ? /Invalid PNG end/ : /preserve PNG transparency/)
  assert.deepEqual(readFileSync(target), old)
  assert.deepEqual(f.read('content/catalog/ja.json').items[0], f.item)
  assert.deepEqual(f.read('content/card-regeneration/activation.json'), before)
  assert.deepEqual(readdirSync(dirname(target)), [target.split('/').at(-1)])
})

test('source tagged transparent must contain transparent pixels before mappings or encoding change', t => {
  const pixels = [...transparentPixels]
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255
  const f = transparentFixture(t, pixels)
  assert.throws(() => activateArtwork({ root: f.root, batches: ['batch-05'], encode: () => assert.fail('Opaque source must fail preflight') }), /Source must have transparent/)
  assert.deepEqual(f.read('content/catalog/ja.json').items[0], f.item)
  assert.equal(existsSync(join(f.root, 'public/images/approved')), false)
})


test('resizing may remove a sub-resolution white highlight while retaining transparent and opaque pixels', t => {
  const f = transparentFixture(t)
  const pixels = Array.from({ length: 64 * 64 }, () => [63, 36, 104, 255]).flat()
  pixels.splice(0, 4, 0, 0, 0, 0)
  pixels.splice(4, 4, 255, 255, 255, 255)
  const source = rgbaPng(pixels, 64, 64)
  const asset = f.manifest.assets[0]
  writeFileSync(join(f.root, asset.path), source)
  asset.sha256 = hash(source)
  f.put('artifacts/card-regeneration/batch-05/manifest.json', f.manifest)
  const resized = rgbaPng([0, 0, 0, 0, 63, 36, 104, 255, 63, 36, 104, 255, 63, 36, 104, 128])
  activateArtwork({ root: f.root, batches: ['batch-05'], encode: (_, target) => writeFileSync(target, resized) })
  const record = f.read('content/card-regeneration/activation.json').assets.at(-1)
  assert.equal(inspectPngAlpha(source).opaqueWhitePixels, 1)
  assert.equal(inspectPngAlpha(readFileSync(join(f.root, record.path))).opaqueWhitePixels, 0)
  assert.equal(record.alpha, 'preserved')
  assert.match(f.read('content/catalog/ja.json').items[0].image.src, /\.png$/)
})

test('an approved replacement updates the existing card once and retains prior delivery history', t => {
  const f = fixture(t)
  activateArtwork({ root: f.root, batches: ['batch-05'], encode: f.encode })
  const old = f.read('content/card-regeneration/activation.json').assets.find(asset => asset.id === 'ja-test')
  const previousBytes = readFileSync(join(f.root, old.path))
  const asset = f.manifest.assets[0]
  const replacement = Buffer.from('89504e470d0a1a0a0000000001', 'hex')
  asset.previousVersions = [{ path: asset.path, sha256: asset.sha256 }]
  asset.path = 'artifacts/card-regeneration/batch-05/replacement.png'
  asset.sha256 = hash(replacement)
  asset.imageDescription = 'Replacement illustration'
  writeFileSync(join(f.root, asset.path), replacement)
  f.put('artifacts/card-regeneration/batch-05/manifest.json', f.manifest)
  activateArtwork({ root: f.root, batches: ['batch-05'], encode: (_, target) => writeFileSync(target, Buffer.from('ffd8ffe00100ffd9', 'hex')) })
  const records = f.read('content/card-regeneration/activation.json').assets
  assert.equal(records.length, 2)
  assert.equal(records.filter(record => record.id === 'ja-test').length, 1)
  const current = records.find(record => record.id === 'ja-test')
  assert.equal(current.sourcePath, asset.path)
  assert.equal(current.sourceSha256, asset.sha256)
  assert.notEqual(current.path, old.path)
  assert.deepEqual(readFileSync(join(f.root, old.path)), previousBytes)
  assert.equal(f.read('content/catalog/ja.json').items[0].image.src, current.path.slice('public/'.length))
  assert.equal(f.read('content/catalog/ja.json').items[0].image.alt, 'Replacement illustration')
  assert.deepEqual(f.read('content/catalog/ja.json').items[0].audio, f.item.audio)
  assert.deepEqual(f.read('content/practice-pool.json'), { itemIds: ['ja-test'] })
})


test('activation encodes a verified canonical source while retaining the original approved source path', t => {
  const f = fixture(t), asset = f.manifest.assets[0]
  const canonical = 'artifacts/card-regeneration/batch-03/shared.png'
  const bytes = readFileSync(join(f.root, asset.path))
  mkdirSync(dirname(join(f.root, canonical)), { recursive: true })
  writeFileSync(join(f.root, canonical), bytes)
  rmSync(join(f.root, asset.path))
  f.put('artifacts/artwork-aliases.json', { version: 1, aliases: {
    [asset.path]: { path: canonical, sha256: asset.sha256, bytes: bytes.length },
  } })
  let encodes = 0
  activateArtwork({ root: f.root, batches: ['batch-05'], encode: (source, target) => {
    assert.equal(source, join(f.root, canonical))
    encodes++
    f.encode(source, target)
  } })
  assert.equal(encodes, 1)
  const record = f.read('content/card-regeneration/activation.json').assets.find(item => item.id === asset.id)
  assert.equal(record.sourcePath, asset.path)
  assert.equal(record.sourceSha256, asset.sha256)
})

function visualReferenceFixture(t) {
  const f = transparentFixture(t)
  const assets = Array.from({ length: 22 }, (_, i) => {
    const id = i === 0 ? 'ja-test' : `ja-v-${i.toString(16)}`
    const path = `artifacts/visual-reference-art-213/ja-v-${i.toString(16)}-v1.png`
    mkdirSync(dirname(join(f.root, path)), { recursive: true })
    writeFileSync(join(f.root, path), f.source)
    return { id, path, status: 'approved', sha256: hash(f.source), selectedVersion: 1,
      imageDescription: 'Two hands with inward-facing thumbs', transparentBackground: true,
      versions: [{ version: 1, path, sha256: hash(f.source) }],
      approval: { sha256: hash(f.source), selectedVersion: 1, scope: 'artwork only', ownerStatement: 'Ship this set.', date: '2026-11-09' } }
  })
  f.put('content/catalog/ja.json', { items: assets.map(a => ({ ...f.item, id: a.id })) })
  f.put('content/visuals/levels-1-2.json', assets.map(a => ({ ...f.visual, id: a.id })))
  const manifest = { status: 'approved', expectedAssetCount: 22, assets,
    releaseApproval: { ownerStatement: "Let's ship this artwork set.", date: '2026-11-09',
      scope: 'Activate the complete selected artwork set; preserve vocabulary eligibility and progress.',
      selections: assets.map(({ id, path, sha256, selectedVersion }) => ({ id, path, sha256, selectedVersion })) } }
  const save = () => f.put('artifacts/visual-reference-art-213/manifest.json', manifest)
  save()
  return { ...f, manifest, save }
}

test('the complete approved visual-reference set activates through the shared pipeline without changing eligibility', t => {
  const f = visualReferenceFixture(t)
  const options = { root: f.root, batches: ['visual-reference-213'] }
  const ids = activateArtwork({ ...options, encode: (source, target) => writeFileSync(target, readFileSync(source)) })
  assert.equal(ids.length, 22)
  const active = f.read('content/card-regeneration/activation.json')
  assert.equal(active.assets.length, 23)
  for (const item of f.read('content/catalog/ja.json').items) {
    assert.deepEqual({ ...item, id: f.item.id, image: f.item.image }, f.item)
    assert.match(item.image.src, /\.png$/)
    assert.equal(item.image.alt, 'Two hands with inward-facing thumbs')
    const delivery = active.assets.find(a => a.id === item.id)
    assert.equal(delivery.manifestPath, 'artifacts/visual-reference-art-213/manifest.json')
    assert.equal(delivery.alpha, 'preserved')
  }
  assert.deepEqual(f.read('content/practice-pool.json'), { itemIds: ['ja-test'] })
  activateArtwork({ ...options, encode: () => assert.fail('Verified deliveries should be reused') })
  assert.deepEqual(f.read('content/card-regeneration/activation.json'), active)
})

// Shared guards are tested here, rather than repeated for each production release.
for (const failure of ['pending selection', 'missing approval', 'stale hash', 'wrong version record', 'incomplete set', 'symlink source']) {
  test(`visual-reference preflight rejects ${failure} before encoding any image`, t => {
    const f = visualReferenceFixture(t)
    const a = f.manifest.assets.at(-1)
    if (failure === 'pending selection') a.status = 'generated-pending-owner-review'
    if (failure === 'missing approval') delete a.approval
    if (failure === 'stale hash') a.approval.sha256 = '0'.repeat(64)
    if (failure === 'wrong version record') a.versions[0].path = a.versions[0].path.replace('-v1', '-v2')
    if (failure === 'incomplete set') f.manifest.assets.pop()
    if (failure === 'symlink source') {
      rmSync(join(f.root, a.path))
      symlinkSync(join(f.root, f.manifest.assets[0].path), join(f.root, a.path))
    }
    f.save()
    const before = f.read('content/catalog/ja.json')
    assert.throws(() => activateArtwork({ root: f.root, batches: ['visual-reference-213'], encode: () => assert.fail('Must reject before encoding') }))
    assert.deepEqual(f.read('content/catalog/ja.json'), before)
    assert.equal(existsSync(join(f.root, 'public/images/approved')), false)
  })
}

for (const failure of ['missing release', 'artwork-only statement', 'missing scope', 'missing date', 'missing selection', 'duplicate selection', 'changed id', 'changed path', 'changed hash', 'changed version']) {
  test(`visual-reference activation rejects ${failure} in release authorization before writing`, t => {
    const f = visualReferenceFixture(t)
    const release = f.manifest.releaseApproval
    const selection = release.selections.at(-1)
    if (failure === 'missing release') delete f.manifest.releaseApproval
    if (failure === 'artwork-only statement') release.ownerStatement = 'These pictures look good.'
    if (failure === 'missing scope') delete release.scope
    if (failure === 'missing date') delete release.date
    if (failure === 'missing selection') release.selections.pop()
    if (failure === 'duplicate selection') release.selections[21] = release.selections[0]
    if (failure === 'changed id') selection.id = 'ja-unknown'
    if (failure === 'changed path') selection.path = selection.path.replace('-v1', '-v2')
    if (failure === 'changed hash') selection.sha256 = '0'.repeat(64)
    if (failure === 'changed version') selection.selectedVersion = 2
    f.save()
    const before = f.read('content/catalog/ja.json')
    assert.throws(() => activateArtwork({ root: f.root, batches: ['visual-reference-213'], encode: () => assert.fail('Must reject before encoding') }), /complete-set release approval/)
    assert.deepEqual(f.read('content/catalog/ja.json'), before)
    assert.equal(existsSync(join(f.root, 'public/images/approved')), false)
  })
}

function pictureFixture(t) {
  const f = transparentFixture(t)
  const directory = 'artifacts/picture-art-229'
  const plan = JSON.parse(readFileSync(new URL('../../artifacts/picture-art-229/plan.json', import.meta.url), 'utf8'))
  const manifest = JSON.parse(readFileSync(new URL('../../artifacts/picture-art-229/manifest.json', import.meta.url), 'utf8'))
  const assets = manifest.assets

  f.put('content/catalog/ja.json', { items: assets.map(asset => ({ ...f.item, id: asset.id })) })
  f.put('content/visuals/levels-1-2.json', assets.map(asset => ({ ...f.visual, id: asset.id })))
  const sourcePath = join(f.root, directory, 'sources/suitability-review.json')
  mkdirSync(dirname(sourcePath), { recursive: true })
  copyFileSync(new URL('../../artifacts/picture-art-229/sources/suitability-review.json', import.meta.url), sourcePath)
  f.put(`${directory}/plan.json`, plan)
  const save = () => f.put(`${directory}/manifest.json`, manifest)
  save()
  return { ...f, manifest, plan, save }
}

for (const failure of ['valid selected/excluded swap', 'changed source review', 'coordinated source replacement', 'coordinated revision replacement']) {
  test(`picture-set frozen scope rejects ${failure} before any deliveries`, t => {
    const f = pictureFixture(t)
    if (failure === 'valid selected/excluded swap') {
      const oldId = f.plan.items[29].id
      const replacementId = f.plan.excludedUpdatedIds[0]
      const source = f.read('artifacts/picture-art-229/sources/suitability-review.json')
      f.plan.items[29] = source.items.find(item => item.id === replacementId)
      f.plan.excludedUpdatedIds[0] = oldId
      f.manifest.assets[29].id = replacementId
      f.manifest.releaseApproval.selections[29].id = replacementId
      const catalog = f.read('content/catalog/ja.json')
      catalog.items[29].id = replacementId
      f.put('content/catalog/ja.json', catalog)
      const visuals = f.read('content/visuals/levels-1-2.json')
      visuals[29].id = replacementId
      f.put('content/visuals/levels-1-2.json', visuals)
    }
    if (failure === 'changed source review') f.put('artifacts/picture-art-229/sources/suitability-review.json', { items: [] })
    if (failure === 'coordinated source replacement') {
      const source = f.read('artifacts/picture-art-229/sources/suitability-review.json')
      const item = source.items.find(item => item.id === f.plan.items[0].id)
      item.recommendation = 'Replacement historical guidance.'
      f.plan.items[0] = item
      f.put('artifacts/picture-art-229/sources/suitability-review.json', source)
      f.plan.suitabilityReviewSha256 = hash(readFileSync(join(f.root, 'artifacts/picture-art-229/sources/suitability-review.json')))
      f.plan.sourceRevision = 'b'.repeat(40)
      f.manifest.sourceRevision = f.plan.sourceRevision
    }
    if (failure === 'coordinated revision replacement') {
      f.plan.sourceRevision = 'b'.repeat(40)
      f.manifest.sourceRevision = f.plan.sourceRevision
    }
    f.put('artifacts/picture-art-229/plan.json', f.plan)
    f.save()
    const paths = ['content/catalog/ja.json', 'content/ja.json', 'content/card-regeneration/activation.json', 'content/visuals/levels-1-2.json', 'content/practice-pool.json']
    const before = paths.map(path => f.read(path))
    assert.throws(() => activateArtwork({ root: f.root, batches: ['picture-229'], encode: () => assert.fail('Must reject before encoding') }), /frozen 31-card selection/)
    paths.forEach((path, index) => assert.deepEqual(f.read(path), before[index]))
    assert.equal(existsSync(join(f.root, 'public/images/approved')), false)
  })
}



test('coordinated replacement of child media and every approval binding cannot publish the circle image as a child', t => {
  const f = pictureFixture(t)
  const child = f.manifest.assets.find(asset => asset.text === '子')
  const circle = f.manifest.assets.find(asset => asset.text === '丸')
  Object.assign(child, { path: circle.path, sha256: circle.sha256, selectedVersion: circle.selectedVersion })
  child.versions = [{ version: child.selectedVersion, path: child.path, sha256: child.sha256 }]
  Object.assign(child.approval, { sha256: child.sha256, selectedVersion: child.selectedVersion })
  const selection = f.manifest.releaseApproval.selections.find(selection => selection.id === child.id)
  Object.assign(selection, { path: child.path, sha256: child.sha256, selectedVersion: child.selectedVersion })
  f.save()
  const paths = ['content/catalog/ja.json', 'content/ja.json', 'content/card-regeneration/activation.json', 'content/visuals/levels-1-2.json', 'content/practice-pool.json']
  const before = paths.map(path => f.read(path))
  assert.throws(() => activateArtwork({ root: f.root, batches: ['picture-229'], encode: () => assert.fail('Must reject before encoding') }), /owner-approved picture media/)
  paths.forEach((path, index) => assert.deepEqual(f.read(path), before[index]))
  assert.equal(existsSync(join(f.root, 'public/images/approved')), false)
})


function sceneFixture(t) {
  const f = transparentFixture(t)
  const directory = 'artifacts/scene-art-233'
  const repoRead = path => JSON.parse(readFileSync(new URL(`../../${directory}/${path}`, import.meta.url), 'utf8'))
  const manifest = repoRead('release-manifest.json')
  const primary = repoRead('manifest.json')
  const plan = repoRead('plan.json')

  const originalPath = `${directory}/sources/suitability-review.json`
  mkdirSync(dirname(join(f.root, originalPath)), { recursive: true })
  copyFileSync(new URL(`../../${originalPath}`, import.meta.url), join(f.root, originalPath))
  f.put('content/catalog/ja.json', { items: manifest.assets.map(asset => ({ ...f.item, id: asset.id })) })
  f.put('content/visuals/levels-1-2.json', manifest.assets.map(asset => ({ ...f.visual, id: asset.id })))
  f.put('content/practice-pool.json', { itemIds: [manifest.assets[0].id] })
  const oldNight = { id: 'ja-v-ba0c8a160c33', path: 'public/images/keep-night.png', sourcePath: 'old-night.png', sha256: hash(f.source), bytes: f.source.length }
  mkdirSync(dirname(join(f.root, oldNight.path)), { recursive: true })
  writeFileSync(join(f.root, oldNight.path), f.source)
  const activation = f.read('content/card-regeneration/activation.json')
  activation.assets.push(oldNight)
  f.put('content/card-regeneration/activation.json', activation)
  const save = () => {
    f.put(`${directory}/release-manifest.json`, manifest)
    f.put(`${directory}/manifest.json`, primary)
    f.put(`${directory}/plan.json`, plan)
  }
  save()
  return { ...f, manifest, primary, plan, oldNight, save }
}



for (const failure of ['changed source bytes', 'swapped selected and excluded IDs', 'primary media differs', 'unapproved primary', 'missing related Night', 'extra related image', 'changed related Night']) {
  test(`scene release rejects ${failure} before encoding or bank writes`, t => {
    const f = sceneFixture(t)
    if (failure === 'changed source bytes') f.put('artifacts/scene-art-233/sources/suitability-review.json', { items: [] })
    if (failure === 'swapped selected and excluded IDs') {
      const old = f.plan.items[0].review
      const replacement = f.plan.excludedUpdated[0].review
      f.plan.items[0].review = replacement
      f.plan.excludedUpdated[0].review = old
      f.plan.excludedUpdatedIds[0] = old.id
      f.primary.assets[0].id = replacement.id
    }
    if (failure === 'primary media differs') f.primary.assets[0].sha256 = '0'.repeat(64)
    if (failure === 'unapproved primary') f.primary.assets[0].status = 'generated-pending-owner-review'
    if (failure === 'missing related Night') f.primary.relatedFamilyCandidates = []
    if (failure === 'extra related image') f.primary.relatedFamilyCandidates.push({ ...f.primary.relatedFamilyCandidates[0], id: 'ja-v-abcdef' })
    if (failure === 'changed related Night') f.primary.relatedFamilyCandidates[0].sha256 = '0'.repeat(64)
    f.save()
    const paths = ['content/catalog/ja.json', 'content/ja.json', 'content/card-regeneration/activation.json', 'content/visuals/levels-1-2.json', 'content/practice-pool.json']
    const before = paths.map(path => f.read(path))
    assert.throws(() => activateArtwork({ root: f.root, batches: ['scene-233'], encode: () => assert.fail('Must reject before encoding') }))
    paths.forEach((path, index) => assert.deepEqual(f.read(path), before[index]))
    assert.deepEqual(readdirSync(join(f.root, 'public/images')), ['keep-night.png'])
  })
}

test('coordinated scene media replacement cannot drift accepted bytes even if primary, release and approvals agree', t => {
  const f = sceneFixture(t)
  const asset = f.manifest.assets.find(asset => asset.id === 'ja-v-01a3c397cb20')
  const other = f.manifest.assets.find(asset => asset.id === 'ja-v-0c337ec8cbd4')
  Object.assign(asset, { path: other.path, sha256: other.sha256, selectedVersion: other.selectedVersion })
  asset.versions = [{ version: asset.selectedVersion, path: asset.path, sha256: asset.sha256 }]
  Object.assign(asset.approval, { sha256: asset.sha256, selectedVersion: asset.selectedVersion })
  Object.assign(f.primary.assets.find(record => record.id === asset.id), { path: asset.path, sha256: asset.sha256, selectedVersion: asset.selectedVersion })
  Object.assign(f.manifest.releaseApproval.selections.find(record => record.id === asset.id), { path: asset.path, sha256: asset.sha256, selectedVersion: asset.selectedVersion })
  f.save()
  const before = f.read('content/catalog/ja.json')
  assert.throws(() => activateArtwork({ root: f.root, batches: ['scene-233'], encode: () => assert.fail('Must reject before encoding') }), /owner-approved scene media/)
  assert.deepEqual(f.read('content/catalog/ja.json'), before)
  assert.deepEqual(readdirSync(join(f.root, 'public/images')), ['keep-night.png'])
})
