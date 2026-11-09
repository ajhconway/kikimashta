import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import config from '../../content/elevenlabs-voices.json' with { type: 'json' }
import { cardItems, generationPlan } from './generate-elevenlabs-cards.mjs'
import { stageCards } from './stage-elevenlabs-cards.mjs'
const hash = data => createHash('sha256').update(data).digest('hex')
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kikimashta-eight-voice-stage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = join(root, 'originals')
  const delivery = join(root, 'delivery')
  const item = { id: 'ja-cat', language: 'ja-JP', text: '猫', reading: 'ねこ', meaning: 'Cat', audio: [{ src: 'audio/old.mp3', voice: 'old' }] }
  const catalog = { language: 'ja-JP', items: [item] }
  const starter = { id: 'starter', language: 'ja-JP', items: [{ ...item, label: 'Cat', theme: 'animals' }] }
  const plan = generationPlan(cardItems(catalog, starter), config)
  const identity = hash(JSON.stringify(plan))
  for (const path of ['content/catalog', 'public', 'originals', 'delivery']) await mkdir(join(root, path), { recursive: true })
  await writeFile(join(root, 'content/catalog/ja.json'), JSON.stringify(catalog))
  await writeFile(join(root, 'content/ja.json'), JSON.stringify(starter))
  await writeFile(join(root, 'content/elevenlabs-voices.json'), JSON.stringify(config))
  await writeFile(join(root, 'content/catalog/review-overrides.json'), '{}')
  await writeFile(join(input, 'plan.json'), JSON.stringify({ ...plan, identity }))
  const records = []
  for (const voice of config.voices) {
    const originalFile = `originals/${voice.voice}/ja-cat.mp3`
    const file = `${voice.voice}/ja-cat.mp3`
    const original = Buffer.from('ID3 original ' + voice.voice)
    const mp3 = Buffer.from('ID3 delivery ' + voice.voice)
    await mkdir(join(input, 'originals', voice.voice), { recursive: true })
    await mkdir(join(delivery, voice.voice), { recursive: true })
    await writeFile(join(input, originalFile), original)
    await writeFile(join(delivery, file), mp3)
    records.push({ ...plan.items[0], voice: voice.voice, voiceId: voice.id, file, originalFile, planIdentity: identity,
      sha256: hash(original), originalSha256: hash(original), bytes: original.length,
      deliverySha256: hash(mp3), deliveryBytes: mp3.length, gainDb: 1,
      decodedFrames: 44100, after: { integratedLufs: -22, truePeakDbtp: -4 }, targetLimited: false, limitingReasons: [],
      profile: { targetLufs: -22, truePeakCeilingDbtp: -2, dualMono: true } })
  }
  const save = () => writeFile(join(delivery, 'deliveries.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n')
  await save()
  return { root, input, delivery, records, save, catalog, starter }
}
test('stages eight verified voices while preserving card IDs, readings and unrelated metadata', async t => {
  const f = await fixture(t)
  assert.deepEqual(await stageCards(f), { cards: 1, recordings: 8, targetLimited: 0 })
  const catalog = JSON.parse(await readFile(join(f.root, 'content/catalog/ja.json'), 'utf8'))
  assert.deepEqual({ ...catalog.items[0], audio: f.catalog.items[0].audio }, f.catalog.items[0])
  assert.deepEqual(catalog.items[0].audio.map(a => a.voiceName), config.voices.map(v => v.name))
  const starter = JSON.parse(await readFile(join(f.root, 'content/ja.json'), 'utf8'))
  assert.equal(starter.id, 'starter')
  assert.equal(starter.items[0].id, 'ja-cat')
  assert.equal(starter.items[0].theme, 'animals')
  for (const recording of catalog.items[0].audio) await access(join(f.root, 'public', recording.src))
})

