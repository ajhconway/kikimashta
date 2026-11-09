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
  assert.equal(result.status, 'generation-in-progress')
  assert.ok(html.includes('Places and services')); assert.ok(!html.includes('First batch'))
  assert.ok(html.includes('review the full pack together')); assert.ok(html.includes('Audio generation in progress'))
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
  const revision = { ...q, version: 2, ownerFeedback: 'Refine the picture', concept: 'Updated picture concept for review.', referenceRole: 'edit-target', referencePath: `${ART}/originals/${q.slug}-v1.png`, referenceSha256: hash(bytes), prompt: 'Primary request: Updated picture concept for review.' }
  await save(root, ART + '/selection.json', { issue: 207, versions: { [q.slug]: 2 } })
  await save(root, ART + `/revisions/${q.slug}-v2-request.json`, revision)
  assert.equal((await buildLevel4MediaReview(root)).pendingImages, 35)
  await save(root, ART + `/originals/${q.slug}-v2.png`, bytes)
  await save(root, ART + `/records/${q.slug}-v2.json`, { id: q.id, slug: q.slug, version: 2, path: `originals/${q.slug}-v2.png`, sha256: hash(bytes), promptSha256: hash(revision.prompt), referenceSha256: revision.referenceSha256 })
  assert.equal((await buildLevel4MediaReview(root)).images.find(i => i.id === q.id).version, 2)
  assert.ok((await readFile(join(root, ART, 'review.html'), 'utf8')).includes(revision.concept))
  assert.ok(!(await readFile(join(root, ART, 'review.html'), 'utf8')).includes('Primary request:'))
  revision.referencePath = q.referencePath
  await save(root, ART + `/revisions/${q.slug}-v2-request.json`, revision)
  await assert.rejects(buildLevel4MediaReview(root), /Artwork reference changed/)
})

