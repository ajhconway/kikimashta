import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { reviewedImage } from './reviewed-image.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'artwork-source-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const bytes = Buffer.from('accepted artwork source')
  const put = (path, data = bytes) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), data) }
  const args = { root, reviewPath: 'artifacts/spanish-travel-art/batch-01/bus-v1.png',
    productionPath: 'public/images/approved/bus.png', sha256: hash(bytes), size: bytes.length }
  const alias = { path: args.productionPath, sha256: args.sha256, bytes: bytes.length }
  const registry = () => put('artifacts/artwork-aliases.json', JSON.stringify({ version: 1, aliases: { [args.reviewPath]: alias } }))
  registry(); put(args.productionPath)
  return { root, bytes, args, put, alias, registry }
}

test('reads an existing source, or verifies its registered canonical bytes when missing', t => {
  const f = fixture(t)
  assert.deepEqual(reviewedImage(f.args), { bytes: f.bytes, path: f.args.productionPath })
  f.put(f.args.reviewPath)
  assert.deepEqual(reviewedImage(f.args), { bytes: f.bytes, path: f.args.reviewPath })
  f.put(f.args.reviewPath, 'corrupt source')
  assert.throws(() => reviewedImage(f.args), /hash or size mismatch/)
})

test('canonical bytes must match both the recorded hash and size', t => {
  const f = fixture(t)
  f.put(f.args.productionPath, Buffer.alloc(f.bytes.length))
  assert.throws(() => reviewedImage(f.args), /hash or size mismatch/)
  f.put(f.args.productionPath, Buffer.concat([f.bytes, Buffer.from('extra')]))
  assert.throws(() => reviewedImage(f.args), /hash or size mismatch/)
  rmSync(join(f.root, f.args.productionPath))
  assert.throws(() => reviewedImage(f.args), { code: 'ENOENT' })
})

test('aliases must match the requested production path, hash and size and cannot escape artwork roots', t => {
  const f = fixture(t)
  for (const changes of [{ path: '../outside.png' }, { path: 'public/images/approved/other.png' }, { sha256: '0'.repeat(64) }, { bytes: f.bytes.length + 1 }]) {
    const old = { ...f.alias }
    Object.assign(f.alias, changes); f.registry()
    assert.throws(() => reviewedImage(f.args), /Unverified artwork alias/)
    Object.assign(f.alias, old)
  }
  assert.throws(() => reviewedImage({ ...f.args, reviewPath: '../outside.png' }), /Unsafe artwork source/)
  assert.throws(() => reviewedImage({ ...f.args, reviewPath: 'artifacts/spanish-travel-art/missing.png' }), /Unverified artwork alias/)
})

for (const mode of ['file', 'directory', 'original']) test(`rejects ${mode} symlinks instead of following artwork outside its source`, t => {
  const f = fixture(t)
  f.put('outside/bus.png')
  const path = mode === 'original' ? f.args.reviewPath : mode === 'file' ? f.args.productionPath : 'public/images/approved'
  rmSync(join(f.root, path), { recursive: true, force: true })
  mkdirSync(dirname(join(f.root, path)), { recursive: true })
  symlinkSync(join(f.root, mode === 'directory' ? 'outside' : 'outside/bus.png'), join(f.root, path))
  assert.throws(() => reviewedImage(f.args), /symlink/)
})

test('an unreadable original does not fall back to its valid canonical copy', t => {
  const f = fixture(t)
  mkdirSync(join(f.root, f.args.reviewPath), { recursive: true })
  assert.throws(() => reviewedImage(f.args), { code: 'EISDIR' })
})

test('all consolidated artwork retains its exact hash and bytes and gallery links resolve', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const registry = JSON.parse(readFileSync(join(root, 'artifacts/artwork-aliases.json')))
  assert.equal(Object.keys(registry.aliases).length, 115)
  assert.equal(Object.values(registry.aliases).reduce((sum, item) => sum + item.bytes, 0), 91369403)
  for (const [reviewPath, alias] of Object.entries(registry.aliases)) {
    const result = reviewedImage({ root, reviewPath, sha256: alias.sha256, size: alias.bytes })
    assert.equal(result.path, alias.path)
  }
  for (const path of [
    'spanish-travel-art/review.html', 'spanish-travel-art/contact-sheet.html', 'spanish-travel-art/batch-01/review.html',
    'spanish-travel-2-art/review.html', 'spanish-travel-2-art/artwork.html',
    'spanish-travel-3-art/review.html', 'spanish-travel-3-art/artwork.html',
    'card-regeneration/batch-05/review.html', 'card-regeneration/batch-06/review.html',
    'card-regeneration/batch-10/alpha-review.html', 'card-regeneration/batch-10/family-review.html',
  ]) {
    const page = new URL('artifacts/' + path, new URL('../../', import.meta.url))
    const html = readFileSync(page, 'utf8')
    for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:png|jpg))"/g)) assert.ok(readFileSync(new URL(match[1], page)).length)
  }
})

for (const filename of ['ja-v-d0c8497457bd-v4.png']) test(`picture review resolves exact approved source ${filename}`, t => {
  const f = fixture(t)
  const reviewPath = `artifacts/picture-art-229/${filename}`
  f.put(reviewPath)
  assert.deepEqual(reviewedImage({ ...f.args, reviewPath }), { bytes: f.bytes, path: reviewPath })
  f.put(reviewPath, 'changed artwork')
  assert.throws(() => reviewedImage({ ...f.args, reviewPath }), /hash or size mismatch/)
})

for (const reviewPath of [
  'artifacts/picture-art-229/../ja-v-a-v1.png',
  'artifacts/picture-art-229/style-object.png',
]) test(`picture review rejects an unapproved source pattern: ${reviewPath}`, t => {
  const f = fixture(t)
  assert.throws(() => reviewedImage({ ...f.args, reviewPath }), /Unsafe artwork source/)
})

for (const filename of ['ja-v-ba0c8a160c33-family-v1.png', '179-puppy-v2.png']) test(`scene review resolves hash-bound source ${filename}`, t => {
  const f = fixture(t)
  const reviewPath = `artifacts/scene-art-233/${filename}`
  f.put(reviewPath)
  assert.deepEqual(reviewedImage({ ...f.args, reviewPath }), { bytes: f.bytes, path: reviewPath })
  f.put(reviewPath, 'changed artwork')
  assert.throws(() => reviewedImage({ ...f.args, reviewPath }), /hash or size mismatch/)
})

for (const reviewPath of [
  'artifacts/scene-art-234/ja-v-a-v1.png',
  'artifacts/scene-art-233/../ja-v-a-v1.png',
  'artifacts/scene-art-233/179-puppy-v3.png',
]) test(`scene review rejects unapproved source pattern: ${reviewPath}`, t => {
  const f = fixture(t)
  assert.throws(() => reviewedImage({ ...f.args, reviewPath }), /Unsafe artwork source/)
})
