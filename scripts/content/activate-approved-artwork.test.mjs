import test from 'node:test'
import { deflateSync } from 'node:zlib'
import { inspectPngAlpha } from './png-alpha.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
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

test('mixed approved review activates only approved assets and preserves explicitly deferred and removed mappings', t => {
  const f = fixture(t)
  const removed = { ...f.item, id: 'ja-removed', image: { ...f.item.image, src: 'images/removed.svg' } }
  f.put('content/catalog/ja.json', { items: [f.item, { ...f.item, id: 'ja-untouched' }, removed] })
  f.put('content/catalog/review-overrides.json', { [removed.id]: { removalReason: 'Owner removed this entry.' } })
  const activationBefore = f.read('content/card-regeneration/activation.json')
  const visualsBefore = f.read('content/visuals/levels-1-2.json')
  f.manifest.assets.push({ id: 'ja-untouched', status: 'replace-later' }, { id: removed.id, status: 'removed' })
  f.put('artifacts/card-regeneration/batch-05/manifest.json', f.manifest)
  let encodes = 0
  assert.deepEqual(activateArtwork({ root: f.root, batches: ['batch-05'], encode: (source, target) => {
    encodes++
    assert.match(source, /old\.png$/)
    f.encode(source, target)
  } }), ['ja-test'])
  assert.equal(encodes, 1)
  assert.deepEqual(f.read('content/catalog/ja.json').items.slice(1), [{ ...f.item, id: 'ja-untouched' }, removed])
  assert.deepEqual(f.read('content/catalog/review-overrides.json'), { [removed.id]: { removalReason: 'Owner removed this entry.' } })
  assert.deepEqual(f.read('content/visuals/levels-1-2.json').map(record => ({ ...record, concept: f.visual.concept })), visualsBefore)
  const records = f.read('content/card-regeneration/activation.json').assets
  assert.deepEqual(records.slice(0, -1), activationBefore.assets)
  assert.equal(records.at(-1).id, 'ja-test')
  assert.equal(records.length, 2)
})

for (const failure of ['awaiting-user-feedback', 'unrecognized status', 'missing status', 'duplicate deferred ID', 'unknown removed ID', 'unapproved manifest']) test(`mixed review rejects ${failure} before encoding or mapping changes`, t => {
  const f = fixture(t)
  const candidate = { id: 'ja-untouched', status: 'replace-later' }
  if (failure === 'awaiting-user-feedback') candidate.status = 'awaiting-user-feedback'
  if (failure === 'unrecognized status') candidate.status = 'deferred'
  if (failure === 'missing status') delete candidate.status
  if (failure === 'duplicate deferred ID') candidate.id = 'ja-test'
  if (failure === 'unknown removed ID') Object.assign(candidate, { id: 'ja-missing', status: 'removed' })
  if (failure === 'unapproved manifest') f.manifest.status = 'awaiting-user-feedback'
  f.manifest.assets.push(candidate)
  f.put('artifacts/card-regeneration/batch-05/manifest.json', f.manifest)
  const before = f.read('content/card-regeneration/activation.json')
  assert.throws(() => activateArtwork({ root: f.root, batches: ['batch-05'], encode: () => assert.fail('Preflight must finish first') }))
  assert.deepEqual(f.read('content/catalog/ja.json').items[0], f.item)
  assert.deepEqual(f.read('content/card-regeneration/activation.json'), before)
  assert.equal(existsSync(join(f.root, 'public/images/approved')), false)
})