test('staging excludes retired source entries without rewriting their identities or historical audio metadata', async t => {
  const f = await fixture(t)
  const retired = { ...f.catalog.items[0], id: 'ja-removed', text: '～形', reading: 'けい', meaning: 'Form' }
  const starterOnly = { ...f.starter.items[0], id: 'ja-retired-starter' }
  f.catalog.items.push(retired)
  f.starter.items.push(starterOnly)
  await writeFile(join(f.root, 'content/catalog/ja.json'), JSON.stringify(f.catalog))
  await writeFile(join(f.root, 'content/ja.json'), JSON.stringify(f.starter))
  await writeFile(join(f.root, 'content/catalog/review-overrides.json'), JSON.stringify({ [retired.id]: { removalReason: 'Owner removed this entry.' } }))
  assert.deepEqual(await stageCards(f), { cards: 1, recordings: 8, targetLimited: 0 })
  const catalog = JSON.parse(await readFile(join(f.root, 'content/catalog/ja.json')))
  const starter = JSON.parse(await readFile(join(f.root, 'content/ja.json')))
  assert.deepEqual(catalog.items[1], retired)
  assert.deepEqual(starter.items[1], starterOnly)
  const provenance = JSON.parse(await readFile(join(f.root, 'content/audio/elevenlabs/otani.json')))
  assert.deepEqual(provenance.clips.map(clip => clip.id), ['ja-cat'])
  for (const id of [retired.id, starterOnly.id]) await assert.rejects(access(join(f.root, `public/audio/elevenlabs-v1/otani/${id}.mp3`)), { code: 'ENOENT' })
})

test('rejects a historical full-selection plan rather than reinterpreting its identity', async t => {
  const f = await fixture(t)
  f.catalog.items.push({ ...f.catalog.items[0], id: 'ja-added' })
  await writeFile(join(f.root, 'content/catalog/ja.json'), JSON.stringify(f.catalog))
  await assert.rejects(stageCards(f), /use a new generation plan/)
  await assert.rejects(access(join(f.root, 'public/audio')), { code: 'ENOENT' })
})
for (const [label, mutate, pattern] of [
  ['duplicate delivery', f => { f.records[7] = f.records[0] }, /identity/],
  ['missing delivery', f => { f.records.pop() }, /Expected/],
  ['wrong reading', f => { f.records[7].text = 'いぬ' }, /identity/],
  ['wrong file path', f => { f.records[7].file = '../escape.mp3' }, /identity/],
  ['wrong delivery hash', f => { f.records[7].deliverySha256 = '0'.repeat(64) }, /hash/],
  ['unsafe peak', f => { f.records[7].after.truePeakDbtp = -0.1 }, /volume/],
  ['unmatched loudness', f => { f.records[7].after.integratedLufs = -30 }, /volume/],
  ['loud limited recording', f => { f.records[7].after.integratedLufs = -10; f.records[7].targetLimited = true; f.records[7].limitingReasons = ['true_peak_headroom'] }, /volume/],
  ['nonboolean limitation', f => { f.records[7].targetLimited = 'yes' }, /volume/],
  ['unexplained limitation', f => { f.records[7].after.integratedLufs = -25; f.records[7].targetLimited = true }, /volume/],
  ['different profile', f => { f.records[7].profile.targetLufs = -20 }, /volume/],
]) test(`rejects ${label} before writing any production media or changing a bank`, async t => {
  const f = await fixture(t)
  mutate(f)
  await f.save()
  await assert.rejects(stageCards(f), pattern)
  await assert.rejects(access(join(f.root, 'public/audio')), { code: 'ENOENT' })
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'content/catalog/ja.json'), 'utf8')), f.catalog)
})

test('allows explicitly flagged quieter peak-limited recordings and retains their review reason', async t => {
  const f = await fixture(t)
  Object.assign(f.records[7], { targetLimited: true, limitingReasons: ['true_peak_headroom'], after: { integratedLufs: -24, truePeakDbtp: -2.2 } })
  await f.save()
  assert.equal((await stageCards(f)).targetLimited, 1)
  const provenance = JSON.parse(await readFile(join(f.root, 'content/elevenlabs-audio-provenance.json'), 'utf8'))
  assert.deepEqual(provenance.targetLimited, [{ id: 'ja-cat', voice: 'itsuki', loudness: -24, reasons: ['true_peak_headroom'] }])
})
