/** Exact reviewed Travel level 4 words and eight regional voices (#207). */
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

export function spanishTravelLevel4Plan(draftText, registry, config, approval, authorizationText) {
  const draft = JSON.parse(draftText), authorization = JSON.parse(authorizationText)
  if (authorization.issue !== 207 || authorization.status !== 'generation-authorized-media-review-pending' ||
      authorization.draft !== 'content/spanish-travel-4/draft.json' || authorization.draftSha256 !== hash(draftText) ||
      authorization.words !== 36 || authorization.voices !== 8 || authorization.recordings !== 288 ||
      authorization.newPictures !== 35 || authorization.approvedReuses !== 1 ||
      approval.draftSha256 !== authorization.draftSha256 || approval.generationApprovalSha256 !== hash(authorizationText) ||
      approval.ownerMessage !== authorization.ownerMessage) throw new Error('The reviewed Travel level 4 draft authorization changed.')
  if (draft.issue !== 207 || draft.id !== 'es-419-travel-4' || draft.language !== 'es-419' || draft.items.length !== 36 ||
      new Set(draft.items.map(i => i.id)).size !== 36 || config.issue !== 207 || config.language !== 'es-419' || config.voices.length !== 8 ||
      !same(config.voices, registry.voices) || draft.voiceRegistrySha256 !== hash(JSON.stringify(registry, null, 2) + '\n')) throw new Error('Expected the approved Travel level 4 words and regional voices.')
  const items = draft.items.map(({ id, text, meaning }) => ({ id, text, spelling: text, meaning }))
  if (approval.issue !== 207 || approval.pack !== 'es-419-travel-4' || approval.status !== 'generation-authorized-listening-pending' ||
      digest(config) !== '3c0c103bd80f40b4371e70ecde2db2c51d574955432dbb1abcdd36753d548f94' || digest(items) !== approval.itemsSha256 || digest(config.voices) !== approval.voicesSha256 || !same(items, approval.items)) throw new Error('Approved Travel level 4 spoken text or identity changed.')
  const plan = generationPlan(items, config)
  if (plan.items.length !== 36 || plan.expectedClips !== 288 || plan.characters !== 2600 ||
      plan.expectedClips !== approval.expectedClips || plan.characters !== approval.characters) throw new Error('Approved Travel level 4 generation bounds changed.')
  return plan
}

export async function loadSpanishTravelLevel4Plan(root = process.cwd()) {
  const [draftText, registryText, configText, approvalText, authorizationText] = await Promise.all([
    'content/spanish-travel-4/draft.json', 'content/es-419-voices.json', 'content/spanish-travel-4/audio-config.json',
    'content/spanish-travel-4/audio-approval.json', 'content/spanish-travel-4/generation-approval.json',
  ].map(path => readFile(resolve(root, path), 'utf8')))
  const approval = JSON.parse(approvalText)
  return { plan: spanishTravelLevel4Plan(draftText, JSON.parse(registryText), JSON.parse(configText), approval, authorizationText), approval }
}

export async function generateSpanishTravelLevel4Pack({ root = process.cwd(), output, apiKey, generate = generateCards }) {
  const { plan, approval } = await loadSpanishTravelLevel4Plan(root)
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
  return generate({ plan, output: destination, apiKey, concurrency: 2, budget: 2800,
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
  const { plan } = await loadSpanishTravelLevel4Plan()
  if (values['dry-run']) {
    console.log(JSON.stringify({ words: 36, voices: plan.voices.map(v => v.voice), clips: plan.expectedClips, characters: plan.characters, budget: 2800 }, null, 2)); return
  }
  console.log(JSON.stringify(await generateSpanishTravelLevel4Pack({ output: values.output, apiKey: loadElevenLabsKey() })))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
