/** Approved 36-word, eight-voice regional Spanish batch level 3 (#174). No activation. */
import { createHash } from 'node:crypto'
import { readFile, writeFile, realpath } from 'node:fs/promises'
import { resolve, relative, isAbsolute, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { generationPlan, generateCards } from './generate-elevenlabs-cards.mjs'
import { loadElevenLabsKey } from './elevenlabs-key.mjs'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function spanishTravelLevel3Plan(bank, config, approval) {
  const items = bank.items.map(({ id, text, meaning }) => ({ id, text, spelling: text, meaning }))
  if (bank.language !== 'es-419' || bank.id !== 'es-419-travel-3' || bank.generation?.authorized !== true || items.length !== 36 ||
      config.language !== 'es-419' || config.issue !== 174 || config.voices.length !== 8 ||
      config.voices.some(v => !['es-MX', 'es-CO', 'es-AR', 'es-PR'].includes(v.locale)) ||
      config.voices.some(v => ['cesar', 'arath', 'eduardo'].includes(v.voice))) throw new Error('Expected the approved Spanish travel selection.')
  if (approval.issue !== 174 || approval.status !== 'generation-authorized-listening-pending' ||
      hash(items) !== approval.itemsSha256 || hash(config.voices) !== approval.voicesSha256 ||
      JSON.stringify(items) !== JSON.stringify(approval.items)) throw new Error('Approved Spanish text or voices changed.')
  const plan = generationPlan(items, config)
  if (plan.expectedClips !== 288 || plan.characters !== 2336) throw new Error('Expected the approved 288-clip level 3 batch.')
  if (plan.expectedClips !== approval.expectedClips || plan.characters !== approval.characters) throw new Error('Approved generation bounds changed.')
  return plan
}

export async function loadSpanishTravelLevel3Plan(root = process.cwd()) {
  const [bank, config, approval] = await Promise.all([
    'content/spanish-travel-3/draft.json', 'content/spanish-travel-3/audio-config.json', 'content/spanish-travel-3/audio-approval.json',
  ].map(async path => JSON.parse(await readFile(resolve(root, path), 'utf8'))))
  return { plan: spanishTravelLevel3Plan(bank, config, approval), approval }
}

export async function generateSpanishTravelLevel3Pack({ root = process.cwd(), output, apiKey, generate = generateCards }) {
  const { plan, approval } = await loadSpanishTravelLevel3Plan(root)
  if (typeof output !== 'string' || !output.trim()) throw new Error('Choose an originals output directory.')
  const destination = resolve(root, output)
  const within = relative(resolve(root, 'artifacts/generated-originals'), destination)
  if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Keep originals under artifacts/generated-originals/.')
  // Resolve existing ancestors as well: a lexically private path may traverse a
  // symlink into public media or outside this workspace.
  let ancestor = destination
  for (;;) {
    try {
      const actual = resolve(await realpath(ancestor), relative(ancestor, destination))
      const allowed = relative(resolve(await realpath(root), 'artifacts/generated-originals'), actual)
      if (!allowed || allowed.startsWith('..') || isAbsolute(allowed)) throw new Error('Keep originals under artifacts/generated-originals/.')
      break
    } catch (error) {
      if (error.code !== 'ENOENT' || ancestor === dirname(ancestor)) throw error
      ancestor = dirname(ancestor)
    }
  }
  return generate({ plan, output: destination, apiKey, concurrency: 2, budget: 2800,
    beforeRequests: async () => {
      const path = resolve(destination, 'approval.json')
      let saved
      try { saved = JSON.parse(await readFile(path, 'utf8')) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      if (saved && JSON.stringify(saved) !== JSON.stringify(approval)) throw new Error('Saved approval changed.')
      if (!saved) await writeFile(path, JSON.stringify(approval, null, 2) + '\n', { flag: 'wx' })
    },
  })
}

async function main() {
  const { values } = parseArgs({ options: { output: { type: 'string' }, 'dry-run': { type: 'boolean' } } })
  const { plan } = await loadSpanishTravelLevel3Plan()
  if (values['dry-run']) {
    console.log(JSON.stringify({ words: plan.items.length, voices: plan.voices, clips: plan.expectedClips, characters: plan.characters, budget: 2800 }, null, 2))
    return
  }
  console.log(JSON.stringify(await generateSpanishTravelLevel3Pack({ output: values.output, apiKey: loadElevenLabsKey() })))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
