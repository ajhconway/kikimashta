import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { loadSpanishTravelLevel3Plan } from './generate-spanish-travel-level-3.mjs'
import { level3AudioReviewManifest, level3AudioReviewHtml } from './build-spanish-travel-level-3-audio-review.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]))
  return value
}
async function fixture() {
  const { plan } = await loadSpanishTravelLevel3Plan()
  const planIdentity = hash(JSON.stringify(plan))
  const originals = plan.items.flatMap(item => plan.voices.map(voice => ({ ...item, voice: voice.voice, voiceId: voice.id, voiceName: voice.name, model: plan.model,
    request: { text: item.text, model_id: plan.model, language_code: 'es', voice_settings: plan.voiceSettings }, planIdentity,
    file: `originals/${voice.voice}/${item.id}.mp3`, sha256: 'original-hash', bytes: 100 })))
  const deliveries = originals.map(original => ({ ...structuredClone(original), file: original.file.slice(10), originalFile: original.file, originalSha256: original.sha256,
    sourceRecordSha256: hash(JSON.stringify(sorted(original))),
    profile: { version: 1, targetLufs: -22, truePeakCeilingDbtp: -2, maxBoostDb: 9, rate: 44100, bitrate: '128k', dualMono: true, shortClipAnalysis: 'pad-to-500ms-only-for-measurement' },
    after: { integratedLufs: -22, truePeakDbtp: -3 }, decodedFrames: 44100, deliverySha256: 'delivery-hash', deliveryBytes: 100, targetLimited: false, gainDb: 0 }))
  return { plan, originals, deliveries }
}

test('complete review identifies level 3 and exposes all 288 recordings with regional labels', async () => {
  const { plan, originals, deliveries } = await fixture()
  const manifest = level3AudioReviewManifest(plan, originals, deliveries)
  assert.equal(manifest.issue, 174)
  assert.equal(manifest.pack, 'es-419-travel-3')
  assert.equal(manifest.clips.length, 288)
  const html = level3AudioReviewHtml(manifest)
  assert.equal((html.match(/<audio controls/g) ?? []).length, 288)
  assert.match(html, /Spanish travel level 3/)
  assert.match(html, /banqueta — Juan, Mexico City, Mexico/)
  assert.match(html, /espejo — Veronica, Puerto Rico/)
  assert.doesNotMatch(html, /Cesar/)
})

test('level 3 review refuses incomplete and mismatched original/delivery matrices', async () => {
  for (const mutate of [
    f => { f.plan.issue = 155 },
    f => { f.deliveries.pop() },
    f => { f.originals[0].request.text = 'another word' },
    f => { f.deliveries[0].sourceRecordSha256 = 'changed' },
    f => { f.deliveries[0].after.truePeakDbtp = 0 },
  ]) {
    const data = await fixture(); mutate(data)
    assert.throws(() => level3AudioReviewManifest(data.plan, data.originals, data.deliveries))
  }
})
