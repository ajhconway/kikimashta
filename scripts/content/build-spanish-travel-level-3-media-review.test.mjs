import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import { buildLevel3MediaReview } from './build-spanish-travel-level-3-media-review.mjs'
import { loadSpanishTravelLevel3Plan } from './generate-spanish-travel-level-3.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const metadata = path => readFile(new URL('../../' + path, import.meta.url), 'utf8').then(JSON.parse)
function png() {
  const chunk = (name, bytes) => {
    const type = Buffer.from(name), length = Buffer.alloc(4), checksum = Buffer.alloc(4)
    length.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc32(Buffer.concat([type, bytes])))
    return Buffer.concat([length, type, bytes, checksum])
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(1024); header.writeUInt32BE(1024, 4); header[8] = 8; header[9] = 6
  const pixels = Buffer.alloc((1024 * 4 + 1) * 1024); pixels.fill(255, 1, 5)
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'level3-media-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const save = async (path, data) => { const dest = join(root, path); await mkdir(join(dest, '..'), { recursive: true }); await writeFile(dest, typeof data === 'object' && !Buffer.isBuffer(data) ? JSON.stringify(data) : data) }
  const art = 'artifacts/spanish-travel-3-art/'
  const bank = await metadata('content/spanish-travel-3/draft.json')
  for (const item of bank.items) delete item.artwork.selectedVersion
  const requests = await metadata(art + 'requests.json')
  for (const name of ['audio-config.json', 'audio-approval.json']) await save('content/spanish-travel-3/' + name, await metadata('content/spanish-travel-3/' + name))
  const reference = Buffer.from('style reference fixture'), picture = png(), reused = Buffer.from('preserved JPG fixture')
  for (const item of bank.items) {
    if (item.artwork.status === 'reuse-candidate') {
      const source = item.artwork.candidatePath.endsWith('.png') ? picture : reused
      item.artwork.candidateSha256 = hash(source); await save(item.artwork.candidatePath, source)
    }
    if (item.artwork.status === 'needs-generation' || item.artwork.supersededGeneratedImage) {
      if (item.artwork.supersededGeneratedImage) item.artwork.supersededGeneratedImage.sha256 = hash(picture)
      const q = requests.requests.find(q => q.id === item.id); q.referenceSha256 = hash(reference)
      q.prompt = 'Primary request: ' + item.artwork.concept
      await save(q.referencePath, reference)
      await save(art + 'originals/' + item.slug + '-v1.png', picture)
      await save(art + 'records/' + item.slug + '-v1.json', { id: item.id, slug: item.slug, path: 'originals/' + item.slug + '-v1.png', sha256: hash(picture), promptSha256: hash(q.prompt), referenceSha256: q.referenceSha256 })
    }
  }
  await save('content/spanish-travel-3/draft.json', bank); await save(art + 'requests.json', requests)
  const { plan } = await loadSpanishTravelLevel3Plan(root)
  const recording = Buffer.from('audio delivery fixture')
  const audio = { issue: 174, pack: bank.id, planIdentity: hash(JSON.stringify(plan)), voices: plan.voices, items: plan.items,
    clips: plan.items.flatMap(item => plan.voices.map(voice => ({ ...item, voice: voice.voice, voiceId: voice.id,
      file: `audio/${voice.voice}/${item.id}.mp3`, deliverySha256: hash(recording), deliveryBytes: recording.length }))) }
  await save('artifacts/spanish-travel-3-audio-review/manifest.json', audio)
  for (const clip of audio.clips) await save('artifacts/spanish-travel-3-audio-review/' + clip.file, recording)
  return { root, save, bank }
}

