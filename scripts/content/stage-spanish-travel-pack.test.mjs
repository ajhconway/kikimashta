import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile, symlink, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import art from '../../artifacts/spanish-travel-art/manifest.json' with { type: 'json' }
import review from '../../artifacts/spanish-travel-audio-review/manifest.json' with { type: 'json' }
import config from '../../content/es-419-voices.json' with { type: 'json' }
import acceptance from '../../content/spanish-travel-audio/acceptance.json' with { type: 'json' }
import { createHash } from 'node:crypto'
import { deflateSync, crc32 } from 'node:zlib'
import { acceptedSpanishBank, stageSpanishTravelPack } from './stage-spanish-travel-pack.mjs'

test('activates the exact accepted 36×8 set with stable IDs, transparent PNG delivery and no Cesar or retired words', () => {
  const bank = acceptedSpanishBank(art, review, config.voices)
  assert.equal(bank.items.length, 36)
  assert.deepEqual(bank.items.map(i => i.id), art.items.map(i => i.id))
  assert.equal(bank.items.flatMap(i => i.audio).length, 288)
  assert(bank.items.every(i => i.audio.every(c => c.voice !== 'cesar')))
  assert.equal(bank.items.filter(i => i.image.src.endsWith('.png')).length, 30)
  assert.deepEqual(bank.items.find(i => i.id.endsWith('-car')).pictureDistractorExclusions, ['es-419-travel-taxi'])
  assert.deepEqual(bank.items.find(i => i.id.endsWith('-taxi')).pictureDistractorExclusions, ['es-419-travel-car'])
})

test('rejects incomplete, duplicated and mislabeled reviewed audio', () => {
  for (const change of [r => r.clips.pop(), r => { r.clips[1] = r.clips[0] }, r => { r.clips[0].voiceId = 'wrong' }, r => { r.clips[0].text = 'unapproved' }]) {
    const changed = structuredClone(review); change(changed)
    assert.throws(() => acceptedSpanishBank(art, changed, config.voices))
  }
})

test('changed acceptance manifests stop staging before any bank or production asset write', async t => {
  const root = await mkdtemp(join(tmpdir(), 'spanish-activation-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const files = {
    'content/spanish-travel-audio/acceptance.json': acceptance,
    [acceptance.artworkManifest]: { ...art, status: 'tampered' },
    [acceptance.audioReviewManifest]: review,
    'content/es-419-voices.json': config,
    'artifacts/spanish-travel-art/owner-feedback.json': {},
    'content/es-419.json': { retained: true },
  }
  for (const [file, data] of Object.entries(files)) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), JSON.stringify(data)) }
  await assert.rejects(stageSpanishTravelPack({ root }), /Accepted media manifest changed/)
  assert.deepEqual(JSON.parse(await readFile(join(root, 'content/es-419.json'))), { retained: true })
  await assert.rejects(readFile(join(root, 'content/spanish-travel-audio/activation.json')), { code: 'ENOENT' })
})

for (const mode of ['directory', 'dangling-file']) test(`restaging rejects ${mode} production symlinks before copying any accepted media`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'spanish-activation-root-'))
  const outside = await mkdtemp(join(tmpdir(), 'spanish-activation-outside-'))
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }) })
  for (const file of ['content/spanish-travel-audio/acceptance.json', acceptance.artworkManifest, acceptance.audioReviewManifest,
    'content/es-419-voices.json', 'artifacts/spanish-travel-art/owner-feedback.json']) {
    await mkdir(dirname(join(root, file)), { recursive: true }); await copyFile(file, join(root, file))
  }
  await writeFile(join(root, 'content/es-419.json'), '{"retained":true}')
  await mkdir(join(root, 'public/audio'), { recursive: true })
  if (mode === 'directory') await symlink(outside, join(root, 'public/audio/es-419-travel-v2'))
  else {
    const target = join(root, 'public/audio/es-419-travel-v2/juan/es-419-travel-hotel.mp3')
    await mkdir(dirname(target), { recursive: true }); await symlink(join(outside, 'unexpected.mp3'), target)
  }
  await assert.rejects(stageSpanishTravelPack({ root }), /Production media target escapes/)
  assert.deepEqual(await readdir(outside), [])
  assert.equal(await readFile(join(root, 'content/es-419.json'), 'utf8'), '{"retained":true}')
})


// A complete matrix with tiny bytes keeps restaging independent of archive size.
async function restagingFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'spanish-level1-restage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const save = async (path, bytes) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), bytes) }
  const saveJson = async (path, value) => { const bytes = Buffer.from(JSON.stringify(value)); await save(path, bytes); return bytes }
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  const chunk = (name, data) => { const type = Buffer.from(name), size = Buffer.alloc(4), crc = Buffer.alloc(4); size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([type, data]))); return Buffer.concat([size, type, data, crc]) }
  const header = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0])
  const pixels = Buffer.from([0, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
  const jpg = Buffer.from('approved unchanged picture fixture'), mp3 = Buffer.from('accepted normalized MP3 fixture')
  const pictures = structuredClone(art), audio = structuredClone(review), accepted = structuredClone(acceptance)
  const approved = []
  for (const item of pictures.items) {
    const picture = item.artwork, bytes = picture.status === 'reuse-approved' ? jpg : png
    picture.sha256 = hash(bytes); await save(picture.path, bytes)
    approved.push({ id: item.id, sha256: picture.sha256 })
    if (picture.status === 'reuse-approved') await save(picture.sourcePath, bytes)
  }
  for (const clip of audio.clips) { clip.deliverySha256 = hash(mp3); clip.deliveryBytes = mp3.length; await save('artifacts/spanish-travel-audio-review/' + clip.file, mp3) }
  accepted.artworkManifestSha256 = hash(await saveJson(accepted.artworkManifest, pictures))
  accepted.audioReviewSha256 = hash(await saveJson(accepted.audioReviewManifest, audio))
  await saveJson('content/spanish-travel-audio/acceptance.json', accepted)
  await saveJson('content/es-419-voices.json', config)
  await saveJson('artifacts/spanish-travel-art/owner-feedback.json', { finalApproval: { selectedImages: approved } })
  return { root, save }
}

test('restages level 1 from exact active deliveries after review duplicates are removed', async t => {
  const { root, save } = await restagingFixture(t)
  await stageSpanishTravelPack({ root })
  const bankPath = join(root, 'content/es-419.json'), first = await readFile(bankPath)
  await rm(join(root, 'artifacts/spanish-travel-audio-review/audio'), { recursive: true })
  assert.deepEqual(await stageSpanishTravelPack({ root }), { words: 36, voices: 8, recordings: 288, images: 36 })
  assert.deepEqual(await readFile(bankPath), first)
  await save('public/audio/es-419-travel-v2/' + review.clips.at(-1).file.slice(6), 'corrupt active delivery')
  await assert.rejects(stageSpanishTravelPack({ root }), /Accepted recording hash mismatch/)
  assert.deepEqual(await readFile(bankPath), first)
})
