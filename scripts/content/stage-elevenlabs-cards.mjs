/** Preflight all eight-voice deliveries, then replace card audio arrays (#86). */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { cardItems, generationPlan } from './generate-elevenlabs-cards.mjs'

const hash = data => createHash('sha256').update(data).digest('hex')
export async function stageCards({ root = process.cwd(), input, delivery }) {
  const [catalog, starter, config, snapshot] = await Promise.all([
    'content/catalog/ja.json', 'content/ja.json', 'content/elevenlabs-voices.json',
  ].map(async path => JSON.parse(await readFile(join(root, path), 'utf8'))).concat([readFile(join(input, 'plan.json'), 'utf8').then(JSON.parse)]))
  const plan = generationPlan(cardItems(catalog, starter), config)
  if (hash(JSON.stringify(plan)) !== snapshot.identity) throw new Error('Generation plan no longer matches current cards and voices.')
  const records = (await readFile(join(delivery, 'deliveries.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)
  if (records.length !== plan.expectedClips) throw new Error(`Expected ${plan.expectedClips} verified deliveries, received ${records.length}.`)
  const items = new Map(plan.items.map(i => [i.id, i]))
  const voices = new Map(plan.voices.map(v => [v.voice, v]))
  const seen = new Set()
  const files = []
  for (const record of records) {
    const item = items.get(record.id)
    const voice = voices.get(record.voice)
    const key = `${record.voice}:${record.id}`
    if (!item || !voice || seen.has(key) || record.planIdentity !== snapshot.identity || record.voiceId !== voice.id ||
        record.text !== item.text || record.spelling !== item.spelling || record.meaning !== item.meaning ||
        record.file !== `${voice.voice}/${item.id}.mp3` || record.originalFile !== `originals/${voice.voice}/${item.id}.mp3`) throw new Error('Delivery identity mismatch: ' + key)
    seen.add(key)
    const reasons = ['true_peak_headroom', 'maximum_gain', 'encoded_loudness_resolution']
    const limited = record.targetLimited === true && record.after?.integratedLufs < -22.25 &&
      Array.isArray(record.limitingReasons) && record.limitingReasons.length > 0 && record.limitingReasons.every(reason => reasons.includes(reason))
    if (typeof record.targetLimited !== 'boolean' || (record.targetLimited && !limited) ||
        record.profile?.targetLufs !== -22 || record.profile?.truePeakCeilingDbtp !== -2 || record.profile?.dualMono !== true ||
        !Number.isFinite(record.after?.integratedLufs) || !Number.isFinite(record.after?.truePeakDbtp) || record.after.truePeakDbtp > -2 ||
        (!limited && Math.abs(record.after.integratedLufs + 22) > 0.25) || !Number.isFinite(record.gainDb) || record.gainDb > 9 ||
        !Number.isInteger(record.decodedFrames) || record.decodedFrames < 4410 || record.decodedFrames > 44100 * 8) throw new Error('Unverified volume or duration: ' + key)
    const [original, mp3] = await Promise.all([readFile(join(input, record.originalFile)), readFile(join(delivery, record.file))])
    if (hash(original) !== record.originalSha256 || hash(original) !== record.sha256 || original.length !== record.bytes ||
        hash(mp3) !== record.deliverySha256 || mp3.length !== record.deliveryBytes) throw new Error('Delivery hash mismatch: ' + key)
    files.push({ record, source: join(delivery, record.file), relative: `audio/elevenlabs-v1/${record.file}` })
  }
  const audioFor = item => plan.voices.map(voice => ({ src: `audio/elevenlabs-v1/${voice.voice}/${item.id}.mp3`, source: 'synthesized', voice: voice.voice, voiceName: voice.name }))
  const updatedCatalog = { ...catalog, items: catalog.items.map(item => ({ ...item, audio: audioFor(item) })) }
  const updatedStarter = { ...starter, items: starter.items.map(item => ({ ...item, audio: audioFor(item) })) }
  // No writes before every identity, source hash, delivery hash, level and duration passes.
  for (const file of files) {
    const target = join(root, 'public', file.relative)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(file.source, target)
  }
  const provenanceDirectory = join(root, 'content/audio/elevenlabs')
  await mkdir(provenanceDirectory, { recursive: true })
  for (const voice of plan.voices) {
    const clips = files.filter(file => file.record.voice === voice.voice).map(({ record, relative }) => ({ ...record, deliverySrc: relative }))
    await writeFile(join(provenanceDirectory, voice.voice + '.json'), JSON.stringify({ issue: 86, provider: plan.provider, model: plan.model, voice,
      generationIdentity: snapshot.identity, language: plan.language, normalization: config.normalization, clips }, null, 2) + '\n')
  }
  const limited = records.filter(r => r.targetLimited).map(r => ({ id: r.id, voice: r.voice, loudness: r.after.integratedLufs, reasons: r.limitingReasons }))
  const summary = { issue: 86, provider: plan.provider, model: plan.model, language: plan.language, generationIdentity: snapshot.identity,
    createdAt: new Date().toISOString(), cards: plan.items.length, recordings: records.length, inputCharacters: plan.characters,
    normalization: config.normalization,
    processing: 'Provider-original MP3s preserved locally in the generation artifact. Delivery MP3s use constant gain and are remeasured after encoding; timing is preserved. True-peak-limited clips remain quieter and are listed for listening review.',
    voices: plan.voices.map(v => ({ ...v, provenance: `content/audio/elevenlabs/${v.voice}.json` })), targetLimited: limited,
    review: 'Voice selection and loudness profile approved through audition. New word pronunciation and regional accents require listening review on the iPhone.' }
  await writeFile(join(root, 'content/elevenlabs-audio-provenance.json'), JSON.stringify(summary, null, 2) + '\n')
  await writeFile(join(root, 'content/catalog/ja.json'), JSON.stringify(updatedCatalog, null, 2) + '\n')
  await writeFile(join(root, 'content/ja.json'), JSON.stringify(updatedStarter, null, 2) + '\n')
  return { cards: plan.items.length, recordings: records.length, targetLimited: limited.length }
}
async function main() {
  const { values } = parseArgs({ options: { input: { type: 'string' }, delivery: { type: 'string' } } })
  if (!values.input || !values.delivery) throw new Error('Choose --input provider originals and --delivery normalized batch directories.')
  console.log(JSON.stringify(await stageCards({ input: resolve(values.input), delivery: resolve(values.delivery) })))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
