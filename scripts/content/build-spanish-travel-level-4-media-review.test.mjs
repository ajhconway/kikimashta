import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { buildLevel4MediaReview } from './build-spanish-travel-level-4-media-review.mjs'
import { loadSpanishTravelLevel4Plan } from './generate-spanish-travel-level-4.mjs'
const source = fileURLToPath(new URL('../../', import.meta.url)), hash = b => createHash('sha256').update(b).digest('hex')
const ART = 'artifacts/spanish-travel-4-art', AUDIO = 'artifacts/spanish-travel-4-audio-review'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const save = async (root, path, value) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n') }
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'travel4-review-')); t.after(() => rm(root, { recursive: true, force: true }))
  const draft = await json(join(source, 'content/spanish-travel-4/draft.json'))
  const requests = await json(join(source, ART, 'requests.json'))
  const copy = async path => { await mkdir(dirname(join(root, path)), { recursive: true }); await copyFile(join(source, path), join(root, path)) }
  for (const path of ['content/spanish-travel-4/draft.json', 'content/spanish-travel-4/generation-approval.json', 'content/card-regeneration/activation.json',
    'content/es-419-voices.json', ...['audio-config.json', 'audio-approval.json'].map(f => 'content/spanish-travel-4/' + f), ART + '/requests.json',
    requests.requests[0].referencePath, draft.items.find(i => i.artwork.reuseCandidate).artwork.reuseCandidate.path]) await copy(path)
  await save(root, ART + '/selection.json', { issue: 207, versions: {} })
  const q = requests.requests[0], bytes = await readFile(join(root, q.referencePath)), path = `originals/${q.slug}-v1.png`
  await save(root, ART + '/' + path, bytes)
  const record = { id: q.id, slug: q.slug, version: 1, path, sha256: hash(bytes), promptSha256: hash(q.prompt), referenceSha256: q.referenceSha256 }
  await save(root, ART + `/records/${q.slug}-v1.json`, record)
  return { root, q, bytes, record, requests }
}

test('progressive gallery keeps missing media pending and rejects changed picture/reference provenance before rewriting', async t => {
  const { root, q, bytes, record, requests } = await fixture(t)
  const result = await buildLevel4MediaReview(root)
  assert.equal(result.images.length, 36); assert.equal(result.generatedImages, 1); assert.equal(result.reusedImages, 1)
  assert.equal(result.pendingImages, 34); assert.equal(result.recordings, 0)
  const gallery = join(root, ART, 'review.html'), html = await readFile(gallery, 'utf8')
  assert.equal((html.match(/<article /g) ?? []).length, 36)
  assert.equal((html.match(/<audio controls/g) ?? []).length, 0)
  assert.ok(html.includes('First batch · Places and services')); assert.ok(html.includes('Audio generation in progress'))
  await save(root, ART + '/' + record.path, 'altered PNG')
  await assert.rejects(buildLevel4MediaReview(root), /Generated artwork bytes changed/)
  assert.equal(await readFile(gallery, 'utf8'), html)
  await save(root, ART + '/' + record.path, bytes)
  await save(root, q.referencePath, 'altered style reference')
  await assert.rejects(buildLevel4MediaReview(root), /Initial artwork request changed/)
  assert.equal(await readFile(gallery, 'utf8'), html)
  await save(root, q.referencePath, bytes)
  requests.requests[0].referencePath = '../../unreviewed.png'
  await save(root, ART + '/requests.json', requests)
  await assert.rejects(buildLevel4MediaReview(root), /Initial artwork request changed/)
  assert.equal(await readFile(gallery, 'utf8'), html)
})

test('selected revisions require the previous original reference and exact record bytes', async t => {
  const { root, q, bytes } = await fixture(t)
  const revision = { ...q, version: 2, ownerFeedback: 'Refine the picture', referenceRole: 'edit-target', referencePath: `${ART}/originals/${q.slug}-v1.png`, referenceSha256: hash(bytes), prompt: 'Edit the original picture.' }
  await save(root, ART + '/selection.json', { issue: 207, versions: { [q.slug]: 2 } })
  await save(root, ART + `/revisions/${q.slug}-v2-request.json`, revision)
  assert.equal((await buildLevel4MediaReview(root)).pendingImages, 35)
  await save(root, ART + `/originals/${q.slug}-v2.png`, bytes)
  await save(root, ART + `/records/${q.slug}-v2.json`, { id: q.id, slug: q.slug, version: 2, path: `originals/${q.slug}-v2.png`, sha256: hash(bytes), promptSha256: hash(revision.prompt), referenceSha256: revision.referenceSha256 })
  assert.equal((await buildLevel4MediaReview(root)).images.find(i => i.id === q.id).version, 2)
  revision.referencePath = q.referencePath
  await save(root, ART + `/revisions/${q.slug}-v2-request.json`, revision)
  await assert.rejects(buildLevel4MediaReview(root), /Artwork reference changed/)
})

test('complete audio matrix exposes all voices and rejects changed audio identity or bytes without partial gallery writes', async t => {
  const { root } = await fixture(t), { plan } = await loadSpanishTravelLevel4Plan(root), bytes = Buffer.from('isolated audio fixture')
  const clips = plan.items.flatMap(item => plan.voices.map(voice => ({ id: item.id, text: item.text, voice: voice.voice, voiceId: voice.id, voiceName: voice.name,
    file: `audio/${voice.voice}/${item.id}.mp3`, deliverySha256: hash(bytes), deliveryBytes: bytes.length, targetLimited: false })))
  for (const clip of clips) await save(root, AUDIO + '/' + clip.file, bytes)
  const audio = { issue: 207, pack: 'es-419-travel-4', items: plan.items, voices: plan.voices, planIdentity: hash(JSON.stringify(plan)), clips }
  await save(root, AUDIO + '/manifest.json', audio)
  const result = await buildLevel4MediaReview(root)
  assert.equal(result.recordings, 288)
  const gallery = join(root, ART, 'review.html'), html = await readFile(gallery, 'utf8')
  assert.equal((html.match(/<audio controls/g) ?? []).length, 288)
  assert.ok(html.includes('Mexico City, Mexico')); assert.ok(html.includes('Stop audio'))
  audio.clips[0].voiceId = 'different-provider-voice'
  await save(root, AUDIO + '/manifest.json', audio)
  await assert.rejects(buildLevel4MediaReview(root), /Audio word or voice identity changed/)
  assert.equal(await readFile(gallery, 'utf8'), html)
  audio.clips[0].voiceId = plan.voices[0].id
  await save(root, AUDIO + '/manifest.json', audio)
  await save(root, AUDIO + '/' + clips[0].file, 'altered audio')
  await assert.rejects(buildLevel4MediaReview(root), /Recording bytes changed/)
  assert.equal(await readFile(gallery, 'utf8'), html)
})
