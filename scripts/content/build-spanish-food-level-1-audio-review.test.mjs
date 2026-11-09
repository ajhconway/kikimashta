import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { loadSpanishFoodLevel1Plan } from './generate-spanish-food-level-1.mjs'
import { foodAudioReviewManifest, foodAudioReviewHtml, validateFoodAudioReviewManifest, foodNormalizationVerification, buildSpanishFoodLevel1AudioReview } from './build-spanish-food-level-1-audio-review.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
function sorted(value) {
  if (Array.isArray(value))
    return value.map(sorted)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]))
  return value
}
async function fixture() {
  const { plan, approval } = await loadSpanishFoodLevel1Plan()
  const planIdentity = hash(JSON.stringify(plan))
  const originals = plan.items.flatMap(item => plan.voices.map(voice => ({
    ...item, voice: voice.voice, voiceId: voice.id, voiceName: voice.name, model: plan.model,
    request: {
      text: item.text, model_id: plan.model, language_code: 'es', voice_settings: plan.voiceSettings
    }, planIdentity,
    file: `originals/${voice.voice}/${item.id}.mp3`, sha256: '1'.repeat(64), bytes: 100
  })))
  const deliveries = originals.map(original => ({
    ...structuredClone(original), file: original.file.slice(10), originalFile: original.file, originalSha256: original.sha256,
    sourceRecordSha256: hash(JSON.stringify(sorted(original))),
    profile: {
      version: 1, targetLufs: -22, truePeakCeilingDbtp: -2, maxBoostDb: 9, rate: 44100, bitrate: '128k', dualMono: true, shortClipAnalysis: 'pad-to-500ms-only-for-measurement'
    },
    after: { integratedLufs: -22, truePeakDbtp: -3, analysisPadding: false, measurementMethod: 'r128' }, decodedFrames: 44100, deliverySha256: '2'.repeat(64), deliveryBytes: 100, targetLimited: false, limitingReasons: [], gainDb: 0
  }))
  return {
    plan, approval, originals, deliveries
  }
}
test('complete review identifies Food level 1 and exposes all 96 recordings with regional labels', async () => {
  const { plan, approval, originals, deliveries } = await fixture()
  const manifest = foodAudioReviewManifest(plan, approval, originals, deliveries)
  assert.equal(manifest.issue, 218)
  assert.equal(manifest.pack, 'es-419-food-1')
  assert.equal(manifest.clips.length, 96)
  const html = foodAudioReviewHtml(manifest)
  assert.equal((html.match(/<audio controls/g) ?? []).length, 96)
  assert.match(html, /Spanish Food level 1/)
  assert.match(html, /papa — Juan, Mexico City, Mexico/)
  assert.match(html, /té — Veronica, Puerto Rico/)
  assert.doesNotMatch(html, /Cesar/)
})
test('Food level 1 review refuses incomplete and mismatched original/delivery matrices', async () => {
  for (const mutate of [
    f => {
      f.plan.issue = 155
    },
    f => {
      f.deliveries.pop()
    },
    f => {
      f.originals[0].request.text = 'another word'
    },
    f => {
      f.deliveries[0].sourceRecordSha256 = 'changed'
    },
    f => {
      f.deliveries[0].after.truePeakDbtp = 0
    },
  ]) {
    const data = await fixture()
    mutate(data)
    assert.throws(() => foodAudioReviewManifest(data.plan, data.approval, data.originals, data.deliveries))
  }
})
test('review rejects altered source bytes before creating its output directory', async (t) => {
  const { plan, originals, deliveries } = await fixture()
  const folder = await mkdtemp(join(tmpdir(), 'spanish-food1-review-'))
  t.after(() => rm(folder, { recursive: true, force: true }))
  const input = join(folder, 'originals')
  const delivery = join(folder, 'delivery')
  const output = join(folder, 'review')
  await mkdir(input)
  await mkdir(delivery)
  await writeFile(join(input, 'originals.jsonl'), originals.map(r => JSON.stringify(r)).join('\n') + '\n')
  await writeFile(join(delivery, 'deliveries.jsonl'), deliveries.map(r => JSON.stringify(r)).join('\n') + '\n')
  await writeFile(join(input, 'approval.json'), await readFile('content/spanish-food-1/audio-approval.json'))
  await writeFile(join(input, 'summary.json'), JSON.stringify({ status: 'generated', completed: plan.expectedClips }))
  const original = join(input, originals[0].file)
  const changed = join(delivery, deliveries[0].file)
  await mkdir(dirname(original), { recursive: true })
  await mkdir(dirname(changed), { recursive: true })
  await writeFile(original, Buffer.alloc(100))
  await writeFile(changed, Buffer.alloc(100))
  await assert.rejects(buildSpanishFoodLevel1AudioReview({
    input, delivery, output
  }), /hash mismatch/)
  await assert.rejects(stat(output), { code: 'ENOENT' })
})
test('shared Food manifest guard rejects changed bindings, requests and loudness', async () => {
  const { plan, approval, originals, deliveries } = await fixture()
  const m = foodAudioReviewManifest(plan, approval, originals, deliveries)
  assert.equal(validateFoodAudioReviewManifest(plan, approval, m), m)
  for (const mutate of [
    m => {
      m.draftSha256 = 'changed'
    }, m => {
      m.artworkAcceptanceSha256 = 'changed'
    }, m => {
      m.audioApprovalSha256 = 'changed'
    }, m => {
      m.audioReuseSha256 = 'changed'
    }, m => {
      m.clips[0].request.language_code = 'ja'
    }, m => {
      m.clips[0].request.voice_settings.stability = .9
    }, m => {
      m.clips[0].decodedFrames = 0
    }, m => {
      m.clips[0].gainDb = 10
    }, m => {
      m.clips[0].after.integratedLufs = -28
    }, m => {
      m.clips[0].after.truePeakDbtp = 0
    }, m => {
      m.clips[0].file = '../outside.mp3'
    }, m => {
      m.clips[1] = m.clips[0]
    }
  ]) {
    const changed = structuredClone(m)
    mutate(changed)
    assert.throws(() => validateFoodAudioReviewManifest(plan, approval, changed))
  }
})

