/** Generate only the twelve approved new Food level 1 words (#218). */
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
const FOLDER = 'content/spanish-food-1'
const files = {
  draftText: FOLDER + '/draft.json', artworkAcceptanceText: FOLDER + '/artwork-acceptance.json', registryText: 'content/es-419-voices.json', configText: FOLDER + '/audio-config.json', approvalText: FOLDER + '/audio-approval.json', reuseText: FOLDER + '/audio-reuse.json'
}
export function spanishFoodLevel1Plan({ draftText, artworkAcceptanceText, registryText, configText, approvalText, reuseText }) {
  const draft = JSON.parse(draftText)
  const art = JSON.parse(artworkAcceptanceText)
  const registry = JSON.parse(registryText)
  const config = JSON.parse(configText)
  const approval = JSON.parse(approvalText)
  const reuse = JSON.parse(reuseText)
  if (approval.issue !== 218
    || approval.pack !== 'es-419-food-1'
    || approval.language !== 'es-419'
    || approval.status !== 'generation-authorized-listening-pending'
    || approval.ownerMessage !== 'Please go ahead and generate them.'
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
  if (draft.issue !== 218
    || draft.id !== 'es-419-food-1'
    || draft.language !== 'es-419'
    || draft.items.length !== 36
    || items.length !== 12
    || existing.length !== 24
    || new Set(draft.items.map(i => i.id)).size !== 36
    || items.some(i => !/^es-419-food-[a-z0-9-]+$/.test(i.id))
    || !same(items, approval.items)
    || digest(items) !== approval.itemsSha256
    || !same(config.voices, registry.voices)
    || config.voices.length !== 8
    || digest(config.voices) !== approval.voicesSha256
    || config.issue !== 218
    || config.language !== 'es-419'
    || config.model !== 'eleven_v4'
    || !same(config.voiceSettings, { stability: .5, similarity_boost: .75 })
    || !same(config.normalization, {
    targetLufs: -22, truePeakCeilingDbtp: -2, dualMono: true
  }))
    throw Error('Expected only the twelve approved new food words and eight voices.')
  if (art.issue !== 218
    || art.pack !== draft.id
    || art.status !== 'artwork-accepted'
    || art.pictures !== 36
    || art.images.length !== 36
    || reuse.issue !== 218
    || reuse.pack !== draft.id
    || reuse.status !== 'accepted-audio-reuse-verified'
    || reuse.draftSha256 !== approval.draftSha256
    || reuse.voiceRegistrySha256 !== approval.voiceRegistrySha256
    || reuse.words !== 24
    || reuse.recordings !== 192
    || reuse.items.length !== 24
    || reuse.clips.length !== 192
    || new Set(reuse.items.map(i => i.id)).size !== 24
    || new Set(reuse.clips.map(c => c.id + ':' + c.voice)).size !== 192
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
  if (plan.expectedClips !== 96
    || plan.characters !== 608
    || approval.expectedClips !== 96
    || approval.characters !== 608
    || approval.budget !== 1000
    || approval.reusedWords !== 24
    || approval.reusedClips !== 192)
    throw Error('Approved Food audio scope changed.')
  return plan
}
export async function loadSpanishFoodLevel1Plan(root = process.cwd()) {
  const texts = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, p]) => [key, await readFile(resolve(root, p), 'utf8')])))
  const plan = spanishFoodLevel1Plan(texts)
  const approval = JSON.parse(texts.approvalText)
  const reuse = JSON.parse(texts.reuseText)
  for (const source of reuse.sources)
    for (const key of ['bank', 'activation', 'acceptance']) {
      if (!/^content\/[a-zA-Z0-9/_.-]+\.json$/.test(source[key]) || source[key].split('/').includes('..'))
        throw Error('Unsafe reused audio provenance path.')
      if (hash(await readFile(resolve(root, source[key]))) !== source[key + 'Sha256'])
        throw Error('Accepted reused audio provenance changed.')
    }
  for (const c of reuse.clips) {
    const bytes = await readFile(resolve(root, c.path))
    if (hash(bytes) !== c.sha256 || bytes.length !== c.bytes)
      throw Error('Accepted reused audio bytes changed.')
  }
  return { plan, approval }
}
export async function generateSpanishFoodLevel1Pack({ root = process.cwd(), output, apiKey, generate = generateCards }) {
  const { plan, approval } = await loadSpanishFoodLevel1Plan(root)
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
  return generate({
    plan, output: destination, apiKey, concurrency: 2, budget: 1000,
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
        throw new Error('Saved Food level 1 approval changed.')
      if (!saved)
        await writeFile(path, JSON.stringify(approval, null, 2) + '\n', { flag: 'wx' })
    },
  })
}
async function main() {
  const { values } = parseArgs({ options: { output: { type: 'string' }, 'dry-run': { type: 'boolean' } } })
  const { plan } = await loadSpanishFoodLevel1Plan()
  if (values['dry-run']) {
    console.log(JSON.stringify({
      words: 12, voices: plan.voices.map(v => v.voice), clips: plan.expectedClips, characters: plan.characters, budget: 1000
    }, null, 2))
    return
  }
  console.log(JSON.stringify(await generateSpanishFoodLevel1Pack({ output: values.output, apiKey: loadElevenLabsKey() })))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
