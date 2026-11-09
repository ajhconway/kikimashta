/** Exact approved words and contextual parts for Basic Spanish level 1 (#191). */
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

export function spanishBasicAudioItems(draft) {
  const words = draft.items.map(({ id, text, meaning }) => ({ id, text, spelling: text, meaning, role: 'word', targetItemId: id }))
  const contexts = draft.contexts.flatMap(context => ['sentence', 'question'].map(role => ({
    id: `${context.id}-${role}`, text: context[role].text, spelling: context[role].text, meaning: context[role].meaning,
    role, contextId: context.id, targetItemId: context.targetItemId, contextRevision: context.revision,
  })))
  return [...words, ...contexts]
}

export function spanishBasicLevel1Plan(draftText, registry, config, approval, authorizationText) {
  const draft = JSON.parse(draftText), authorization = JSON.parse(authorizationText)
  if (authorization.issue !== 191 || authorization.status !== 'generation-authorized-media-review-pending' ||
      authorization.draft !== 'content/spanish-basic-1/draft.json' || authorization.draftSha256 !== hash(draftText) ||
      authorization.words !== 24 || authorization.contexts !== 9 || authorization.voices !== 8 || authorization.recordings !== 336 ||
      approval.draftSha256 !== authorization.draftSha256 || approval.generationApprovalSha256 !== hash(authorizationText) ||
      approval.ownerMessage !== authorization.ownerMessage) throw new Error('The reviewed Basic Spanish draft authorization changed.')
  if (draft.issue !== 191 || draft.id !== 'es-419-basic-1' || draft.language !== 'es-419' || draft.mediaPlan?.generationAuthorized !== true ||
      draft.items.length !== 24 || draft.contexts.length !== 9 || new Set(draft.contexts.map(c => c.id)).size !== 9 ||
      draft.contexts.some(c => !Number.isSafeInteger(c.revision) || c.revision < 1 || !draft.items.some(i => i.id === c.targetItemId && i.practice.kind === 'contextual')) ||
      config.issue !== 191 || config.language !== 'es-419' || config.voices.length !== 8 ||
      !same(config.voices, registry.voices) || !same(config.voices, draft.voices)) throw new Error('Expected the approved Basic Spanish words, contexts and regional voices.')
  const items = spanishBasicAudioItems(draft)
  if (approval.issue !== 191 || approval.pack !== 'es-419-basic-1' || approval.status !== 'generation-authorized-listening-pending' ||
      digest(items) !== approval.itemsSha256 || digest(config.voices) !== approval.voicesSha256 || !same(items, approval.items)) throw new Error('Approved Basic Spanish spoken text or identity changed.')
  const plan = generationPlan(items, config)
  if (plan.items.length !== 42 || plan.expectedClips !== 336 || plan.characters !== 4760 ||
      plan.expectedClips !== approval.expectedClips || plan.characters !== approval.characters) throw new Error('Approved Basic Spanish generation bounds changed.')
  return plan
}

export async function loadSpanishBasicLevel1Plan(root = process.cwd()) {
  const [draftText, registryText, configText, approvalText, authorizationText] = await Promise.all([
    'content/spanish-basic-1/draft.json', 'content/es-419-voices.json', 'content/spanish-basic-1/audio-config.json',
    'content/spanish-basic-1/audio-approval.json', 'content/spanish-basic-1/generation-approval.json',
  ].map(path => readFile(resolve(root, path), 'utf8')))
  const approval = JSON.parse(approvalText)
  return { plan: spanishBasicLevel1Plan(draftText, JSON.parse(registryText), JSON.parse(configText), approval, authorizationText), approval }
}

export async function generateSpanishBasicLevel1({ root = process.cwd(), output, apiKey, generate = generateCards }) {
  const { plan, approval } = await loadSpanishBasicLevel1Plan(root)
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
  return generate({ plan, output: destination, apiKey, concurrency: 2, budget: 5600,
    beforeRequests: async () => {
      const path = resolve(destination, 'approval.json')
      let saved
      try { saved = JSON.parse(await readFile(path, 'utf8')) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      if (saved && !same(saved, approval)) throw new Error('Saved Basic Spanish approval changed.')
      if (!saved) await writeFile(path, JSON.stringify(approval, null, 2) + '\n', { flag: 'wx' })
    },
  })
}

async function main() {
  const { values } = parseArgs({ options: { output: { type: 'string' }, 'dry-run': { type: 'boolean' } } })
  const { plan } = await loadSpanishBasicLevel1Plan()
  if (values['dry-run']) {
    console.log(JSON.stringify({ words: 24, contexts: 9, spokenParts: plan.items.length, voices: plan.voices.map(v => v.voice), clips: plan.expectedClips, characters: plan.characters, budget: 5600 }, null, 2)); return
  }
  console.log(JSON.stringify(await generateSpanishBasicLevel1({ output: values.output, apiKey: loadElevenLabsKey() })))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