test('normalization evidence binds exact existing summary bytes and reconciles the approved profile and clip counts', async () => {
  const manifest = JSON.parse(await readFile('artifacts/spanish-food-1-audio-review/manifest.json'))
  const summaryBytes = await readFile('artifacts/spanish-food-1-audio-review/normalization-summary.json')
  const summary = JSON.parse(summaryBytes)
  const evidence = foodNormalizationVerification(manifest, summaryBytes)
  assert.equal(evidence.clips, 96)
  assert.equal(evidence.targetLimited, 3)
  assert.equal(evidence.shortClipMeasurements, 3)
  assert.equal(evidence.manifestSha256, hash(await readFile('artifacts/spanish-food-1-audio-review/manifest.json')))
  assert.equal(evidence.normalizationSummarySha256, hash(summaryBytes))
  assert.equal(evidence.normalizationSummaryBytes, summaryBytes.length)
  const spaced = Buffer.concat([summaryBytes, Buffer.from(' ')])
  assert.notEqual(foodNormalizationVerification(manifest, spaced).normalizationSummarySha256, evidence.normalizationSummarySha256)
  assert.equal(foodNormalizationVerification(manifest, spaced).manifestSha256, evidence.manifestSha256)
  for (const change of [
    s => { s.profile.targetLufs = -14 }, s => { s.profile.maxBoostDb = 20 },
    s => { s.profile.rate = 48000 }, s => { s.clips = 288 },
    s => { s.targetLimited = 0 }, s => { s.shortClipMeasurements = 0 },
    s => { s.originalsPreserved = false }, s => { s.processing = 'Compressed and trimmed' },
    s => { s.resumed = -1 }, s => { s.resumed = 97 }, s => { s.resumed = .5 },
    s => { s.unverifiedData = 'must not be published' },
  ]) {
    const changed = structuredClone(summary); change(changed)
    assert.throws(() => foodNormalizationVerification(manifest, Buffer.from(JSON.stringify(changed))), /normalization summary differs/)
  }
  const changed = structuredClone(manifest)
  changed.clips.find(c => c.after.analysisPadding).after.analysisPadding = false
  assert.throws(() => foodNormalizationVerification(changed, summaryBytes), /normalization summary differs/)
})

