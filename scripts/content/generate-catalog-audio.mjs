/** Pregenerate both chosen voices for one source level; retain partial successes (#27). */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { MODEL, INSTRUCTIONS, synthesize, wavFromPcm, levelAudio, encode } from './audition-openai.mjs'

export const VOICES = ['marin', 'cedar']
export function entriesForLevel(catalog, level) {
  if (!Number.isInteger(level) || level < 1 || level > 5) throw new Error('Choose source level 1–5.')
  const entries = catalog.items.filter(item => item.sourceLevel === level && !item.reuseStarterAssets)
  const ids = new Set()
  for (const item of entries) {
    if (!/^ja-v-[a-f0-9]{12}$/.test(item.id) || !item.reading || !item.text || !item.meaning || ids.has(item.id)) throw new Error('Invalid catalog entry: ' + item.id)
    ids.add(item.id)
  }
  return entries
}
export function requestsForLevel(catalog, level, selection) {
  const entries = entriesForLevel(catalog, level)
  if (selection === undefined) return entries.flatMap(item => VOICES.map(voice => ({ item, voice })))
  if (!Array.isArray(selection)) throw new Error('Repair selection must be an array.')
  const seen = new Set()
  const requests = []
  for (const repair of selection) {
    const matches = catalog.items.filter(item => item.id === repair?.id)
    if (matches.length !== 1 || matches[0].reuseStarterAssets || !VOICES.includes(repair?.voice)) throw new Error('Invalid repair selection: unknown item, reused asset, or voice.')
    const item = matches[0]
    // Validate every selected level before any directory creation or paid request.
    entriesForLevel(catalog, item.sourceLevel)
    const key = `${item.id}:${repair.voice}`
    if (seen.has(key)) throw new Error('Duplicate repair selection: ' + key)
    seen.add(key)
    if (item.sourceLevel === level) requests.push({ item, voice: repair.voice })
  }
  return requests
}
export function instructionsFor(item) {
  return INSTRUCTIONS + ` Vocabulary context (do not read this metadata aloud): written form ${item.text}; pronunciation ${item.reading}; intended meaning ${item.meaning}. Speak only the pronunciation, once. Use the pitch accent appropriate to that word and meaning.`
}

export async function generateLevel({ catalog, level, output, apiKey, selection, speak = synthesize, encodeFile = encode }) {
  const requests = requestsForLevel(catalog, level, selection)
  await mkdir(output, { recursive: false })
  const manifest = { provider: 'OpenAI', model: MODEL, language: catalog.language, sourceLevel: level,
    createdAt: new Date().toISOString(), sourceRevision: process.env.GITHUB_SHA ?? null,
    instructions: INSTRUCTIONS,
    contextTemplate: 'Written form, reading, and intended meaning are supplied as silent metadata via instructionsFor; only the reading is spoken.',
    processing: 'Original mono 24kHz PCM preserved as WAV; active-sample RMS target -22 dBFS, max boost 9 dB, pre-MP3 sample peak ceiling -4 dBFS; 120ms lead/240ms tail padding; no trimming or pitch/time alteration.',
    review: 'Generated speech; pronunciation and pitch accent require listening review.',
    expectedClips: requests.length, clips: [], failures: [] }
  await writeFile(join(output, 'provenance.json'), JSON.stringify(manifest, null, 2) + '\n')
  for (const { item, voice } of requests) {
    try {
      console.log(`Generating ${voice}: ${item.id} (${item.reading})`)
      const instructions = instructionsFor(item)
      const result = await speak(apiKey, voice, item.reading, { instructions, maxOutputTokens: 256, maxSeconds: 8 })
      const wav = wavFromPcm(result.pcm)
      const stem = `${voice}-${item.id}`
      await writeFile(join(output, stem + '.wav'), wav, { flag: 'wx' })
      const levels = levelAudio(result.pcm)
      encodeFile(join(output, stem + '.wav'), join(output, stem + '.mp3'), levels.gainDb)
      const mp3 = await readFile(join(output, stem + '.mp3'))
      manifest.clips.push({ id: item.id, voice, spelling: item.text, text: item.reading, meaning: item.meaning,
        instructions, transcript: result.transcript, usage: result.usage,
        file: stem + '.mp3', original: stem + '.wav',
        originalSha256: createHash('sha256').update(wav).digest('hex'),
        deliverySha256: createHash('sha256').update(mp3).digest('hex'), deliveryBytes: mp3.length,
        durationSeconds: result.pcm.length / 48000, ...levels })
    } catch (error) {
      manifest.failures.push({ id: item.id, voice, error: error.message })
      console.error(`Failed ${voice}: ${item.id}. Retaining other results; no automatic retry.`)
    }
    await writeFile(join(output, 'provenance.json'), JSON.stringify(manifest, null, 2) + '\n')
  }
  return manifest
}
async function main() {
  const { values } = parseArgs({ options: { level: { type: 'string' }, output: { type: 'string' }, 'dry-run': { type: 'boolean' } } })
  const catalog = JSON.parse(await readFile('content/catalog/ja.json', 'utf8'))
  const level = Number(values.level)
  const request = JSON.parse(await readFile('content/audio-generation-request.json', 'utf8'))
  const selection = request.repairs
  const requests = requestsForLevel(catalog, level, selection)
  if (values['dry-run']) { console.log(JSON.stringify({ level, requests: requests.length, reused: catalog.items.filter(x => x.sourceLevel === level && x.reuseStarterAssets).length })); return }
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY is required.')
  const output = resolve(values.output ?? `artifacts/catalog-audio-level-${level}`)
  await mkdir(resolve(output, '..'), { recursive: true })
  const result = await generateLevel({ catalog, level, output, selection, apiKey: process.env.OPENAI_API_KEY.trim() })
  console.log(`Generated ${result.clips.length}/${result.expectedClips}; failures: ${result.failures.length}`)
  if (result.failures.length) process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