test('combined review includes every picture and recording with relative media links', async t => {
  const { root } = await fixture(t)
  const result = await buildLevel3MediaReview(root)
  assert.equal(result.images.length, 36)
  assert.equal(result.images.filter(i => i.source === 'generated').length, 31)
  const html = await readFile(join(root, 'artifacts/spanish-travel-3-art/review.html'), 'utf8')
  assert.equal((html.match(/<figure>/g) || []).length, 36)
  assert.equal((html.match(/<audio /g) || []).length, 288)
  assert.match(html, /\.\.\/spanish-travel-3-audio-review\/audio\/juan\/es-419-travel-sidewalk.mp3/)
  assert.match(html, /href="artwork.html"/)
  assert.equal(result.generatedImages, 31)
  assert.equal(result.reusedImages, 5)
  const banana = result.images.find(image => image.slug === 'banana')
  assert.equal(banana.file, 'reused/banana.jpg')
  assert.deepEqual(await readFile(join(root, 'artifacts/spanish-travel-3-art/' + banana.file)), await readFile(join(root, banana.sourcePath)))
  const forest = result.images.find(image => image.slug === 'forest')
  assert.equal(forest.file, 'reused/forest.png')
  assert.deepEqual(await readFile(join(root, 'artifacts/spanish-travel-3-art/' + forest.file)), await readFile(join(root, forest.sourcePath)))
})