test('complete audio matrix exposes all voices and rejects changed audio identity or bytes without partial gallery writes', async t => {
  const { root, requests, bytes: pictureBytes } = await fixture(t), { plan } = await loadSpanishTravelLevel4Plan(root), bytes = Buffer.from('isolated audio fixture')
  const clips = plan.items.flatMap(item => plan.voices.map(voice => ({ id: item.id, text: item.text, voice: voice.voice, voiceId: voice.id, voiceName: voice.name,
    file: `audio/${voice.voice}/${item.id}.mp3`, deliverySha256: hash(bytes), deliveryBytes: bytes.length, targetLimited: false })))
  for (const clip of clips) await save(root, AUDIO + '/' + clip.file, bytes)
  const audio = { issue: 207, pack: 'es-419-travel-4', items: plan.items, voices: plan.voices, planIdentity: hash(JSON.stringify(plan)), clips }
  await save(root, AUDIO + '/manifest.json', audio)
  const result = await buildLevel4MediaReview(root)
  assert.equal(result.recordings, 288)
  assert.equal(result.status, 'generation-in-progress')
  for (const q of requests.requests) {
    const path = `originals/${q.slug}-v1.png`
    await save(root, ART + '/' + path, pictureBytes)
    await save(root, ART + `/records/${q.slug}-v1.json`, { id: q.id, slug: q.slug, version: 1, path, sha256: hash(pictureBytes), promptSha256: hash(q.prompt), referenceSha256: q.referenceSha256 })
  }
  const complete = await buildLevel4MediaReview(root)
  assert.equal(complete.status, 'generated-awaiting-owner-media-review')
  assert.equal(complete.generatedImages, 35); assert.equal(complete.reusedImages, 1); assert.equal(complete.pendingImages, 0); assert.equal(complete.recordings, 288)
  const artwork = await readFile(join(root, ART, 'artwork.html'), 'utf8')
  assert.equal((artwork.match(/<img /g) ?? []).length, 36)
  assert.ok(artwork.includes('ready for full-pack review'))
  const gallery = join(root, ART, 'review.html'), html = await readFile(gallery, 'utf8')
  assert.equal((html.match(/<audio controls/g) ?? []).length, 288)
  assert.ok(html.includes('Mexico City, Mexico')); assert.ok(html.includes('Stop audio'))
  assert.ok(html.includes('All 36 pictures and 288 recordings are ready for full-pack review'))
  assert.ok(!html.includes('Picture generation pending')); assert.ok(!html.includes('First batch'))
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


test('owner word replacement retires only current bandage media, preserves history and rejects changed amendment/media', async t => {
  const { root, requests, bytes: pictureBytes } = await fixture(t)
  for (const file of ['word-replacement.json', 'replacement-audio-approval.json']) {
    await save(root, 'content/spanish-travel-4/' + file, await readFile(join(source, 'content/spanish-travel-4', file)))
  }
  const amendmentPath = join(root, 'content/spanish-travel-4/word-replacement.json'), amendmentBytes = await readFile(amendmentPath), amendment = JSON.parse(amendmentBytes)
  const { loadSpanishTravelLevel4ReplacementPlan } = await import('./generate-spanish-travel-level-4-replacement.mjs')
  const { plan } = await loadSpanishTravelLevel4Plan(root), { plan: replacementPlan } = await loadSpanishTravelLevel4ReplacementPlan(root)
  const mockAudio = async (currentPlan, pack, folder) => {
    const bytes = Buffer.from('isolated audio fixture')
    const clips = currentPlan.items.flatMap(item => currentPlan.voices.map(voice => ({ id: item.id, text: item.text, voice: voice.voice, voiceId: voice.id, voiceName: voice.name,
      file: `audio/${voice.voice}/${item.id}.mp3`, deliverySha256: hash(bytes), deliveryBytes: bytes.length })))
    for (const clip of clips) await save(root, folder + '/' + clip.file, bytes)
    return { issue: 207, pack, items: currentPlan.items, voices: currentPlan.voices, planIdentity: hash(JSON.stringify(currentPlan)), clips }
  }
  const baseAudio = await mockAudio(plan, 'es-419-travel-4', AUDIO)
  await save(root, AUDIO + '/manifest.json', baseAudio)
  for (const q of requests.requests) {
    const path = `originals/${q.slug}-v1.png`
    await save(root, ART + '/' + path, pictureBytes)
    await save(root, ART + `/records/${q.slug}-v1.json`, { id: q.id, slug: q.slug, version: 1, path, sha256: hash(pictureBytes), promptSha256: hash(q.prompt), referenceSha256: q.referenceSha256 })
  }
  const newRequest = await json(join(source, amendment.artworkRequest))
  await save(root, amendment.artworkRequest, newRequest)
  const before = new Map(await Promise.all(['content/spanish-travel-4/draft.json', 'content/spanish-travel-4/generation-approval.json', ART + '/requests.json', ART + '/originals/bandage-v1.png', AUDIO + '/manifest.json'].map(async path => [path, await readFile(join(root, path))])))
  const pending = await buildLevel4MediaReview(root)
  assert.equal(pending.status, 'generation-in-progress'); assert.equal(pending.recordings, 280)
  assert.equal(pending.images.length, 36); assert.equal(pending.images.some(i => i.id === amendment.retiredItemId), false)
  assert.equal(pending.images.find(i => i.id === amendment.item.id).source, 'pending')
  const newImagePath = `originals/${newRequest.slug}-v1.png`, newRecordPath = ART + `/records/${newRequest.slug}-v1.json`
  await save(root, ART + '/' + newImagePath, pictureBytes)
  await save(root, newRecordPath, { id: newRequest.id, slug: newRequest.slug, version: 1, path: newImagePath, sha256: hash(pictureBytes), promptSha256: hash(newRequest.prompt), referenceSha256: newRequest.referenceSha256 })
  const replacementFolder = 'artifacts/spanish-travel-4-replacement-audio-review'
  const replacementAudio = { ...await mockAudio(replacementPlan, 'es-419-travel-4-replacement', replacementFolder), replacementSha256: hash(amendmentBytes), baseDraftSha256: hash(await readFile(join(root, 'content/spanish-travel-4/draft.json'))) }
  await save(root, replacementFolder + '/manifest.json', replacementAudio)
  const complete = await buildLevel4MediaReview(root)
  assert.equal(complete.status, 'generated-awaiting-owner-media-review'); assert.equal(complete.recordings, 288)
  assert.equal(complete.generatedImages, 35); assert.equal(complete.reusedImages, 1); assert.equal(complete.pendingImages, 0)
  assert.equal(complete.wordReplacementSha256, hash(amendmentBytes))
  const gallery = join(root, ART, 'review.html'), html = await readFile(gallery, 'utf8')
  assert.equal((html.match(/<audio controls/g) ?? []).length, 288)
  assert.equal((html.match(/aria-label="[^"]+: enchufe"/g) ?? []).length, 8)
  assert.ok(html.includes('Practical essentials')); assert.ok(html.includes('spanish-travel-4-replacement-audio-review'))
  assert.ok(!html.includes('venda')); assert.ok(!html.includes(amendment.retiredItemId))
  const wordReview = await readFile(join(root, 'content/spanish-travel-4/review.html'), 'utf8')
  assert.ok(wordReview.includes('enchufe')); assert.ok(wordReview.includes('Practical essentials')); assert.ok(!wordReview.includes('venda'))
  const replacementRecordBytes = await readFile(join(root, newRecordPath)), replacementRecord = JSON.parse(replacementRecordBytes)
  replacementRecord.referenceSha256 = 'changed-reference-hash'
  await save(root, newRecordPath, replacementRecord)
  await assert.rejects(buildLevel4MediaReview(root), /Artwork record changed/)
  assert.equal(await readFile(gallery, 'utf8'), html)
  await writeFile(join(root, newRecordPath), replacementRecordBytes)
  const replacementRequestBytes = await readFile(join(root, amendment.artworkRequest))
  newRequest.referenceRole = 'edit-target'
  await save(root, amendment.artworkRequest, newRequest)
  await assert.rejects(buildLevel4MediaReview(root), /Artwork reference changed/)
  assert.equal(await readFile(gallery, 'utf8'), html)
  await writeFile(join(root, amendment.artworkRequest), replacementRequestBytes)
  amendment.item.artwork.concept += ' changed'
  await save(root, 'content/spanish-travel-4/word-replacement.json', amendment)
  await assert.rejects(buildLevel4MediaReview(root), /replacement authorization changed/)
  assert.equal(await readFile(gallery, 'utf8'), html)
  await writeFile(amendmentPath, amendmentBytes)
  replacementAudio.clips[0].text = 'venda'
  await save(root, replacementFolder + '/manifest.json', replacementAudio)
  await assert.rejects(buildLevel4MediaReview(root), /Audio word or voice identity changed/)
  assert.equal(await readFile(gallery, 'utf8'), html)
  replacementAudio.clips[0].text = 'enchufe'
  await save(root, replacementFolder + '/manifest.json', replacementAudio)
  await save(root, replacementFolder + '/' + replacementAudio.clips[0].file, 'changed replacement recording')
  await assert.rejects(buildLevel4MediaReview(root), /Recording bytes changed/)
  assert.equal(await readFile(gallery, 'utf8'), html)
  for (const [path, bytes] of before) assert.deepEqual(await readFile(join(root, path)), bytes)
})
