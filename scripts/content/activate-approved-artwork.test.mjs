import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
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
