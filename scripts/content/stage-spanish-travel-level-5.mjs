/** Stage only the exact owner-accepted Travel level 5 media (#243). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadSpanishTravelLevel5Plan } from './generate-spanish-travel-level-5.mjs'
import { travelLevel5NormalizationVerification } from './build-spanish-travel-level-5-audio-review.mjs'
import { inspectPngAlpha } from './png-alpha.mjs'

const DATA = 'content/spanish-travel-5'
const ART = 'artifacts/spanish-travel-5-art'
const REVIEW = 'artifacts/spanish-travel-5-audio-review'
const ACCEPTANCE = DATA + '/acceptance.json'
const MEDIA = REVIEW + '/manifest.json'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const REQUIRED = [
  ...['draft.json', 'proposal-v1.json', 'generation-approval.json', 'artwork-acceptance.json', 'audio-config.json', 'audio-approval.json'].map(path => DATA + '/' + path),
  'content/es-419-voices.json', ...['manifest.json', 'selection.json', 'requests.json', 'reuse-review.json', 'revisions/people-v2-requests.json', 'revisions/before-people-v2-manifest.json', 'revisions/draw-v3-request.json', 'revisions/before-draw-v3-manifest.json'].map(path => ART + '/' + path),
  ...['dance-v2-initial.png', 'dance-v2-glow-edit.png', 'dance-v2-glow-retry.png',
    'dance-v2-glow-edit-request.json', 'dance-v2-glow-retry-request.json',
    'dance-v2-initial-record.json', 'people-v2-initial-requests.json',
    'people-v2-attempt-history.json'].map(path => ART + '/revisions/' + path),
  MEDIA, REVIEW + '/normalization-summary.json', REVIEW + '/normalization-verification.json',
]

async function checkedPath(root, path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\')
    || path.split('/').some(part => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part)))
    throw Error('Unsafe Travel level 5 staging path.')
  let current = resolve(root)
  for (const part of ['', ...path.split('/')]) {
    if (part) current = join(current, part)
    try { if ((await lstat(current)).isSymbolicLink()) throw Error('Travel level 5 staging paths cannot contain symlinks.') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return current
}

export async function stageSpanishTravelLevel5({ root = process.cwd() } = {}) {
  const read = async path => readFile(await checkedPath(root, path))
  const acceptanceBytes = await read(ACCEPTANCE)
  const acceptance = JSON.parse(acceptanceBytes)
  if (acceptance.issue !== 243 || acceptance.pack !== 'es-419-travel-5' || acceptance.language !== 'es-419'
    || acceptance.runtimeActivationAuthorized !== true
    || acceptance.status !== 'accepted-for-activation' || acceptance.ownerMessage !== 'Please go ahead and auto-merge'
    || acceptance.words !== 36 || acceptance.images !== 36 || acceptance.recordings !== 288 || acceptance.voices !== 8
    || acceptance.newWords !== 36 || acceptance.reusedWords !== 0 || acceptance.generatedImages !== 34 || acceptance.reusedImages !== 2
    || acceptance.newRecordings !== 288 || acceptance.reusedRecordings !== 0 || acceptance.mediaManifest !== MEDIA
    || !acceptance.inputs || Object.keys(acceptance.inputs).length > 1000)
    throw Error('Exact final Travel level 5 owner acceptance is required.')
  const inputBytes = new Map()
  for (const [path, expectedHash] of Object.entries(acceptance.inputs)) {
    const bytes = await read(path)
    if (!validHash(expectedHash) || hash(bytes) !== expectedHash) throw Error('Accepted Travel input bytes changed: ' + path)
    inputBytes.set(path, bytes)
  }
  if (REQUIRED.some(path => !inputBytes.has(path)) || hash(inputBytes.get(MEDIA)) !== acceptance.mediaManifestSha256)
    throw Error('Travel level 5 final input bindings are incomplete.')
  const { plan, approval } = await loadSpanishTravelLevel5Plan(root)
  const draft = JSON.parse(inputBytes.get(DATA + '/draft.json'))
  const art = JSON.parse(inputBytes.get(ART + '/manifest.json'))
  const artworkAcceptance = JSON.parse(inputBytes.get(DATA + '/artwork-acceptance.json'))
  const media = JSON.parse(inputBytes.get(MEDIA))
  if (media.issue !== 243 || media.pack !== 'es-419-travel-5'
    || media.language !== 'es-419' || media.provider !== plan.provider || media.model !== plan.model
    || media.expectedClips !== 288 || media.characters !== plan.characters || media.planIdentity !== hash(JSON.stringify(plan))
    || media.draftSha256 !== approval.draftSha256 || media.artworkAcceptanceSha256 !== approval.artworkAcceptanceSha256
    || media.audioApprovalSha256 !== hash(inputBytes.get(DATA + '/audio-approval.json'))
    || !same(media.items.map(({ id, text, spelling, meaning }) => ({ id, text, spelling, meaning })), plan.items)
    || !same(media.voices, plan.voices) || !same(media.images, artworkAcceptance.images)
    || media.clips.length !== 288 || new Set(media.clips.map(clip => clip.id + ':' + clip.voice)).size !== 288
    || media.images.filter(image => image.source === 'generated').length !== 34 || media.images.filter(image => image.source === 'reuse').length !== 2
    || media.runtimeActivationAuthorized !== false || media.listeningStatus !== 'pending')
    throw Error('Accepted Travel level 5 media matrix changed.')
  for (const inputs of [media.inputs, art.inputHashes])
    for (const [path, expectedHash] of Object.entries(inputs))
      if (acceptance.inputs[path] !== expectedHash) throw Error('Unbound current Travel level 5 input: ' + path)
  const normalization = travelLevel5NormalizationVerification(media, inputBytes.get(REVIEW + '/normalization-summary.json'))
  if (!same(normalization, JSON.parse(inputBytes.get(REVIEW + '/normalization-verification.json'))))
    throw Error('Travel level 5 normalization evidence changed.')
  const quieter = media.clips.filter(clip => clip.targetLimited).map(clip => ({
    id: clip.id, voice: clip.voice, sha256: clip.deliverySha256, integratedLufs: clip.after.integratedLufs, limitingReasons: clip.limitingReasons,
  }))
  if (quieter.length !== 1 || quieter[0].id !== 'es-419-travel-record' || quieter[0].voice !== 'carlos-figueroa'
    || quieter[0].integratedLufs !== -23.67 || !same(quieter[0].limitingReasons, ['maximum_gain'])
    || !same(acceptance.acceptedNewQuieterClips, quieter))
    throw Error('Accepted quieter Travel level 5 recording changed.')
  const copies = [], images = [], recordings = [], items = []
  for (const item of plan.items) {
    const authored = draft.items.find(row => row.id === item.id)
    const picture = media.images.find(row => row.id === item.id)
    const selected = art.items.find(row => row.id === item.id)
    if (!authored || !picture || !selected || ['path', 'sha256', 'source', 'version'].some(key => picture[key] !== selected[key]))
      throw Error('Travel level 5 picture identity changed.')
    const bytes = await read(picture.path)
    if (hash(bytes) !== picture.sha256 || bytes.length !== selected.bytes) throw Error('Accepted Travel picture bytes changed.')
    let imageSrc
    if (picture.source === 'generated') {
      if (picture.path !== `${ART}/originals/${authored.slug}-v${picture.version}.png`) throw Error('Unsafe generated Travel picture path.')
      const pixels = inspectPngAlpha(bytes)
      if (!pixels.transparentPixels || !pixels.opaquePixels) throw Error('Travel PNG lost its transparent subject.')
      imageSrc = `images/approved/${item.id}-${picture.sha256.slice(0, 12)}.png`
      copies.push({ path: 'public/' + imageSrc, bytes })
    }
    else {
      if (picture.source !== 'reuse' || !/^public\/images\/approved\/[a-zA-Z0-9-]+\.(png|jpg)$/.test(picture.path)) throw Error('Unsafe reused Travel picture path.')
      imageSrc = picture.path.slice(7)
    }
    const audio = []
    for (const voice of plan.voices) {
      const clip = media.clips.find(row => row.id === item.id && row.voice === voice.voice)
      const limited = clip?.targetLimited === true && clip.after?.integratedLufs < -22.25
        && Array.isArray(clip.limitingReasons) && clip.limitingReasons.length > 0
        && clip.limitingReasons.every(reason => ['maximum_gain', 'true_peak_headroom', 'encoded_loudness_resolution'].includes(reason))
      if (!clip || clip.text !== item.text || clip.spelling !== item.spelling || clip.meaning !== item.meaning
        || clip.voiceId !== voice.id || clip.voiceName !== voice.name || clip.region !== voice.region || clip.locale !== voice.locale
        || clip.file !== `audio/${voice.voice}/${item.id}.mp3` || clip.originalFile !== `originals/${voice.voice}/${item.id}.mp3`
        || clip.request?.text !== item.text || clip.request.model_id !== plan.model || clip.request.language_code !== 'es'
        || !same(clip.request.voice_settings, plan.voiceSettings) || !validHash(clip.originalSha256) || !validHash(clip.deliverySha256)
        || !Number.isSafeInteger(clip.originalBytes) || clip.originalBytes <= 0 || !Number.isSafeInteger(clip.deliveryBytes) || clip.deliveryBytes <= 0
        || !Number.isSafeInteger(clip.decodedFrames) || clip.decodedFrames <= 0
        || !Number.isFinite(clip.gainDb) || clip.gainDb > 9 || !Number.isFinite(clip.after?.truePeakDbtp) || clip.after.truePeakDbtp > -2
        || !Number.isFinite(clip.after?.integratedLufs) || typeof clip.targetLimited !== 'boolean'
        || (clip.targetLimited && !limited) || (!clip.targetLimited && !same(clip.limitingReasons, []))
        || (Math.abs(clip.after.integratedLufs + 22) > .25 && !limited))
        throw Error('Travel recording identity or playback profile changed.')
      const sourcePath = REVIEW + '/' + clip.file
      const audioBytes = await read(sourcePath)
      if (hash(audioBytes) !== clip.deliverySha256 || audioBytes.length !== clip.deliveryBytes) throw Error('Accepted Travel recording bytes changed.')
      const src = `audio/es-419-travel-5/${voice.voice}/${item.id}.mp3`
      copies.push({ path: 'public/' + src, bytes: audioBytes })
      audio.push({ src, source: 'synthesized', voice: voice.voice, voiceName: voice.name })
      recordings.push({ id: item.id, voice: voice.voice, src, sha256: clip.deliverySha256, bytes: audioBytes.length, sourcePath, source: 'new-generation', originalSha256: clip.originalSha256, targetLimited: clip.targetLimited, limitingReasons: clip.limitingReasons, gainDb: clip.gainDb, after: clip.after })
    }
    items.push({ id: item.id, language: 'es-419', theme: 'travel', label: item.meaning, text: item.text, image: { src: imageSrc, source: 'generated', alt: item.meaning }, audio })
    images.push({ id: item.id, src: imageSrc, sha256: picture.sha256, bytes: bytes.length, sourcePath: picture.path, source: picture.source, ...(picture.version ? { version: picture.version } : {}) })
  }
  if (copies.length !== 322 || copies.filter(row => row.path.startsWith('public/images/')).length !== 34)
    throw Error('Travel staging would duplicate or omit accepted assets.')
  const bank = { id: 'es-419-travel-5', language: 'es-419', title: 'Travel level 5', status: 'approved', items }
  const activation = {
    issue: 243, pack: bank.id, language: bank.language, acceptance: ACCEPTANCE, acceptanceSha256: hash(acceptanceBytes),
    words: 36, newWords: 36, sharedItemIds: [], voices: media.voices, generatedImages: 34, reusedImages: 2,
    newRecordings: 288, reusedRecordings: 0, copiedFiles: 322, images, recordings,
  }
  const outputs = [...copies,
    { path: 'content/es-419-travel-5.json', bytes: Buffer.from(JSON.stringify(bank, null, 2) + '\n') },
    { path: DATA + '/activation.json', bytes: Buffer.from(JSON.stringify(activation, null, 2) + '\n') },
  ]
  const protectedPaths = new Set([...inputBytes.keys(), ...media.images.map(image => image.path)])
  // Validate every destination and late source before the first write. Identical reruns are safe.
  for (const output of outputs) {
    if (protectedPaths.has(output.path)) throw Error('Travel staging cannot overwrite accepted source files.')
    await checkedPath(root, output.path)
    try {
      const current = await read(output.path)
      if (!current.equals(output.bytes)) throw Error('Existing Travel staging destination differs: ' + output.path)
      output.exists = true
    }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  for (const output of outputs) {
    if (output.exists) continue
    await mkdir(dirname(join(root, output.path)), { recursive: true })
    await writeFile(join(root, output.path), output.bytes, { flag: 'wx' })
  }
  return { words: 36, images: 36, recordings: 288, newImages: 34, reusedImages: 2, newRecordings: 288, reusedRecordings: 0, copiedFiles: 322 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  stageSpanishTravelLevel5().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1 })
