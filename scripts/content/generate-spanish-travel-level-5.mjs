/** Authorized, resumable provider originals for Travel level 5 (#243). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, realpath, lstat, opendir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { generationPlan, generateCards } from './generate-elevenlabs-cards.mjs'
import { loadElevenLabsKey } from './elevenlabs-key.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const digest = value => hash(JSON.stringify(value))
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const FOLDER = 'content/spanish-travel-5'
const ART = 'artifacts/spanish-travel-5-art'
const OWNER_MESSAGE = "Looks good, let's proceed to audio generation."
const files = {
  draftText: FOLDER + '/draft.json', artworkAcceptanceText: FOLDER + '/artwork-acceptance.json', registryText: 'content/es-419-voices.json', configText: FOLDER + '/audio-config.json', approvalText: FOLDER + '/audio-approval.json',
}

export function spanishTravelLevel5Plan({ draftText, artworkAcceptanceText, registryText, configText, approvalText }) {
  const draft = JSON.parse(draftText)
  const art = JSON.parse(artworkAcceptanceText)
  const registry = JSON.parse(registryText)
  const config = JSON.parse(configText)
  const approval = JSON.parse(approvalText)
  if (approval.issue !== 243 || approval.pack !== 'es-419-travel-5' || approval.language !== 'es-419'
    || approval.status !== 'generation-authorized-listening-pending' || approval.ownerMessage !== OWNER_MESSAGE
    || approval.draft !== files.draftText || approval.draftSha256 !== hash(draftText)
    || approval.artworkAcceptance !== files.artworkAcceptanceText || approval.artworkAcceptanceSha256 !== hash(artworkAcceptanceText)
    || approval.configuration !== files.configText || approval.configurationSha256 !== hash(configText)
    || approval.voiceRegistry !== files.registryText || approval.voiceRegistrySha256 !== hash(registryText)
    || approval.runtimeActivationAuthorized !== false)
    throw Error('Travel level 5 audio generation authorization changed.')
  const items = draft.items.map(({ id, text, meaning }) => ({ id, text, spelling: text, meaning }))
  if (draft.issue !== 243 || draft.id !== 'es-419-travel-5' || draft.language !== 'es-419'
    || items.length !== 36 || new Set(items.map(item => item.id)).size !== 36
    || new Set(items.map(item => item.text)).size !== 36
    || draft.items.some(item => item.membership !== 'new-spanish-item' || !/^es-419-travel-[a-z0-9-]+$/.test(item.id))
    || !same(items, approval.items) || digest(items) !== approval.itemsSha256
    || !same(config.voices, registry.voices) || config.voices.length !== 8 || digest(config.voices) !== approval.voicesSha256
    || config.issue !== 243 || config.provider !== 'ElevenLabs' || config.language !== 'es-419' || config.model !== 'eleven_v4'
    || config.approval?.ownerMessage !== OWNER_MESSAGE
    || !same(config.voiceSettings, { stability: .5, similarity_boost: .75 })
    || !same(config.normalization, { targetLufs: -22, truePeakCeilingDbtp: -2, dualMono: true }))
    throw Error('Expected only the thirty-six approved new travel words and eight voices.')
  if (art.issue !== 243 || art.pack !== draft.id || art.language !== 'es-419' || art.status !== 'artwork-accepted'
    || art.ownerMessage !== OWNER_MESSAGE || art.pictures !== 36 || art.images.length !== 36
    || new Set(art.images.map(image => image.id)).size !== 36
    || art.images.some(image => !items.some(item => item.id === image.id))
    || art.artworkManifest !== ART + '/manifest.json' || art.selection !== ART + '/selection.json')
    throw Error('Accepted Travel level 5 artwork changed.')
  const plan = generationPlan(items, config)
  const budget = Math.ceil(plan.characters * 1.2 / 100) * 100
  if (plan.expectedClips !== 288 || approval.expectedClips !== 288
    || approval.characters !== plan.characters || approval.budget !== budget)
    throw Error('Approved Travel level 5 audio scope changed.')
  return plan
}

/** Repository-contained, bounded reads; no symlinked input or image is accepted. */
async function checkedRead(root, path, expectedHash) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\')
    || path.split('/').some(part => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part)))
    throw Error('Unsafe Travel audio input path.')
  let current = resolve(root)
  if ((await lstat(current)).isSymbolicLink()) throw Error('Travel audio sources cannot contain symlinks.')
  for (const part of path.split('/')) {
    current = resolve(current, part)
    if ((await lstat(current)).isSymbolicLink()) throw Error('Travel audio sources cannot contain symlinks.')
  }
  const info = await lstat(current)
  if (!info.isFile() || info.size > 64 * 1024 * 1024) throw Error('Travel audio source exceeds the bounded file limit.')
  const bytes = await readFile(current)
  if (expectedHash !== undefined && (!/^[a-f0-9]{64}$/.test(expectedHash) || hash(bytes) !== expectedHash))
    throw Error('Accepted Travel artwork or provenance bytes changed: ' + path)
  return bytes
}

