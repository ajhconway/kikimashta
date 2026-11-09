import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { loadSpanishBasicLevel1Plan } from './generate-spanish-basic-level-1.mjs'
import { basicAudioReviewManifest, basicAudioReviewHtml } from './build-spanish-basic-level-1-audio-review.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]))
  return value
}
async function fixture() {
  const { plan, approval } = await loadSpanishBasicLevel1Plan()
  const planIdentity = hash(JSON.stringify(plan))
  const originals = plan.items.flatMap(item => plan.voices.map(voice => ({ ...item, voice: voice.voice, voiceId: voice.id, voiceName: voice.name, model: plan.model,
    request: { text: item.text, model_id: plan.model, language_code: 'es', voice_settings: plan.voiceSettings }, planIdentity,
    file: `originals/${voice.voice}/${item.id}.mp3`, sha256: 'original-hash', bytes: 100 })))
  const deliveries = originals.map(original => ({ ...structuredClone(original), file: original.file.slice(10), originalFile: original.file, originalSha256: original.sha256,
    sourceRecordSha256: hash(JSON.stringify(sorted(original))),
    profile: { version: 1, targetLufs: -22, truePeakCeilingDbtp: -2, maxBoostDb: 9, rate: 44100, bitrate: '128k', dualMono: true, shortClipAnalysis: 'pad-to-500ms-only-for-measurement' },
    after: { integratedLufs: -22, truePeakDbtp: -3 }, decodedFrames: 44100, deliverySha256: 'delivery-hash', deliveryBytes: 100, targetLimited: false, gainDb: 0 }))
  return { plan, originals, deliveries, approval }
}

test('complete review identifies Basic Spanish level 1 and exposes all 336 recordings with regional labels', async () => {
  const { plan, originals, deliveries, approval } = await fixture()
  const manifest = basicAudioReviewManifest(plan, originals, deliveries, approval)
  assert.equal(manifest.issue, 191)
  assert.equal(manifest.pack, 'es-419-basic-1')
  assert.equal(manifest.clips.length, 336)
  assert.equal(manifest.wordCount, 24)
  assert.equal(manifest.contextCount, 9)
  assert.deepEqual(manifest.contexts[0], { id: 'es-419-basic-ctx-have-01', targetItemId: 'es-419-basic-have', revision: 1, sentenceId: 'es-419-basic-ctx-have-01-sentence', questionId: 'es-419-basic-ctx-have-01-question' })
  assert.equal(manifest.clips.filter(c => c.role === 'word').length, 192)
  assert.equal(manifest.clips.filter(c => c.role !== 'word').length, 144)
  const html = basicAudioReviewHtml(manifest)
  assert.equal((html.match(/<audio controls/g) ?? []).length, 336)
  assert.match(html, /Basic Spanish level 1/)
  assert.match(html, /tener — Juan, Mexico City, Mexico/)
  assert.match(html, /después — Veronica, Puerto Rico/)
  assert.doesNotMatch(html, /Cesar|Spanish travel/)
  assert.match(html, /Context sentence · Have/)
  assert.match(html, /¿Qué tengo\? — Juan/)
  assert.match(html, /24 words · 9 sentence\/question pairs · 8 voices · 336 recordings/)
})

test('Basic Spanish level 1 review refuses incomplete and mismatched original/delivery matrices', async () => {
  for (const mutate of [
    f => { f.plan.issue = 155 },
    f => { f.deliveries.pop() },
    f => { f.originals[192].role = 'word' },
    f => { f.deliveries[192].targetItemId = 'es-419-basic-want' },
    f => { f.plan.items[24].contextRevision = 2 },
    f => { f.approval.itemsSha256 = 'changed-approval' },
    f => { f.originals[0].request.text = 'another word' },
    f => { f.deliveries[0].sourceRecordSha256 = 'changed' },
    f => { f.deliveries[0].after.truePeakDbtp = 0 },
  ]) {
    const data = await fixture(); mutate(data)
    assert.throws(() => basicAudioReviewManifest(data.plan, data.originals, data.deliveries, data.approval))
  }
})
