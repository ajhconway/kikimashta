/** Generate only the thirty-one approved new Food level 2 words (#231). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, realpath, lstat, opendir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { generationPlan, generateCards } from './generate-elevenlabs-cards.mjs'
import { loadElevenLabsKey } from './elevenlabs-key.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
const digest = value => hash(JSON.stringify(value))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const FOLDER = 'content/spanish-food-2'
const files = {
  draftText: FOLDER + '/draft.json', artworkAcceptanceText: FOLDER + '/artwork-acceptance.json', registryText: 'content/es-419-voices.json', configText: FOLDER + '/audio-config.json', approvalText: FOLDER + '/audio-approval.json', reuseText: FOLDER + '/audio-reuse.json'
}
export function spanishFoodLevel2Plan({ draftText, artworkAcceptanceText, registryText, configText, approvalText, reuseText }) {
  const draft = JSON.parse(draftText)
  const art = JSON.parse(artworkAcceptanceText)
  const registry = JSON.parse(registryText)
  const config = JSON.parse(configText)
  const approval = JSON.parse(approvalText)
  const reuse = JSON.parse(reuseText)
  if (approval.issue !== 231
    || approval.pack !== 'es-419-food-2'
    || approval.language !== 'es-419'
    || approval.status !== 'generation-authorized-listening-pending'
    || approval.ownerMessage !== "I'm happy with that change. Let's proceed to audio generation."
    || approval.draft !== files.draftText
    || approval.draftSha256 !== hash(draftText)
    || approval.artworkAcceptance !== files.artworkAcceptanceText
    || approval.artworkAcceptanceSha256 !== hash(artworkAcceptanceText)
    || approval.configuration !== files.configText
    || approval.configurationSha256 !== hash(configText)
    || approval.voiceRegistry !== files.registryText
    || approval.voiceRegistrySha256 !== hash(registryText)
    || approval.audioReuse !== files.reuseText
    || approval.audioReuseSha256 !== hash(reuseText)
    || approval.runtimeActivationAuthorized !== false)
    throw Error('Food audio generation authorization changed.')
  const items = draft.items.filter(i => i.membership === 'new-spanish-item').map(({ id, text, meaning }) => ({
    id, text, spelling: text, meaning
  }))
  const existing = draft.items.filter(i => i.membership === 'existing-spanish-item')
  if (draft.issue !== 231
    || draft.id !== 'es-419-food-2'
    || draft.language !== 'es-419'
    || draft.items.length !== 36
    || items.length !== 31
    || existing.length !== 5
    || new Set(draft.items.map(i => i.id)).size !== 36
    || items.some(i => !/^es-419-food-[a-z0-9-]+$/.test(i.id))
    || !same(items, approval.items)
    || digest(items) !== approval.itemsSha256
    || !same(config.voices, registry.voices)
    || config.voices.length !== 8
    || digest(config.voices) !== approval.voicesSha256
    || config.issue !== 231
    || config.language !== 'es-419'
    || config.model !== 'eleven_v4'
    || !same(config.voiceSettings, { stability: .5, similarity_boost: .75 })
    || !same(config.normalization, {
      targetLufs: -22, truePeakCeilingDbtp: -2, dualMono: true
    }))
    throw Error('Expected only the thirty-one approved new food words and eight voices.')
  if (art.issue !== 231
    || art.pack !== draft.id
    || art.status !== 'artwork-accepted'
    || art.pictures !== 36
    || art.images.length !== 36
    || reuse.issue !== 231
    || reuse.pack !== draft.id
    || reuse.status !== 'accepted-audio-reuse-verified'
    || reuse.draftSha256 !== approval.draftSha256
    || reuse.voiceRegistrySha256 !== approval.voiceRegistrySha256
    || reuse.words !== 5
    || reuse.recordings !== 40
    || reuse.items.length !== 5
    || reuse.clips.length !== 40
    || new Set(reuse.items.map(i => i.id)).size !== 5
    || new Set(reuse.clips.map(c => c.id + ':' + c.voice)).size !== 40
    || !same(reuse.items.map(({ id, text, meaning }) => ({
      id, text, meaning
    })), existing.map(({ id, text, meaning }) => ({
      id, text, meaning
    }))))
    throw Error('Accepted artwork or existing audio reuse changed.')
  for (const word of existing)
    for (const voice of config.voices) {
      const clip = reuse.clips.find(c => c.id === word.id && c.voice === voice.voice)
      if (!clip
        || clip.text !== word.text
        || clip.meaning !== word.meaning
        || clip.voiceId !== voice.id
        || clip.voiceName !== voice.name
        || clip.region !== voice.region
        || clip.locale !== voice.locale
        || !/^public\/audio\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+\.mp3$/.test(clip.path)
        || !/^[a-f0-9]{64}$/.test(clip.sha256)
        || !Number.isSafeInteger(clip.bytes)
        || clip.bytes <= 0)
        throw Error('Existing audio identity changed.')
    }
  const plan = generationPlan(items, config)
  if (plan.expectedClips !== 248
    || plan.characters !== 1616
    || approval.expectedClips !== 248
    || approval.characters !== 1616
    || approval.budget !== 2000
    || approval.reusedWords !== 5
    || approval.reusedClips !== 40)
    throw Error('Approved Food audio scope changed.')
  return plan
}
async function checkedRead(root, path) {
  if (typeof path !== 'string'
    || !path
    || path.startsWith('/')
    || path.includes('\\')
    || path.split('/').some(p => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(p)))
    throw Error('Unsafe Food audio input path.')
  let current = resolve(root)
  if ((await lstat(current)).isSymbolicLink())
    throw Error('Food audio sources cannot contain symlinks.')
  for (const part of path.split('/')) {
    current = resolve(current, part)
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw Error('Food audio sources cannot contain symlinks.')
    }
    catch (e) {
      if (e.code !== 'ENOENT')
        throw e
    }
  }
  return readFile(resolve(root, path))
}
export async function loadSpanishFoodLevel2Plan(root = process.cwd()) {
  const texts = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, (await checkedRead(root, path)).toString()])))
  const plan = spanishFoodLevel2Plan(texts)
  const approval = JSON.parse(texts.approvalText)
  const reuse = JSON.parse(texts.reuseText)
  const { inspectFoodLevel2Art, loadFoodLevel2ArtworkAcceptance } = await import('./build-spanish-food-level-2-art-review.mjs')
  const art = await inspectFoodLevel2Art(root)
  const acceptedArt = await loadFoodLevel2ArtworkAcceptance(root, art)
  if (!acceptedArt
    || art.generatedImages !== 32
    || art.reusedImages !== 4
    || art.pendingImages !== 0
    || hash(JSON.stringify(art, null, 2) + '\n') !== acceptedArt.artworkManifestSha256)
    throw Error('Current Food level 2 artwork acceptance changed.')
  if (reuse.sources.length !== 1)
    throw Error('Expected only accepted Travel level 2 audio reuse.')
  for (const source of reuse.sources) {
    if (source.bank !== 'content/es-419-travel-2.json'
      || source.activation !== 'content/spanish-travel-2/activation.json'
      || source.acceptance !== 'content/spanish-travel-2/acceptance.json')
      throw Error('Unsafe reused audio provenance path.')
    const data = {}
    for (const key of ['bank', 'activation', 'acceptance']) {
      const bytes = await checkedRead(root, source[key])
      if (hash(bytes) !== source[key + 'Sha256'])
        throw Error('Accepted reused audio provenance changed.')
      data[key] = JSON.parse(bytes)
    }
    if (data.bank.language !== 'es-419'
      || data.activation.language !== 'es-419'
      || data.acceptance.language !== 'es-419'
      || data.activation.pack !== data.bank.id
      || data.acceptance.pack !== data.bank.id
      || data.acceptance.status !== 'accepted-for-activation'
      || data.activation.acceptance !== source.acceptance
      || data.activation.acceptanceSha256 !== source.acceptanceSha256)
      throw Error('Reused audio listening acceptance changed.')
    for (const clip of reuse.clips) {
      const word = data.bank.items.find(i => i.id === clip.id)
      const asset = word?.audio.find(a => a.voice === clip.voice)
      const recording = data.activation.recordings.find(c => c.id === clip.id && c.voice === clip.voice)
      if (!word
        || !asset
        || !recording
        || word.language !== 'es-419'
        || word.text !== clip.text
        || word.label !== clip.meaning
        || word.audio.length !== 8
        || !same(word.audio.map(a => a.voice), plan.voices.map(v => v.voice))
        || clip.path !== 'public/' + asset.src
        || asset.source !== 'synthesized'
        || asset.voiceName !== clip.voiceName
        || recording.src !== asset.src
        || recording.sha256 !== clip.sha256
        || recording.bytes !== clip.bytes
        || clip.sourceActivation !== source.activation)
        throw Error('Reused audio accepted word/voice identity changed.')
      const bytes = await checkedRead(root, clip.path)
      if (hash(bytes) !== clip.sha256 || bytes.length !== clip.bytes)
        throw Error('Accepted reused audio bytes changed.')
    }
  }
  return { plan, approval }
}
/** Resuming a private batch must not redirect journals, reports or originals through child links. */
async function rejectOutputDescendantLinks(destination) {
  const pending = [destination]
  let inspected = 0
  while (pending.length) {
    const directory = pending.pop()
    let info
    try { info = await lstat(directory) }
    catch (error) { if (error.code === 'ENOENT' && directory === destination) return; throw error }
    if (info.isSymbolicLink()) throw Error('Private Food audio output must not contain symlinks.')
    if (!info.isDirectory()) throw Error('Choose a directory for private Food audio output.')
    for await (const entry of await opendir(directory)) {
      if (++inspected > 10000) throw Error('Private Food audio output exceeds the bounded resume preflight.')
      const path = resolve(directory, entry.name)
      const child = await lstat(path)
      if (child.isSymbolicLink()) throw Error('Private Food audio output must not contain symlinks.')
      if (child.isDirectory()) pending.push(path)
    }
  }
}
export async function generateSpanishFoodLevel2Pack({ root = process.cwd(), output, apiKey, generate = generateCards }) {
  if (typeof output !== 'string' || !output.trim())
    throw new Error('Choose an originals output directory.')
  const destination = resolve(root, output)
  const privateRoot = resolve(root, 'artifacts/generated-originals')
  const within = relative(privateRoot, destination)
  if (!within || within.startsWith('..') || isAbsolute(within))
    throw new Error('Keep originals under artifacts/generated-originals/.')
  let ancestor = destination
  for (;;) {
    try {
      await lstat(ancestor)
      // lstat also detects dangling links: never skip one while finding a real ancestor.
      let actual
      try {
        actual = resolve(await realpath(ancestor), relative(ancestor, destination))
      }
      catch {
        throw new Error('Keep originals under artifacts/generated-originals/.')
      }
      const allowed = relative(resolve(await realpath(root), 'artifacts/generated-originals'), actual)
      if (!allowed || allowed.startsWith('..') || isAbsolute(allowed))
        throw new Error('Keep originals under artifacts/generated-originals/.')
      break
    }
    catch (error) {
      if (error.code !== 'ENOENT' || ancestor === dirname(ancestor))
        throw error
      ancestor = dirname(ancestor)
    }
  }
  await rejectOutputDescendantLinks(destination)
  const { plan, approval } = await loadSpanishFoodLevel2Plan(root)
  return generate({
    plan, output: destination, apiKey, concurrency: 2, budget: 2000,
    beforeRequests: async () => {
      const path = resolve(destination, 'approval.json')
      let saved
      try {
        saved = JSON.parse(await readFile(path, 'utf8'))
      }
      catch (error) {
        if (error.code !== 'ENOENT')
          throw error
      }
      if (saved && !same(saved, approval))
        throw new Error('Saved Food level 2 approval changed.')
      if (!saved)
        await writeFile(path, JSON.stringify(approval, null, 2) + '\n', { flag: 'wx' })
    },
  })
}
async function main() {
  const { values } = parseArgs({ options: { output: { type: 'string' }, 'dry-run': { type: 'boolean' } } })
  const { plan } = await loadSpanishFoodLevel2Plan()
  if (values['dry-run']) {
    console.log(JSON.stringify({
      words: 31, voices: plan.voices.map(v => v.voice), clips: plan.expectedClips, characters: plan.characters, budget: 2000
    }, null, 2))
    return
  }
  console.log(JSON.stringify(await generateSpanishFoodLevel2Pack({ output: values.output, apiKey: loadElevenLabsKey() })))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