export async function loadSpanishTravelLevel5Plan(root = process.cwd()) {
  const texts = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, (await checkedRead(root, path)).toString()])))
  const plan = spanishTravelLevel5Plan(texts)
  const approval = JSON.parse(texts.approvalText)
  const art = JSON.parse(texts.artworkAcceptanceText)
  const manifest = JSON.parse(await checkedRead(root, art.artworkManifest, art.artworkManifestSha256))
  const selection = JSON.parse(await checkedRead(root, art.selection, art.selectionSha256))
  if (manifest.issue !== 243 || manifest.pack !== 'es-419-travel-5' || manifest.words !== 36 || manifest.pendingImages !== 0
    || manifest.items.length !== 36 || selection.issue !== 243 || selection.pack !== manifest.pack
    || manifest.selection !== art.selection || manifest.selectionSha256 !== art.selectionSha256
    || !same(manifest.items, selection.items) || new Set(manifest.items.map(image => image.id)).size !== 36
    || Object.keys(manifest.inputHashes).length > 500
    || manifest.inputHashes[files.draftText] !== approval.draftSha256)
    throw Error('Current Travel level 5 artwork manifest changed.')
  for (const [path, expectedHash] of Object.entries(manifest.inputHashes))
    await checkedRead(root, path, expectedHash)
  for (const accepted of art.images) {
    const selected = manifest.items.find(image => image.id === accepted.id)
    const word = plan.items.find(item => item.id === accepted.id)
    if (!selected || !word || selected.text !== word.text || selected.meaning !== word.meaning
      || !['generated', 'reuse'].includes(selected.source) || accepted.path !== selected.path || accepted.sha256 !== selected.sha256
      || accepted.source !== selected.source || (accepted.version !== undefined && accepted.version !== selected.version))
      throw Error('Accepted Travel artwork identity changed.')
    const bytes = await checkedRead(root, accepted.path, accepted.sha256)
    if (selected.bytes !== undefined && selected.bytes !== bytes.length) throw Error('Accepted Travel artwork byte count changed.')
  }
  return { plan, approval }
}

/** Reject redirecting resumed journals, reports, pending records or originals. */
async function rejectOutputDescendantLinks(destination) {
  const pending = [destination]
  let inspected = 0
  while (pending.length) {
    const directory = pending.pop()
    let info
    try { info = await lstat(directory) }
    catch (error) { if (error.code === 'ENOENT' && directory === destination) return; throw error }
    if (info.isSymbolicLink()) throw Error('Private Travel audio output must not contain symlinks.')
    if (!info.isDirectory()) throw Error('Choose a directory for private Travel audio output.')
    for await (const entry of await opendir(directory)) {
      if (++inspected > 10000) throw Error('Private Travel audio output exceeds the bounded resume preflight.')
      const path = resolve(directory, entry.name)
      const child = await lstat(path)
      if (child.isSymbolicLink()) throw Error('Private Travel audio output must not contain symlinks.')
      if (child.isDirectory()) pending.push(path)
    }
  }
}

export async function generateSpanishTravelLevel5Pack({ root = process.cwd(), output, apiKey, generate = generateCards }) {
  const { plan, approval } = await loadSpanishTravelLevel5Plan(root)
  if (typeof output !== 'string' || !output.trim()) throw Error('Choose an originals output directory.')
  const destination = resolve(root, output)
  const privateRoot = resolve(root, 'artifacts/generated-originals')
  const within = relative(privateRoot, destination)
  if (!within || within.startsWith('..') || isAbsolute(within)) throw Error('Keep originals under artifacts/generated-originals/.')
  let ancestor = destination
  for (;;) {
    try {
      await lstat(ancestor)
      let actual
      try { actual = resolve(await realpath(ancestor), relative(ancestor, destination)) }
      catch { throw Error('Keep originals under artifacts/generated-originals/.') }
      const allowed = relative(resolve(await realpath(root), 'artifacts/generated-originals'), actual)
      if (!allowed || allowed.startsWith('..') || isAbsolute(allowed)) throw Error('Keep originals under artifacts/generated-originals/.')
      break
    }
    catch (error) {
      if (error.code !== 'ENOENT' || ancestor === dirname(ancestor)) throw error
      ancestor = dirname(ancestor)
    }
  }
  await rejectOutputDescendantLinks(destination)
  return generate({
    plan, output: destination, apiKey, concurrency: 2, budget: approval.budget,
    beforeRequests: async () => {
      const path = resolve(destination, 'approval.json')
      let saved
      try { saved = JSON.parse(await readFile(path, 'utf8')) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      if (saved && !same(saved, approval)) throw Error('Saved Travel level 5 approval changed.')
      if (!saved) await writeFile(path, JSON.stringify(approval, null, 2) + '\n', { flag: 'wx' })
    },
  })
}

async function main() {
  const { values } = parseArgs({ options: { output: { type: 'string' }, 'dry-run': { type: 'boolean' } } })
  const { plan, approval } = await loadSpanishTravelLevel5Plan()
  if (values['dry-run']) {
    console.log(JSON.stringify({ words: plan.items.length, voices: plan.voices.map(voice => voice.voice), clips: plan.expectedClips, characters: plan.characters, budget: approval.budget }, null, 2))
    return
  }
  console.log(JSON.stringify(await generateSpanishTravelLevel5Pack({ output: values.output, apiKey: loadElevenLabsKey() })))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
