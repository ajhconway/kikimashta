/** Owner-selected Travel level 4 replacement and eight regional voices (#207). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, realpath, lstat } from 'node:fs/promises'
import { resolve, relative, isAbsolute, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { generationPlan, generateCards } from './generate-elevenlabs-cards.mjs'
import { loadElevenLabsKey } from './elevenlabs-key.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const digest = value => hash(JSON.stringify(value))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function spanishTravelLevel4ReplacementPlan(replacementText, registry, config, approval, draftText) {
  const replacement = JSON.parse(replacementText)
  if (replacement.issue !== 207 || replacement.pack !== 'es-419-travel-4' || replacement.status !== 'generation-authorized-media-review-pending' ||
      replacement.baseDraftSha256 !== hash(draftText) || replacement.retiredItemId !== 'es-419-travel-bandage' ||
      replacement.ownerSelection !== 'Enchufe — power outlet' || replacement.voices !== 8 || replacement.recordings !== 8 ||
      approval.replacementSha256 !== hash(replacementText) || approval.baseDraftSha256 !== hash(draftText) || approval.ownerSelection !== replacement.ownerSelection) throw new Error('The reviewed replacement authorization changed.')
  if (replacement.item?.id !== 'es-419-travel-power-outlet' || replacement.item.text !== 'enchufe' || replacement.item.meaning !== 'Power outlet' ||
      config.issue !== 207 || config.language !== 'es-419' || config.voices.length !== 8 || !same(config.voices, registry.voices) ||
      digest(config) !== '3c0c103bd80f40b4371e70ecde2db2c51d574955432dbb1abcdd36753d548f94') throw new Error('Expected the selected replacement and original regional voice configuration.')
  const { id, text, meaning } = replacement.item
  const items = [{ id, text, spelling: text, meaning }]
  if (approval.issue !== 207 || approval.pack !== 'es-419-travel-4-replacement' || approval.status !== 'generation-authorized-listening-pending' ||
      digest(items) !== approval.itemsSha256 || digest(config.voices) !== approval.voicesSha256 || !same(items, approval.items)) throw new Error('Approved replacement spoken text or identity changed.')
  const plan = generationPlan(items, config)
  if (plan.items.length !== 1 || plan.expectedClips !== 8 || plan.characters !== 56 || approval.expectedClips !== 8 || approval.characters !== 56) throw new Error('Approved replacement generation bounds changed.')
  return plan
}

export async function loadSpanishTravelLevel4ReplacementPlan(root = process.cwd()) {
  const [replacementText, registryText, configText, approvalText, draftText] = await Promise.all([
    'content/spanish-travel-4/word-replacement.json', 'content/es-419-voices.json', 'content/spanish-travel-4/audio-config.json',
    'content/spanish-travel-4/replacement-audio-approval.json', 'content/spanish-travel-4/draft.json',
  ].map(path => readFile(resolve(root, path), 'utf8')))
  const approval = JSON.parse(approvalText)
  return { plan: spanishTravelLevel4ReplacementPlan(replacementText, JSON.parse(registryText), JSON.parse(configText), approval, draftText), approval }
}

export async function generateSpanishTravelLevel4ReplacementPack({ root = process.cwd(), output, apiKey, generate = generateCards }) {
  const { plan, approval } = await loadSpanishTravelLevel4ReplacementPlan(root)
  if (typeof output !== 'string' || !output.trim()) throw new Error('Choose an originals output directory.')
  const destination = resolve(root, output), privateRoot = resolve(root, 'artifacts/generated-originals')
  const within = relative(privateRoot, destination)
  if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Keep originals under artifacts/generated-originals/.')
  let ancestor = destination
  for (;;) {
    try {
      await lstat(ancestor)
      // lstat also detects dangling links: never skip one while finding a real ancestor.
      let actual
      try { actual = resolve(await realpath(ancestor), relative(ancestor, destination)) }
      catch { throw new Error('Keep originals under artifacts/generated-originals/.') }
      const allowed = relative(resolve(await realpath(root), 'artifacts/generated-originals'), actual)
      if (!allowed || allowed.startsWith('..') || isAbsolute(allowed)) throw new Error('Keep originals under artifacts/generated-originals/.')
      break
    } catch (error) {
      if (error.code !== 'ENOENT' || ancestor === dirname(ancestor)) throw error
      ancestor = dirname(ancestor)
    }
  }
  return generate({ plan, output: destination, apiKey, concurrency: 2, budget: 100,
    beforeRequests: async () => {
      const path = resolve(destination, 'approval.json')
      let saved
      try { saved = JSON.parse(await readFile(path, 'utf8')) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      if (saved && !same(saved, approval)) throw new Error('Saved Travel level 4 approval changed.')
      if (!saved) await writeFile(path, JSON.stringify(approval, null, 2) + '\n', { flag: 'wx' })
    },
  })
}

async function main() {
  const { values } = parseArgs({ options: { output: { type: 'string' }, 'dry-run': { type: 'boolean' } } })
  const { plan } = await loadSpanishTravelLevel4ReplacementPlan()
  if (values['dry-run']) {
    console.log(JSON.stringify({ words: 1, voices: plan.voices.map(v => v.voice), clips: plan.expectedClips, characters: plan.characters, budget: 100 }, null, 2)); return
  }
  console.log(JSON.stringify(await generateSpanishTravelLevel4ReplacementPack({ output: values.output, apiKey: loadElevenLabsKey() })))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