test('combined review uses verified active audio after archived duplicates are removed', async t => {
  const { root, save } = await fixture(t)
  const path = join(root, 'artifacts/spanish-travel-3-audio-review/manifest.json')
  const audio = JSON.parse(await readFile(path, 'utf8'))
  for (const clip of audio.clips) await save('public/audio/es-419-travel-3/' + clip.file.slice(6), await readFile(join(root, 'artifacts/spanish-travel-3-audio-review', clip.file)))
  await rm(join(root, 'artifacts/spanish-travel-3-audio-review/audio'), { recursive: true })
  await buildLevel3MediaReview(root)
  const html = await readFile(join(root, 'artifacts/spanish-travel-3-art/review.html'), 'utf8')
  assert.equal((html.match(/src="\.\.\/\.\.\/public\/audio\/es-419-travel-3\//g) || []).length, 288)
  const before = html
  await save('public/audio/es-419-travel-3/' + audio.clips.at(-1).file.slice(6), 'changed production delivery')
  await assert.rejects(buildLevel3MediaReview(root), /Review recording hash mismatch/)
  assert.equal(await readFile(join(root, 'artifacts/spanish-travel-3-art/review.html'), 'utf8'), before)
})

test('changed generated bytes fail before a review is written', async t => {
  const { root, save } = await fixture(t)
  await save('artifacts/spanish-travel-3-art/originals/sidewalk-v1.png', Buffer.from('changed image'))
  await assert.rejects(buildLevel3MediaReview(root), /Generated image hash mismatch/)
  await assert.rejects(readFile(join(root, 'artifacts/spanish-travel-3-art/review.html')), { code: 'ENOENT' })
})

test('changed approved reuse and changed recording bytes cannot enter the gallery', async t => {
  const { root, save, bank } = await fixture(t)
  const reuse = bank.items.find(item => item.artwork.status === 'reuse-candidate')
  await save(reuse.artwork.candidatePath, Buffer.from('changed approved source'))
  await assert.rejects(buildLevel3MediaReview(root), /Approved reuse hash mismatch/)
  await save(reuse.artwork.candidatePath, Buffer.from('preserved JPG fixture'))
  await save('artifacts/spanish-travel-3-audio-review/audio/juan/es-419-travel-sidewalk.mp3', Buffer.from('changed recording'))
  await assert.rejects(buildLevel3MediaReview(root), /Review recording hash mismatch/)
})


test('changed exact prompts cannot claim the original image provenance', async t => {
  const { root, save } = await fixture(t)
  const path = 'artifacts/spanish-travel-3-art/requests.json'
  const requests = JSON.parse(await readFile(join(root, path), 'utf8'))
  requests.requests[0].prompt += '\nChanged rendering instruction.'
  await save(path, requests)
  await assert.rejects(buildLevel3MediaReview(root), /Image record identity changed/)
})


test('a selected revision replaces only its picture and keeps the first original intact', async t => {
  const { root, save, bank } = await fixture(t)
  const revised = bank.items.find(item => item.slug === 'sidewalk')
  const art = 'artifacts/spanish-travel-3-art/'
  const original = await readFile(join(root, art + 'originals/sidewalk-v1.png'))
  const requests = JSON.parse(await readFile(join(root, art + 'requests.json'), 'utf8'))
  const q = { ...requests.requests.find(q => q.slug === 'sidewalk'), version: 2, ownerFeedback: 'Clarify the curb.', prompt: 'Primary request: ' + revised.artwork.concept + '\nKeep the raised curb clear.' }
  const record = { id: revised.id, slug: revised.slug, version: 2, path: 'originals/sidewalk-v2.png', sha256: hash(original), promptSha256: hash(q.prompt), referenceSha256: q.referenceSha256 }
  revised.artwork.selectedVersion = 2
  await save('content/spanish-travel-3/draft.json', bank)
  await save(art + 'revisions/sidewalk-v2-request.json', q)
  await save(art + 'records/sidewalk-v2.json', record)
  await save(art + 'originals/sidewalk-v2.png', original)
  const result = await buildLevel3MediaReview(root)
  assert.equal(result.images.find(i => i.slug === 'sidewalk').file, 'originals/sidewalk-v2.png')
  assert.equal(result.images.filter(i => i.file.endsWith('-v1.png')).length, 30)
  assert.deepEqual(await readFile(join(root, art + 'originals/sidewalk-v1.png')), original)
  const html = await readFile(join(root, art + 'review.html'), 'utf8')
  assert.match(html, /src="originals\/sidewalk-v2.png"/)
  q.additionalReferences = [{ path: art + 'revisions/sidewalk-geometry-reference.png', role: 'strict-geometry', sha256: hash('reference') }]
  record.additionalReferences = q.additionalReferences
  await save(art + 'revisions/sidewalk-v2-request.json', q)
  await save(art + 'records/sidewalk-v2.json', record)
  await save(q.additionalReferences[0].path, 'changed reference')
  await assert.rejects(buildLevel3MediaReview(root), /Geometry reference hash mismatch/)
})


test('switching to an approved reuse retains the superseded generated original and prompt', async t => {
  const { root, save } = await fixture(t)
  const art = 'artifacts/spanish-travel-3-art/'
  const original = await readFile(join(root, art + 'originals/banana-v1.png'))
  await buildLevel3MediaReview(root)
  assert.deepEqual(await readFile(join(root, art + 'originals/banana-v1.png')), original)
  await save(art + 'originals/banana-v1.png', 'changed superseded image')
  await assert.rejects(buildLevel3MediaReview(root), /Superseded original provenance changed/)
})

test('an edit binds its previous version and rejects a changed reference', async t => {
  const { root, save, bank } = await fixture(t)
  const revised = bank.items.find(item => item.slug === 'sidewalk')
  const art = 'artifacts/spanish-travel-3-art/'
  const original = await readFile(join(root, art + 'originals/sidewalk-v1.png'))
  const q = { id: revised.id, slug: revised.slug, version: 2, ownerFeedback: 'Clarify the curb.',
    transparent_background: true, referenceRole: 'edit-target', referencePath: art + 'originals/sidewalk-v1.png',
    referenceSha256: hash(original), prompt: 'Primary request: ' + revised.artwork.concept }
  const record = { id: revised.id, slug: revised.slug, version: 2, path: 'originals/sidewalk-v2.png', sha256: hash(original), promptSha256: hash(q.prompt), referenceSha256: q.referenceSha256 }
  revised.artwork.selectedVersion = 2
  await save('content/spanish-travel-3/draft.json', bank)
  await save(art + 'revisions/sidewalk-v2-request.json', q)
  await save(art + 'records/sidewalk-v2.json', record)
  await save(art + 'originals/sidewalk-v2.png', original)
  assert.equal((await buildLevel3MediaReview(root)).images.find(i => i.slug === 'sidewalk').version, 2)
  await save(q.referencePath, 'changed edit target')
  await assert.rejects(buildLevel3MediaReview(root), /Image reference hash mismatch/)
  q.referencePath = art + 'originals/blanket-v1.png'
  await save(art + 'revisions/sidewalk-v2-request.json', q)
  await assert.rejects(buildLevel3MediaReview(root), /Image request identity changed/)
})
