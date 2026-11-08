import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { audioReviewManifest, spanishAudioReviewHtml } from './build-spanish-audio-review.mjs'

function fixture() {
  function sorted(value) {
    if (Array.isArray(value)) return value.map(sorted)
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]))
    return value
  }
  const plan = { issue: 155, provider: 'ElevenLabs', language: 'es-419', model: 'eleven_v4', characters: 16,
    voiceSettings: { stability: 0.5, similarity_boost: 0.75 },
    voices: [{ voice: 'juan', id: 'provider-juan', name: 'Juan', region: 'Mexico City, Mexico', locale: 'es-MX' }, { voice: 'pamela', id: 'provider-pamela', name: 'Pamela', region: 'Mexico City, Mexico', locale: 'es-MX' }],
    items: [{ id: 'es-419-travel-water', text: 'agua', spelling: 'agua', meaning: 'Water' }, { id: 'es-419-travel-key', text: 'llave', spelling: 'llave', meaning: 'Key' }] }
  const identity = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  const originals = plan.items.flatMap(item => plan.voices.map(voice => ({ ...item, voice: voice.voice, voiceId: voice.id, voiceName: voice.name, model: plan.model,
    request: { text: item.text, model_id: plan.model, language_code: 'es', voice_settings: plan.voiceSettings }, planIdentity: identity,
    file: `originals/${voice.voice}/${item.id}.mp3`, sha256: 'original-hash', bytes: 100 })))
  const deliveries = originals.map(original => ({ ...structuredClone(original), file: original.file.slice(10), originalFile: original.file, originalSha256: original.sha256,
    sourceRecordSha256: createHash('sha256').update(JSON.stringify(sorted(original))).digest('hex'),
    profile: { version: 1, targetLufs: -22, truePeakCeilingDbtp: -2, maxBoostDb: 9, rate: 44100, bitrate: '128k', dualMono: true, shortClipAnalysis: 'pad-to-500ms-only-for-measurement' }, after: { integratedLufs: -22, truePeakDbtp: -3 }, decodedFrames: 44100,
    deliverySha256: 'delivery-hash', deliveryBytes: 100, targetLimited: false, gainDb: 0 }))
  return { plan, originals, deliveries }
}

test('review preserves exact text/voice coverage and labels every clip by region', () => {
  const { plan, originals, deliveries } = fixture()
  const manifest = audioReviewManifest(plan, originals, deliveries)
  assert.equal(manifest.clips.length, 4)
  assert.equal(manifest.status, 'generated-awaiting-owner-listening')
  assert(manifest.clips.every(c => c.region === 'Mexico City, Mexico' && c.file.startsWith('audio/')))
  const html = spanishAudioReviewHtml(manifest)
  assert.equal((html.match(/<audio controls/g) ?? []).length, 4)
  assert.match(html, /llave — Pamela, Mexico City, Mexico/)
  assert.match(html, /Word or meaning/)
})

test('review refuses missing, duplicate, wrong-language and mislabeled voice audio', () => {
  for (const mutate of [
    f => f.deliveries.pop(),
    f => { f.deliveries[1] = f.deliveries[0] },
    f => { f.originals[0].request.language_code = 'ja' },
    f => { f.deliveries[0].voiceId = 'different-voice' },
    f => { f.deliveries[0].request.language_code = 'ja' },
    f => { f.deliveries[0].planIdentity = 'different-plan' },
    f => { f.deliveries[0].sourceRecordSha256 = 'different-original-record' },
    f => { f.deliveries[0].profile.rate = 22050 },
    f => { f.deliveries[0].profile.maxBoostDb = 20 },
    f => { f.originals[0].planIdentity = 'different-plan' },
    f => { f.deliveries[0].after.truePeakDbtp = 0 },
  ]) {
    const data = fixture(); mutate(data)
    assert.throws(() => audioReviewManifest(data.plan, data.originals, data.deliveries))
  }
})

test('quieter constrained clips stay explicit, while unflagged level errors are refused', () => {
  const { plan, originals, deliveries } = fixture()
  deliveries[0].after.integratedLufs = -25
  assert.throws(() => audioReviewManifest(plan, originals, deliveries), /playback profile/)
  deliveries[0].targetLimited = true
  deliveries[0].limitingReasons = ['maximum_gain']
  const manifest = audioReviewManifest(plan, originals, deliveries)
  assert.deepEqual(manifest.clips[0].limitingReasons, ['maximum_gain'])
  assert.match(spanishAudioReviewHtml(manifest), /Kept quieter/)
})
