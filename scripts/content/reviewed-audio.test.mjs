import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { reviewedAudio } from './reviewed-audio.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'reviewed-audio-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bytes = Buffer.from('accepted delivery bytes')
  const put = async (path, data = bytes) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), data) }
  const args = { root, reviewPath: 'review/audio.mp3', productionPath: 'public/audio/pack/voice/word.mp3',
    sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length }
  return { root, bytes, put, args }
}

test('reads the reviewed delivery where present, or verifies the existing production copy when absent', async t => {
  const { bytes, put, args } = await fixture(t)
  await put(args.productionPath)
  assert.deepEqual(await reviewedAudio(args), { bytes, path: args.productionPath })
  await put(args.reviewPath)
  assert.deepEqual(await reviewedAudio(args), { bytes, path: args.reviewPath })
})

test('a corrupt review copy cannot fall back to a correct production copy', async t => {
  const { put, args } = await fixture(t)
  await put(args.reviewPath, 'changed delivery')
  await put(args.productionPath)
  await assert.rejects(reviewedAudio(args), /hash mismatch/)
})

test('production fallback must match both accepted size and hash, and must exist', async t => {
  const { bytes, put, args } = await fixture(t)
  await assert.rejects(reviewedAudio(args), { code: 'ENOENT' })
  await put(args.productionPath, Buffer.alloc(bytes.length))
  await assert.rejects(reviewedAudio(args), /hash mismatch/)
  await put(args.productionPath, Buffer.concat([bytes, Buffer.from('extra')]))
  await assert.rejects(reviewedAudio(args), /hash mismatch/)
})

for (const mode of ['file', 'directory']) test(`does not follow ${mode} symlinks for a production fallback`, async t => {
  const { root, put, args } = await fixture(t)
  await put('outside/word.mp3')
  const link = mode === 'file' ? args.productionPath : 'public/audio/pack/voice'
  await mkdir(dirname(join(root, link)), { recursive: true })
  await symlink(join(root, mode === 'file' ? 'outside/word.mp3' : 'outside'), join(root, link))
  await assert.rejects(reviewedAudio(args), /symlink/)
})

test('an unreadable review source is not treated as a missing duplicate', async t => {
  const { root, put, args } = await fixture(t)
  await mkdir(join(root, args.reviewPath), { recursive: true })
  await put(args.productionPath)
  await assert.rejects(reviewedAudio(args), { code: 'EISDIR' })
})

test('retained Spanish review galleries link all accepted voices to the exact production deliveries', async () => {
  const { readFile } = await import('node:fs/promises')
  const root = new URL('../../', import.meta.url)
  const verified = new Set()
  for (const [folder, activation, htmls] of [
    ['spanish-travel-audio-review', 'spanish-travel-audio', ['artifacts/spanish-travel-audio-review/index.html']],
    ['spanish-travel-2-audio-review', 'spanish-travel-2', ['artifacts/spanish-travel-2-audio-review/index.html', 'artifacts/spanish-travel-2-art/review.html']],
    ['spanish-travel-3-audio-review', 'spanish-travel-3', ['artifacts/spanish-travel-3-audio-review/index.html', 'artifacts/spanish-travel-3-art/review.html']],
  ]) {
    const manifest = JSON.parse(await readFile(new URL(`artifacts/${folder}/manifest.json`, root)))
    const journal = JSON.parse(await readFile(new URL(`content/${activation}/activation.json`, root)))
    assert.equal(journal.recordings.length, 288)
    assert.equal(new Set(journal.recordings.map(record => `${record.id}/${record.voice}`)).size, 288)
    const expected = new Map(manifest.clips.map(clip => {
      const delivered = journal.recordings.find(record => record.id === clip.id && record.voice === clip.voice)
      assert.ok(delivered, 'activation retains every accepted word and voice')
      assert.equal(delivered.sha256, clip.deliverySha256)
      assert.equal(delivered.bytes, clip.deliveryBytes)
      return [new URL('public/' + delivered.src, root).href, clip]
    }))
    assert.equal(expected.size, 288)
    for (const path of htmls) {
      const page = new URL(path, root)
      const html = await readFile(page, 'utf8')
      const sources = [...html.matchAll(/<audio\b[^>]*\bsrc="([^"]+)"/g)].map(match => new URL(match[1], page))
      assert.equal(sources.length, 288)
      assert.equal(new Set(sources.map(url => url.href)).size, 288)
      for (const url of sources) {
        const clip = expected.get(url.href)
        assert.ok(clip, 'review audio resolves to its accepted production matrix')
        if (verified.has(url.href)) continue
        const bytes = await readFile(url)
        assert.equal(bytes.length, clip.deliveryBytes)
        assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.deliverySha256)
        verified.add(url.href)
      }
    }
  }
  assert.equal(verified.size, 864)
})
