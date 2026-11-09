/** Stage the exact final owner-accepted Travel level 4 media (#207). No network. */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectPngAlpha } from './png-alpha.mjs'
import { loadSpanishTravelLevel4Plan } from './generate-spanish-travel-level-4.mjs'
import { loadSpanishTravelLevel4ReplacementPlan } from './generate-spanish-travel-level-4-replacement.mjs'
const ART = 'artifacts/spanish-travel-4-art'
const AUDIO = 'artifacts/spanish-travel-4-audio-review'
const REPLACEMENT = 'artifacts/spanish-travel-4-replacement-audio-review'
const FOLDER = 'content/spanish-travel-4'
const ACCEPTANCE = FOLDER + '/acceptance.json'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const requiredInputs = [
  'content/es-419-voices.json', 'content/card-regeneration/activation.json', ...[
    'draft.json', 'generation-approval.json', 'audio-config.json', 'audio-approval.json', 'replacement-audio-approval.json', 'word-replacement.json', 'artwork-acceptance.json'
  ].map(p => FOLDER + '/' + p), ART + '/manifest.json', ART + '/selection.json', ART + '/requests.json', AUDIO + '/manifest.json', REPLACEMENT + '/manifest.json'
]
async function noSymlink(root, path) {
  if (typeof path !== 'string'
    || !path
    || path.split('/').some(part => !/^[a-zA-Z0-9_.-]+$/.test(part)
    || part === '.'
    || part === '..'))
    throw Error('Unsafe staging path.')
  let current = root
  for (const part of path.split('/')) {
    current = join(current, part)
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw Error('Staging source or destination contains a symlink.')
    }
    catch (e) {
      if (e.code !== 'ENOENT')
        throw e
    }
  }
}
function acceptedLevel(c) {
  if (!Number.isFinite(c.gainDb)
    || c.gainDb > 9
    || !Number.isFinite(c.after?.truePeakDbtp)
    || c.after.truePeakDbtp > -2
    || !Number.isFinite(c.after?.integratedLufs)
    || !Number.isSafeInteger(c.decodedFrames)
    || c.decodedFrames <= 0)
    return false
  if (c.id !== 'es-419-travel-sugar' || c.voice !== 'carlos-figueroa')
    return c.targetLimited === false && Math.abs(c.after.integratedLufs + 22) <= .25 && same(c.limitingReasons, [])
  return c.targetLimited === true
    && c.deliverySha256 === '8796d978da7867dae753cab8fc2ab5d7f4ddb50b7b654cf7dedc753cba427235'
    && c.originalSha256 === 'd41ca8a91ac154330a1852acaeec068874c04008210a500d63a2aaf9d1c428da'
    && c.deliveryBytes === 16343
    && c.originalBytes === 16343
    && c.decodedFrames === 42336
    && c.after.integratedLufs === -22.65
    && c.after.truePeakDbtp === -5.79
    && c.after.analysisPadding === false
    && c.after.measurementMethod === 'r128'
    && c.gainDb === 9
    && same(c.limitingReasons, ['maximum_gain'])
}
export async function stageSpanishTravelLevel4({ root = process.cwd() } = {}) {
  const read = async (path) => {
    await noSymlink(root, path)
    return readFile(join(root, path))
  }
  const acceptanceBytes = await read(ACCEPTANCE)
  const acceptance = JSON.parse(acceptanceBytes)
  if (acceptance.issue !== 207
    || acceptance.pack !== 'es-419-travel-4'
    || acceptance.language !== 'es-419'
    || acceptance.status !== 'accepted-for-activation'
    || acceptance.ownerMessage !== "Let's ship it!"
    || acceptance.words !== 36
    || acceptance.images !== 36
    || acceptance.recordings !== 288
    || acceptance.voices !== 8
    || !acceptance.inputs)
    throw Error('Complete final owner acceptance is required.')
  const inputs = new Map()
  for (const path of Object.keys(acceptance.inputs)) {
    if (!validHash(acceptance.inputs[path]))
      throw Error('Invalid accepted input hash.')
    const bytes = await read(path)
    if (hash(bytes) !== acceptance.inputs[path])
      throw Error('Accepted input bytes changed: ' + path)
    inputs.set(path, bytes)
  }
  if (requiredInputs.some(p => !inputs.has(p)))
    throw Error('Accepted authorization inputs are incomplete.')
  const data = path => {
    if (!inputs.has(path))
      throw Error('Unbound provenance input: ' + path)
    return JSON.parse(inputs.get(path))
  }
  const draft = data(FOLDER + '/draft.json')
  const amendment = data(FOLDER + '/word-replacement.json')
  const registry = data('content/es-419-voices.json')
  const art = data(ART + '/manifest.json')
  const selection = data(ART + '/selection.json')
  const artworkAcceptance = data(FOLDER + '/artwork-acceptance.json')
  const requests = data(ART + '/requests.json')
  const { plan } = await loadSpanishTravelLevel4Plan(root)
  const { plan: replacementPlan } = await loadSpanishTravelLevel4ReplacementPlan(root)
  if (art.issue !== 207
    || art.pack !== draft.id
    || art.generatedImages !== 35
    || art.reusedImages !== 1
    || art.pendingImages !== 0
    || art.recordings !== 288
    || art.images.length !== 36
    || new Set(art.images.map(i => i.id)).size !== 36
    || art.draftSha256 !== hash(inputs.get(FOLDER + '/draft.json'))
    || art.audioManifestSha256 !== hash(inputs.get(AUDIO + '/manifest.json'))
    || art.replacementAudioManifestSha256 !== hash(inputs.get(REPLACEMENT + '/manifest.json'))
    || art.wordReplacementSha256 !== hash(inputs.get(FOLDER + '/word-replacement.json')))
    throw Error('Accepted artwork matrix changed.')
  if (artworkAcceptance.issue !== 207
    || artworkAcceptance.status !== 'artwork-accepted'
    || artworkAcceptance.artworkManifest !== ART + '/manifest.json'
    || artworkAcceptance.artworkManifestSha256 !== hash(inputs.get(ART + '/manifest.json'))
    || artworkAcceptance.selection !== ART + '/selection.json'
    || artworkAcceptance.selectionSha256 !== hash(inputs.get(ART + '/selection.json'))
    || artworkAcceptance.wordReplacement !== FOLDER + '/word-replacement.json'
    || artworkAcceptance.wordReplacementSha256 !== hash(inputs.get(FOLDER + '/word-replacement.json'))
    || artworkAcceptance.images.length !== 36)
    throw Error('Exact artwork acceptance changed.')
  const effective = draft.items.map(i => i.id === amendment.retiredItemId ? amendment.item : i)
  if (effective.length !== 36
    || new Set(effective.map(i => i.id)).size !== 36
    || new Set(effective.map(i => i.text)).size !== 36
    || effective.some(i => i.id === 'es-419-travel-bandage')
    || !effective.some(i => i.id === 'es-419-travel-power-outlet'))
    throw Error('Effective word selection changed.')
  const clips = []
  for (const [folder, expectedPlan, pack] of [[AUDIO, plan, draft.id], [REPLACEMENT, replacementPlan, 'es-419-travel-4-replacement']]) {
    const review = data(folder + '/manifest.json')
    if (review.issue !== 207
      || review.pack !== pack
      || review.language !== 'es-419'
      || review.model !== 'eleven_v4'
      || review.provider !== 'ElevenLabs'
      || review.planIdentity !== hash(JSON.stringify(expectedPlan))
      || !same(review.items, expectedPlan.items)
      || !same(review.voices, registry.voices)
      || review.clips.length !== expectedPlan.expectedClips
      || new Set(review.clips.map(c => c.id + ':' + c.voice)).size !== review.clips.length)
      throw Error('Accepted audio matrix changed.')
    if (folder === REPLACEMENT
      && (review.replacementSha256 !== hash(inputs.get(FOLDER + '/word-replacement.json'))
      || review.baseDraftSha256 !== hash(inputs.get(FOLDER + '/draft.json'))))
      throw Error('Replacement audio authorization changed.')
    for (const c of review.clips) {
      const word = expectedPlan.items.find(i => i.id === c.id)
      const voice = registry.voices.find(v => v.voice === c.voice)
      if (!word
        || !voice
        || c.text !== word.text
        || c.spelling !== word.spelling
        || c.meaning !== word.meaning
        || c.voiceId !== voice.id
        || c.voiceName !== voice.name
        || c.region !== voice.region
        || c.locale !== voice.locale
        || c.file !== `audio/${voice.voice}/${word.id}.mp3`
        || c.originalFile !== `originals/${voice.voice}/${word.id}.mp3`
        || c.request?.text !== word.text
        || c.request.model_id !== 'eleven_v4'
        || c.request.language_code !== 'es'
        || !same(c.request.voice_settings, { stability: .5, similarity_boost: .75 })
        || !validHash(c.deliverySha256)
        || !validHash(c.originalSha256)
        || !Number.isSafeInteger(c.deliveryBytes)
        || c.deliveryBytes <= 0
        || !acceptedLevel(c))
        throw Error('Accepted audio identity or profile changed.')
      const sourcePath = folder + '/' + c.file
      const bytes = await read(sourcePath)
      if (hash(bytes) !== c.deliverySha256 || bytes.length !== c.deliveryBytes)
        throw Error('Accepted recording bytes changed.')
      if (c.id !== amendment.retiredItemId)
        clips.push({
          ...c, sourcePath, bytes
        })
    }
  }
  if (clips.length !== 288)
    throw Error('Effective recording matrix changed.')
  const approved = data('content/card-regeneration/activation.json')
  const images = []
  const recordings = []
  const copies = []
  const items = []
  for (const word of effective) {
    const picture = art.images.find(i => i.id === word.id)
    const accepted = artworkAcceptance.images.find(i => i.id === word.id)
    if (!picture
      || !accepted
      || picture.slug !== word.slug
      || picture.text !== word.text
      || picture.meaning !== word.meaning
      || accepted.path !== picture.path
      || accepted.sha256 !== picture.sha256
      || accepted.source !== picture.source
      || accepted.version !== picture.version
      || !validHash(picture.sha256))
      throw Error('Accepted picture selection changed.')
    let src
    if (picture.source === 'generated') {
      const version = selection.versions[word.slug] ?? 1
      if (picture.version !== version || picture.path !== `${ART}/originals/${word.slug}-v${version}.png`)
        throw Error('Selected artwork version changed.')
      const qpath = version === 1
        && word.id !== amendment.item.id ? ART + '/requests.json' : `${ART}/revisions/${word.slug}-v${version}-request.json`
      const q = qpath === ART + '/requests.json' ? requests.requests.find(q => q.id === word.id) : data(qpath)
      const record = data(`${ART}/records/${word.slug}-v${version}.json`)
      if (!q
        || q.id !== word.id
        || q.slug !== word.slug
        || q.version !== version
        || q.transparent_background !== true
        || record.id !== word.id
        || record.version !== version
        || record.path !== `originals/${word.slug}-v${version}.png`
        || record.sha256 !== picture.sha256
        || record.promptSha256 !== hash(q.prompt)
        || picture.promptSha256 !== record.promptSha256
        || record.referenceSha256 !== q.referenceSha256
        || (q.additionalReferences ?? []).length
        || hash(await read(q.referencePath)) !== q.referenceSha256)
        throw Error('Accepted artwork provenance changed.')
      src = `images/approved/${word.id}-${picture.sha256.slice(0, 12)}.png`
    }
    else if (picture.source === 'approved-reuse') {
      const entry = approved.assets.find(a => a.id === picture.sourceId
        && a.path === picture.path
        && a.sha256 === picture.sha256)
      if (!entry
        || picture.id !== 'es-419-travel-flower'
        || picture.evidence !== 'content/card-regeneration/activation.json'
        || !/^public\/images\/approved\/[a-z0-9-]+\.png$/.test(picture.path))
        throw Error('Approved flower reuse changed.')
      src = picture.path.slice(7)
    }
    else
      throw Error('Unaccepted picture source.')
    const bytes = await read(picture.path)
    const pixels = inspectPngAlpha(bytes)
    if (hash(bytes) !== picture.sha256
      || (picture.bytes !== undefined
      && bytes.length !== picture.bytes)
      || pixels.width !== pixels.height
      || !pixels.transparentPixels
      || !pixels.opaquePixels)
      throw Error('Accepted image bytes or transparency changed.')
    if (picture.source === 'generated')
      copies.push({ path: 'public/' + src, bytes })
    images.push({
      id: word.id, src, sha256: picture.sha256, bytes: bytes.length, sourcePath: picture.path, source: picture.source, ...(picture.version ? { version: picture.version } : {})
    })
    const audio = registry.voices.map(v => {
      const c = clips.find(c => c.id === word.id && c.voice === v.voice)
      if (!c)
        throw Error('Missing accepted recording.')
      const src = `audio/es-419-travel-4/${v.voice}/${word.id}.mp3`
      copies.push({ path: 'public/' + src, bytes: c.bytes })
      recordings.push({
        id: word.id, voice: v.voice, src, sha256: c.deliverySha256, bytes: c.bytes.length, originalSha256: c.originalSha256, sourcePath: c.sourcePath, targetLimited: c.targetLimited, limitingReasons: c.limitingReasons, gainDb: c.gainDb, after: c.after
      })
      return {
        src, source: 'synthesized', voice: v.voice, voiceName: v.name
      }
    })
    items.push({
      id: word.id, language: 'es-419', theme: 'travel', label: word.meaning, text: word.text, image: {
        src, source: 'generated', alt: word.meaning
      }, audio
    })
  }
  const bank = {
    id: 'es-419-travel-4', language: 'es-419', title: 'Travel level 4', status: 'approved', items
  }
  const bankPath = 'content/es-419-travel-4.json'
  const activationPath = FOLDER + '/activation.json'
  for (const path of [bankPath, activationPath, ...copies.map(c => c.path)])
    await noSymlink(root, path)
  for (const c of copies) {
    await mkdir(dirname(join(root, c.path)), { recursive: true })
    await writeFile(join(root, c.path), c.bytes)
  }
  const activation = {
    issue: 207, pack: bank.id, language: bank.language, acceptance: ACCEPTANCE, acceptanceSha256: hash(acceptanceBytes), words: 36, voices: registry.voices, retiredItemId: amendment.retiredItemId, images, recordings
  }
  await writeFile(join(root, bankPath), JSON.stringify(bank, null, 2) + '\n')
  await writeFile(join(root, activationPath), JSON.stringify(activation, null, 2) + '\n')
  return {
    words: 36, images: images.length, recordings: recordings.length, voices: registry.voices.length
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  stageSpanishTravelLevel4().then(r => console.log(JSON.stringify(r))).catch(e => {
    console.error(e.message)
    process.exitCode = 1
  })
