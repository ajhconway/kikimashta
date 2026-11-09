import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir, symlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { crc32, deflateSync } from 'node:zlib'
import art from '../../artifacts/spanish-travel-3-art/manifest.json' with { type: 'json' }
import review from '../../artifacts/spanish-travel-3-audio-review/manifest.json' with { type: 'json' }
import voices from '../../content/es-419-voices.json' with { type: 'json' }
import draft from '../../content/spanish-travel-3/draft.json' with { type: 'json' }
import acceptance from '../../content/spanish-travel-3/acceptance.json' with { type: 'json' }
import { acceptedSpanishLevel3Bank, stageSpanishTravelLevel3 } from './stage-spanish-travel-level-3.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function transparentPng(opaque = false) {
  const chunk = (name, bytes) => { const t = Buffer.from(name), size = Buffer.alloc(4), crc = Buffer.alloc(4); size.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([t, bytes]))); return Buffer.concat([size, t, bytes, crc]) }
  const header = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0])
  const pixels = Buffer.from([0, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); if (opaque) for (const offset of [4, 8, 13, 17]) pixels[offset] = 255
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}
async function fixture(t, { opaqueForest = false, media = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'spanish-level3-stage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const save = async (path, bytes) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), bytes) }
  const saveJson = async (path, data) => { const bytes = Buffer.from(JSON.stringify(data) + '\n'); await save(path, bytes); return bytes }
  const pictures = structuredClone(art), audio = structuredClone(review), accepted = structuredClone(acceptance)
  const png = transparentPng(), jpg = Buffer.from('unchanged approved JPG fixture'), mp3 = Buffer.from('accepted normalized MP3 fixture')
  const reusable = []
  if (media) {
    for (const image of pictures.images) {
      const bytes = image.source === 'generated' ? png : image.file.endsWith('.png') ? transparentPng(opaqueForest) : jpg; image.sha256 = hash(bytes); image.bytes = bytes.length
      await save('artifacts/spanish-travel-3-art/' + image.file, bytes)
      if (image.source === 'approved-reuse') { await save(image.sourcePath, bytes); reusable.push({ id: image.sourceId, path: image.sourcePath, sha256: image.sha256, bytes: bytes.length, ...(image.file.endsWith('.png') ? { format: 'png', alpha: 'preserved' } : {}) }) }
    }
    for (const clip of audio.clips) { const bytes = clip.targetLimited ? await readFile(new URL('../../public/audio/es-419-travel-3/' + clip.file.slice(6), import.meta.url)) : mp3; clip.deliverySha256 = hash(bytes); clip.deliveryBytes = bytes.length; await save('artifacts/spanish-travel-3-audio-review/' + clip.file, bytes) }
  }
  accepted.audioReviewSha256 = hash(await saveJson(accepted.audioReviewManifest, audio)); pictures.audioManifestSha256 = accepted.audioReviewSha256
  accepted.artworkManifestSha256 = hash(await saveJson(accepted.artworkManifest, pictures))
  await saveJson('content/spanish-travel-3/acceptance.json', accepted); await saveJson('content/spanish-travel-3/draft.json', draft)
  await saveJson('content/es-419-voices.json', voices); await saveJson('content/card-regeneration/activation.json', { assets: reusable })
  await save('content/es-419.json', 'level1 must remain unchanged'); await save('content/es-419-travel-2.json', 'level2 must remain unchanged')
  return { root, save, saveJson, pictures, audio, accepted }
}
async function assertUnchanged(root) {
  assert.equal(await readFile(join(root, 'content/es-419.json'), 'utf8'), 'level1 must remain unchanged'); assert.equal(await readFile(join(root, 'content/es-419-travel-2.json'), 'utf8'), 'level2 must remain unchanged')
  await assert.rejects(readFile(join(root, 'content/es-419-travel-3.json')), { code: 'ENOENT' })
  await assert.rejects(readFile(join(root, 'content/spanish-travel-3/activation.json')), { code: 'ENOENT' })
  await assert.rejects(readdir(join(root, 'public/audio/es-419-travel-3')), { code: 'ENOENT' })
}

test('constructs the approved 36×8 bank with approved revisions, five unchanged reuses and no cross-bank references', () => {
  const bank = acceptedSpanishLevel3Bank(art, review, voices.voices)
  assert.equal(bank.id, 'es-419-travel-3'); assert.equal(bank.items.length, 36)
  assert.equal(bank.items.flatMap(item => item.audio).length, 288)
  assert(bank.items.every(item => !Object.hasOwn(item, 'pictureDistractorExclusions')))
  assert.equal(bank.items.filter(item => item.image.src.endsWith('.jpg')).length, 4)
  assert.equal(bank.items.find(item => item.id.endsWith('-forest')).image.src, 'images/approved/ja-v-698044202165-8f2b6799af1c.png')
  for (const [slug, version] of Object.entries(acceptance.selectedRevisions)) { const picture = art.images.find(item => item.slug === slug); assert.equal(picture.version, version); assert.equal(bank.items.find(item => item.id === picture.id).image.src, `images/approved/${picture.id}-${picture.sha256.slice(0, 12)}.png`) }
})

test('rejects missing, duplicate, foreign and mislabeled voice/word records', () => {
  for (const change of [r => r.clips.pop(), r => { r.clips[1] = r.clips[0] }, r => { r.clips[0].id = 'foreign' }, r => { r.clips[0].voiceId = 'wrong' }, r => { r.clips[0].request.text = 'unapproved' }]) {
    const altered = structuredClone(review); change(altered)
    assert.throws(() => acceptedSpanishLevel3Bank(art, altered, voices.voices))
  }
})

test('staging is byte-identical and idempotent and never alters earlier levels', async t => {
  const { root } = await fixture(t)
  assert.deepEqual(await stageSpanishTravelLevel3({ root }), { words: 36, images: 36, recordings: 288, voices: 8 })
  const first = await readFile(join(root, 'content/es-419-travel-3.json')), activation = JSON.parse(await readFile(join(root, 'content/spanish-travel-3/activation.json')))
  assert.equal(activation.recordings.filter(clip => clip.targetLimited).length, 2)
  for (const entry of [...activation.images, ...activation.recordings]) assert.equal(hash(await readFile(join(root, 'public/' + entry.src))), entry.sha256)
  await rm(join(root, 'artifacts/spanish-travel-3-audio-review/audio'), { recursive: true })
  await stageSpanishTravelLevel3({ root })
  assert.deepEqual(await readFile(join(root, 'content/es-419-travel-3.json')), first)
  assert.equal(await readFile(join(root, 'content/es-419.json'), 'utf8'), 'level1 must remain unchanged'); assert.equal(await readFile(join(root, 'content/es-419-travel-2.json'), 'utf8'), 'level2 must remain unchanged')
})

test('changed acceptance, source picture or final recording refuses every production write', async t => {
  const { root, save, saveJson, accepted, pictures, audio } = await fixture(t)
  await saveJson('content/spanish-travel-3/acceptance.json', { ...accepted, artworkManifestSha256: 'wrong' })
  await assert.rejects(stageSpanishTravelLevel3({ root }), /Accepted media manifest changed/); await assertUnchanged(root)
  await saveJson('content/spanish-travel-3/acceptance.json', accepted)
  const firstImage = 'artifacts/spanish-travel-3-art/' + pictures.images[0].file
  const original = await readFile(join(root, firstImage)); await save(firstImage, Buffer.from('tampered image'))
  await assert.rejects(stageSpanishTravelLevel3({ root }), /Accepted image bytes changed/); await assertUnchanged(root)
  await save(firstImage, original)
  await save('artifacts/spanish-travel-3-audio-review/' + audio.clips.at(-1).file, Buffer.from('tampered final recording'))
  await assert.rejects(stageSpanishTravelLevel3({ root }), /Accepted recording bytes changed/); await assertUnchanged(root)
})


test('a missing archived matrix cannot hide changed active recording bytes', async t => {
  const { root, save } = await fixture(t)
  await stageSpanishTravelLevel3({ root })
  const bankPath = join(root, 'content/es-419-travel-3.json')
  const before = await readFile(bankPath)
  await rm(join(root, 'artifacts/spanish-travel-3-audio-review/audio'), { recursive: true })
  const clip = review.clips.at(-1)
  await save('public/audio/es-419-travel-3/' + clip.file.slice(6), 'corrupt active delivery')
  await assert.rejects(stageSpanishTravelLevel3({ root }), /Accepted recording bytes changed/)
  assert.deepEqual(await readFile(bankPath), before)
})

for (const mode of ['directory', 'dangling-file', 'bank']) test(`rejects ${mode} output symlinks before copying`, async t => {
  const { root } = await fixture(t, { media: false }), outside = await mkdtemp(join(tmpdir(), 'spanish-level3-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  if (mode === 'directory') { await mkdir(join(root, 'public/audio'), { recursive: true }); await symlink(outside, join(root, 'public/audio/es-419-travel-3')) }
  else {
    const path = mode === 'bank' ? 'content/es-419-travel-3.json' : 'public/audio/es-419-travel-3/juan/es-419-travel-sidewalk.mp3'
    await mkdir(dirname(join(root, path)), { recursive: true }); await symlink(join(outside, 'unexpected'), join(root, path))
  }
  await assert.rejects(stageSpanishTravelLevel3({ root }), /symlink/)
  assert.deepEqual(await readdir(outside), [])
  assert.equal(await readFile(join(root, 'content/es-419.json'), 'utf8'), 'level1 must remain unchanged'); assert.equal(await readFile(join(root, 'content/es-419-travel-2.json'), 'utf8'), 'level2 must remain unchanged')
})


test('only the two exact approved quieter deliveries may use loudness exceptions', () => {
  assert.equal(review.clips.filter(clip => clip.targetLimited).length, 2)
  assert.equal(acceptedSpanishLevel3Bank(art, review, voices.voices).items.length, 36)
  for (const change of [
    c => { c.deliverySha256 = 'a'.repeat(64) }, c => { c.originalSha256 = 'b'.repeat(64) },
    c => { c.after.integratedLufs -= 1 }, c => { c.after.truePeakDbtp = -1 },
    c => { c.gainDb += 1 }, c => { c.limitingReasons = ['unknown'] },
    c => { c.decodedFrames += 1 }, c => { c.targetLimited = false },
  ]) {
    const altered = structuredClone(review); change(altered.clips.find(clip => clip.targetLimited))
    assert.throws(() => acceptedSpanishLevel3Bank(art, altered, voices.voices), /playback profile/)
  }
  const altered = structuredClone(review), normal = altered.clips.find(clip => !clip.targetLimited)
  normal.targetLimited = true; normal.after.integratedLufs = -23; normal.limitingReasons = ['maximum_gain']
  assert.throws(() => acceptedSpanishLevel3Bank(art, altered, voices.voices), /playback profile/)
})

test('approved forest PNG reuse preserves exact source bytes and transparency evidence', async t => {
  const { root, saveJson } = await fixture(t)
  const evidencePath = 'content/card-regeneration/activation.json'
  const evidence = JSON.parse(await readFile(join(root, evidencePath)))
  evidence.assets.find(item => item.path.endsWith('.png')).alpha = 'flattened'
  await saveJson(evidencePath, evidence)
  await assert.rejects(stageSpanishTravelLevel3({ root }), /PNG reuse lost transparency or evidence/)
  await assertUnchanged(root)
})

test('even hash-matched approved PNG metadata cannot authorize a flattened forest', async t => {
  const { root } = await fixture(t, { opaqueForest: true })
  await assert.rejects(stageSpanishTravelLevel3({ root }), /PNG reuse lost transparency or evidence/)
  await assertUnchanged(root)
})

test('unsafe image and recording paths are rejected before public writes', async t => {
  const { root, saveJson, accepted, pictures, audio } = await fixture(t)
  pictures.images[0].file = '../unexpected.png'
  accepted.artworkManifestSha256 = hash(await saveJson(accepted.artworkManifest, pictures))
  await saveJson('content/spanish-travel-3/acceptance.json', accepted)
  await assert.rejects(stageSpanishTravelLevel3({ root }), /Unsafe generated picture path/)
  await assertUnchanged(root)
  pictures.images[0].file = art.images[0].file
  audio.clips[0].file = '../unexpected.mp3'
  accepted.audioReviewSha256 = hash(await saveJson(accepted.audioReviewManifest, audio))
  pictures.audioManifestSha256 = accepted.audioReviewSha256
  accepted.artworkManifestSha256 = hash(await saveJson(accepted.artworkManifest, pictures))
  await saveJson('content/spanish-travel-3/acceptance.json', accepted)
  await assert.rejects(stageSpanishTravelLevel3({ root }), /recording identity/)
  await assertUnchanged(root)
})


test('restaging accepts the identical canonical artwork after duplicate sources are removed', async t => {
  const f = await fixture(t)
  await stageSpanishTravelLevel3(f)
  const bankPath = join(f.root, 'content/es-419-travel-3.json')
  const activationPath = join(f.root, 'content/spanish-travel-3/activation.json')
  const bank = await readFile(bankPath), activation = JSON.parse(await readFile(activationPath))
  const aliases = {}
  for (const image of activation.images) {
    aliases[image.sourcePath] = { path: 'public/' + image.src, sha256: image.sha256, bytes: image.bytes }
    await rm(join(f.root, image.sourcePath))
  }
  await f.save('artifacts/artwork-aliases.json', JSON.stringify({ version: 1, aliases }))
  await stageSpanishTravelLevel3(f)
  assert.deepEqual(await readFile(bankPath), bank)
  assert.deepEqual(JSON.parse(await readFile(activationPath)), activation)
  await f.save('public/' + activation.images.at(-1).src, 'changed canonical artwork')
  await assert.rejects(stageSpanishTravelLevel3(f), /Accepted image bytes changed/)
  assert.deepEqual(await readFile(bankPath), bank)
})
