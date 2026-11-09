import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir, symlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { crc32, deflateSync } from 'node:zlib'
import art from '../../artifacts/spanish-travel-2-art/manifest.json' with { type: 'json' }
import review from '../../artifacts/spanish-travel-2-audio-review/manifest.json' with { type: 'json' }
import voices from '../../content/es-419-voices.json' with { type: 'json' }
import draft from '../../content/spanish-travel-2/draft.json' with { type: 'json' }
import acceptance from '../../content/spanish-travel-2/acceptance.json' with { type: 'json' }
import { acceptedSpanishLevel2Bank, stageSpanishTravelLevel2 } from './stage-spanish-travel-level-2.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function transparentPng() {
  const chunk = (name, bytes) => { const t = Buffer.from(name), size = Buffer.alloc(4), crc = Buffer.alloc(4); size.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([t, bytes]))); return Buffer.concat([size, t, bytes, crc]) }
  const header = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0])
  const pixels = Buffer.from([0, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}
async function fixture(t, { media = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'spanish-level2-stage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const save = async (path, bytes) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), bytes) }
  const saveJson = async (path, data) => { const bytes = Buffer.from(JSON.stringify(data) + '\n'); await save(path, bytes); return bytes }
  const pictures = structuredClone(art), audio = structuredClone(review), accepted = structuredClone(acceptance)
  const png = transparentPng(), jpg = Buffer.from('unchanged approved JPG fixture'), mp3 = Buffer.from('accepted normalized MP3 fixture')
  const reusable = []
  if (media) {
    for (const image of pictures.images) {
      const bytes = image.source === 'generated' ? png : jpg; image.sha256 = hash(bytes); image.bytes = bytes.length
      await save('artifacts/spanish-travel-2-art/' + image.file, bytes)
      if (image.source === 'approved-reuse') { await save(image.sourcePath, bytes); reusable.push({ id: image.sourceId, path: image.sourcePath, sha256: image.sha256 }) }
    }
    for (const clip of audio.clips) { clip.deliverySha256 = hash(mp3); clip.deliveryBytes = mp3.length; await save('artifacts/spanish-travel-2-audio-review/' + clip.file, mp3) }
  }
  accepted.audioReviewSha256 = hash(await saveJson(accepted.audioReviewManifest, audio)); pictures.audioManifestSha256 = accepted.audioReviewSha256
  accepted.artworkManifestSha256 = hash(await saveJson(accepted.artworkManifest, pictures))
  await saveJson('content/spanish-travel-2/acceptance.json', accepted); await saveJson('content/spanish-travel-2/draft.json', draft)
  await saveJson('content/es-419-voices.json', voices); await saveJson('content/card-regeneration/activation.json', { assets: reusable })
  await save('content/es-419.json', 'level1 must remain unchanged')
  return { root, save, saveJson, pictures, audio, accepted }
}
async function assertUnchanged(root) {
  assert.equal(await readFile(join(root, 'content/es-419.json'), 'utf8'), 'level1 must remain unchanged')
  await assert.rejects(readFile(join(root, 'content/es-419-travel-2.json')), { code: 'ENOENT' })
  await assert.rejects(readFile(join(root, 'content/spanish-travel-2/activation.json')), { code: 'ENOENT' })
  await assert.rejects(readdir(join(root, 'public/audio/es-419-travel-2')), { code: 'ENOENT' })
}

test('constructs the approved 36×8 bank with stairs v5, two unchanged reuses and no cross-bank references', () => {
  const bank = acceptedSpanishLevel2Bank(art, review, voices.voices)
  assert.equal(bank.id, 'es-419-travel-2'); assert.equal(bank.items.length, 36)
  assert.equal(bank.items.flatMap(item => item.audio).length, 288)
  assert(bank.items.every(item => !Object.hasOwn(item, 'pictureDistractorExclusions')))
  assert.equal(bank.items.filter(item => item.image.src.endsWith('.jpg')).length, 2)
  const stairs = art.images.find(item => item.slug === 'stairs')
  assert.equal(bank.items.find(item => item.id === stairs.id).image.src, `images/approved/${stairs.id}-${stairs.sha256.slice(0, 12)}.png`)
})

test('rejects missing, duplicate, foreign and mislabeled voice/word records', () => {
  for (const change of [r => r.clips.pop(), r => { r.clips[1] = r.clips[0] }, r => { r.clips[0].id = 'foreign' }, r => { r.clips[0].voiceId = 'wrong' }, r => { r.clips[0].request.text = 'unapproved' }]) {
    const altered = structuredClone(review); change(altered)
    assert.throws(() => acceptedSpanishLevel2Bank(art, altered, voices.voices))
  }
})

test('staging is byte-identical and idempotent and never alters level 1', async t => {
  const { root } = await fixture(t)
  assert.deepEqual(await stageSpanishTravelLevel2({ root }), { words: 36, images: 36, recordings: 288, voices: 8 })
  const first = await readFile(join(root, 'content/es-419-travel-2.json')), activation = JSON.parse(await readFile(join(root, 'content/spanish-travel-2/activation.json')))
  for (const entry of [...activation.images, ...activation.recordings]) assert.equal(hash(await readFile(join(root, 'public/' + entry.src))), entry.sha256)
  await rm(join(root, 'artifacts/spanish-travel-2-audio-review/audio'), { recursive: true })
  await stageSpanishTravelLevel2({ root })
  assert.deepEqual(await readFile(join(root, 'content/es-419-travel-2.json')), first)
  assert.equal(await readFile(join(root, 'content/es-419.json'), 'utf8'), 'level1 must remain unchanged')
})

test('changed acceptance, source picture or final recording refuses every production write', async t => {
  const { root, save, saveJson, accepted, pictures, audio } = await fixture(t)
  await saveJson('content/spanish-travel-2/acceptance.json', { ...accepted, artworkManifestSha256: 'wrong' })
  await assert.rejects(stageSpanishTravelLevel2({ root }), /Accepted media manifest changed/); await assertUnchanged(root)
  await saveJson('content/spanish-travel-2/acceptance.json', accepted)
  const firstImage = 'artifacts/spanish-travel-2-art/' + pictures.images[0].file
  const original = await readFile(join(root, firstImage)); await save(firstImage, Buffer.from('tampered image'))
  await assert.rejects(stageSpanishTravelLevel2({ root }), /Accepted image bytes changed/); await assertUnchanged(root)
  await save(firstImage, original)
  await save('artifacts/spanish-travel-2-audio-review/' + audio.clips.at(-1).file, Buffer.from('tampered final recording'))
  await assert.rejects(stageSpanishTravelLevel2({ root }), /Accepted recording bytes changed/); await assertUnchanged(root)
})


test('a missing archived matrix cannot hide changed active recording bytes', async t => {
  const { root, save } = await fixture(t)
  await stageSpanishTravelLevel2({ root })
  const bankPath = join(root, 'content/es-419-travel-2.json')
  const before = await readFile(bankPath)
  await rm(join(root, 'artifacts/spanish-travel-2-audio-review/audio'), { recursive: true })
  const clip = review.clips.at(-1)
  await save('public/audio/es-419-travel-2/' + clip.file.slice(6), 'corrupt active delivery')
  await assert.rejects(stageSpanishTravelLevel2({ root }), /Accepted recording bytes changed/)
  assert.deepEqual(await readFile(bankPath), before)
})

for (const mode of ['directory', 'dangling-file', 'bank']) test(`rejects ${mode} output symlinks before copying`, async t => {
  const { root } = await fixture(t, { media: false }), outside = await mkdtemp(join(tmpdir(), 'spanish-level2-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  if (mode === 'directory') { await mkdir(join(root, 'public/audio'), { recursive: true }); await symlink(outside, join(root, 'public/audio/es-419-travel-2')) }
  else {
    const path = mode === 'bank' ? 'content/es-419-travel-2.json' : 'public/audio/es-419-travel-2/juan/es-419-travel-train-station.mp3'
    await mkdir(dirname(join(root, path)), { recursive: true }); await symlink(join(outside, 'unexpected'), join(root, path))
  }
  await assert.rejects(stageSpanishTravelLevel2({ root }), /symlink/)
  assert.deepEqual(await readdir(outside), [])
  assert.equal(await readFile(join(root, 'content/es-419.json'), 'utf8'), 'level1 must remain unchanged')
})


test('restaging accepts the identical canonical artwork after duplicate sources are removed', async t => {
  const f = await fixture(t)
  await stageSpanishTravelLevel2(f)
  const bankPath = join(f.root, 'content/es-419-travel-2.json')
  const activationPath = join(f.root, 'content/spanish-travel-2/activation.json')
  const bank = await readFile(bankPath), activation = JSON.parse(await readFile(activationPath))
  const aliases = {}
  for (const image of activation.images) {
    aliases[image.sourcePath] = { path: 'public/' + image.src, sha256: image.sha256, bytes: image.bytes }
    await rm(join(f.root, image.sourcePath))
  }
  await f.save('artifacts/artwork-aliases.json', JSON.stringify({ version: 1, aliases }))
  await stageSpanishTravelLevel2(f)
  assert.deepEqual(await readFile(bankPath), bank)
  assert.deepEqual(JSON.parse(await readFile(activationPath)), activation)
  await f.save('public/' + activation.images.at(-1).src, 'changed canonical artwork')
  await assert.rejects(stageSpanishTravelLevel2(f), /Accepted image bytes changed/)
  assert.deepEqual(await readFile(bankPath), bank)
})
