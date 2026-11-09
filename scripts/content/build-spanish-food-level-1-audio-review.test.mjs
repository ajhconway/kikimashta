import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { loadSpanishFoodLevel1Plan } from './generate-spanish-food-level-1.mjs'
import { foodAudioReviewManifest, foodAudioReviewHtml, validateFoodAudioReviewManifest, buildSpanishFoodLevel1AudioReview } from './build-spanish-food-level-1-audio-review.mjs'
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
    after: { integratedLufs: -22, truePeakDbtp: -3 }, decodedFrames: 44100, deliverySha256: '2'.repeat(64), deliveryBytes: 100, targetLimited: false, gainDb: 0
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