test('summary tampering fails before any review output mutation; valid builds preserve summary bytes and emit separate evidence', async t => {
  const { plan, approval, originals, deliveries } = await fixture()
  const folder = await mkdtemp(join(tmpdir(), 'food-normalization-evidence-'))
  t.after(() => rm(folder, { recursive: true, force: true }))
  const input = join(folder, 'originals'), delivery = join(folder, 'delivery')
  await mkdir(input); await mkdir(delivery)
  const originalData = Buffer.alloc(100, 1), deliveredData = Buffer.alloc(100, 2)
  for (const [index, original] of originals.entries()) {
    original.sha256 = hash(originalData)
    const d = deliveries[index]
    d.sha256 = original.sha256; d.originalSha256 = original.sha256
    d.sourceRecordSha256 = hash(JSON.stringify(sorted(original)))
    d.deliverySha256 = hash(deliveredData)
    const originalPath = join(input, original.file), deliveryPath = join(delivery, d.file)
    await mkdir(dirname(originalPath), { recursive: true }); await mkdir(dirname(deliveryPath), { recursive: true })
    await writeFile(originalPath, originalData); await writeFile(deliveryPath, deliveredData)
  }
  await writeFile(join(input, 'originals.jsonl'), originals.map(r => JSON.stringify(r)).join('\n') + '\n')
  await writeFile(join(delivery, 'deliveries.jsonl'), deliveries.map(r => JSON.stringify(r)).join('\n') + '\n')
  await writeFile(join(input, 'approval.json'), JSON.stringify(approval))
  await writeFile(join(input, 'summary.json'), JSON.stringify({ status: 'generated', completed: plan.expectedClips }))
  const summary = { profile: deliveries[0].profile, clips: 96, resumed: 0, targetLimited: 0, shortClipMeasurements: 0,
    originalsPreserved: true, processing: 'Constant gain; each delivered MP3 encoded directly from its provider original. No dynamics compression, trimming, or timing changes.' }
  const output = join(folder, 'existing-review')
  await mkdir(output)
  const protectedFiles = ['manifest.json', 'normalization-summary.json', 'normalization-verification.json', 'index.html']
  for (const name of protectedFiles) await writeFile(join(output, name), 'existing ' + name)
  for (const change of [s => { s.profile.targetLufs = -14 }, s => { s.clips++ }, s => { s.targetLimited++ }, s => { s.shortClipMeasurements++ }]) {
    const changed = structuredClone(summary); change(changed)
    await writeFile(join(delivery, 'normalization-summary.json'), JSON.stringify(changed))
    await assert.rejects(buildSpanishFoodLevel1AudioReview({ input, delivery, output }), /normalization summary differs/)
    for (const name of protectedFiles) assert.equal(await readFile(join(output, name), 'utf8'), 'existing ' + name)
    const absent = join(folder, 'not-created')
    await assert.rejects(buildSpanishFoodLevel1AudioReview({ input, delivery, output: absent }), /normalization summary differs/)
    await assert.rejects(stat(absent), { code: 'ENOENT' })
  }
  const summaryBytes = Buffer.from(JSON.stringify(summary, null, 2) + '\n')
  await writeFile(join(delivery, 'normalization-summary.json'), summaryBytes)
  const complete = join(folder, 'complete-review')
  const manifest = await buildSpanishFoodLevel1AudioReview({ input, delivery, output: complete })
  assert.equal(manifest.clips.length, 96)
  assert.deepEqual(await readFile(join(complete, 'normalization-summary.json')), summaryBytes)
  const evidence = JSON.parse(await readFile(join(complete, 'normalization-verification.json')))
  assert.equal(evidence.normalizationSummarySha256, hash(summaryBytes))
  assert.equal(evidence.manifestSha256, hash(await readFile(join(complete, 'manifest.json'))))
  assert.equal(evidence.clips, 96)
})
