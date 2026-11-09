/** Stage only the owner's accepted level 2 media bytes (#166). No network. */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectPngAlpha } from './png-alpha.mjs'

const ART = 'artifacts/spanish-travel-2-art'
const AUDIO = 'artifacts/spanish-travel-2-audio-review'
const ACCEPTANCE = 'content/spanish-travel-2/acceptance.json'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

export function acceptedSpanishLevel2Bank(art, review, voices) {
  if (art.issue !== 166 || art.pack !== 'es-419-travel-2' || review.issue !== 166 || review.pack !== art.pack ||
      review.language !== 'es-419' || review.provider !== 'ElevenLabs' || review.model !== 'eleven_v4' ||
      art.images.length !== 36 || review.items.length !== 36 || review.clips.length !== 288 || voices.length !== 8 ||
      new Set(art.images.map(i => i.id)).size !== 36 || new Set(review.items.map(i => i.id)).size !== 36 ||
      new Set(voices.map(v => v.voice)).size !== 8 || !same(review.voices, voices)) throw new Error('Expected the accepted level 2 word and voice matrix.')
  const clips = new Map()
  for (const clip of review.clips) {
    const key = `${clip.id}:${clip.voice}`
    if (clips.has(key)) throw new Error('Duplicated reviewed recording.')
    clips.set(key, clip)
  }
  const seen = new Set()
  const items = art.images.map(picture => {
    const spoken = review.items.find(word => word.id === picture.id)
    if (!/^[a-z0-9-]+$/.test(picture.slug) || picture.id !== `es-419-travel-${picture.slug}` ||
        spoken?.text !== picture.text || spoken.meaning !== picture.meaning || !validHash(picture.sha256) ||
        !Number.isSafeInteger(picture.bytes) || picture.bytes <= 0) throw new Error('Artwork and accepted words differ.')
    let src
    if (picture.source === 'generated') {
      if (!Number.isSafeInteger(picture.version) || picture.version < 1 || picture.file !== `originals/${picture.slug}-v${picture.version}.png`) throw new Error('Unsafe generated picture path.')
      src = `images/approved/${picture.id}-${picture.sha256.slice(0, 12)}.png`
    } else if (picture.source === 'approved-reuse') {
      if (picture.file !== `reused/${picture.slug}.jpg` || !/^public\/images\/approved\/[a-z0-9-]+\.jpg$/.test(picture.sourcePath) ||
          picture.evidence !== 'content/card-regeneration/activation.json') throw new Error('Unsafe approved picture reuse.')
      src = picture.sourcePath.slice(7)
    } else throw new Error('Unaccepted picture source.')
    const audio = voices.map(voice => {
      const key = `${picture.id}:${voice.voice}`, clip = clips.get(key)
      if (!clip || !/^[a-z0-9-]+$/.test(voice.voice) || clip.voiceId !== voice.id || clip.voiceName !== voice.name ||
          clip.text !== picture.text || clip.meaning !== picture.meaning || clip.request?.text !== picture.text ||
          clip.request?.model_id !== review.model || clip.request?.language_code !== 'es' ||
          clip.request?.voice_settings?.stability !== 0.5 || clip.request?.voice_settings?.similarity_boost !== 0.75 ||
          clip.file !== `audio/${voice.voice}/${picture.id}.mp3` || !validHash(clip.deliverySha256) || !validHash(clip.originalSha256) ||
          !Number.isSafeInteger(clip.deliveryBytes) || clip.deliveryBytes <= 0 || clip.targetLimited !== false ||
          !Number.isFinite(clip.after?.integratedLufs) || Math.abs(clip.after.integratedLufs + 22) > 0.25 ||
          !Number.isFinite(clip.after?.truePeakDbtp) || clip.after.truePeakDbtp > -2) throw new Error('Accepted recording identity or playback profile changed.')
      seen.add(key)
      return { src: `audio/es-419-travel-2/${voice.voice}/${picture.id}.mp3`, source: 'synthesized', voice: voice.voice, voiceName: voice.name }
    })
    return { id: picture.id, language: 'es-419', theme: 'travel', label: picture.meaning, text: picture.text,
      image: { src, source: 'generated', alt: picture.meaning }, audio }
  })
  if (seen.size !== 288 || [...clips.keys()].some(key => !seen.has(key)) ||
      new Set(items.map(i => i.text)).size !== 36 || art.images.filter(i => i.source === 'generated').length !== 34 ||
      art.images.find(i => i.slug === 'stairs')?.version !== 5) throw new Error('Accepted level 2 selection changed.')
  return { id: 'es-419-travel-2', language: 'es-419', title: 'Travel level 2', status: 'approved', items }
}

async function rejectSymlinkTarget(root, file) {
  let current = root
  for (const part of file.split('/')) {
    current = join(current, part)
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Staging target contains a symlink.') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}

export async function stageSpanishTravelLevel2({ root = process.cwd() } = {}) {
  const acceptanceBytes = await readFile(join(root, ACCEPTANCE)), acceptance = JSON.parse(acceptanceBytes)
  if (acceptance.issue !== 166 || acceptance.pack !== 'es-419-travel-2' || acceptance.language !== 'es-419' ||
      acceptance.status !== 'accepted-for-activation' || !acceptance.ownerMessage || acceptance.words !== 36 ||
      acceptance.recordings !== 288 || acceptance.voices !== 8 || acceptance.images !== 36 || acceptance.selectedStairsVersion !== 5 ||
      acceptance.artworkManifest !== `${ART}/manifest.json` || acceptance.audioReviewManifest !== `${AUDIO}/manifest.json`) throw new Error('Complete owner acceptance is required.')
  const [artBytes, reviewBytes, registry, draft, approvedReuse] = await Promise.all([
    readFile(join(root, acceptance.artworkManifest)), readFile(join(root, acceptance.audioReviewManifest)),
    json(join(root, 'content/es-419-voices.json')), json(join(root, 'content/spanish-travel-2/draft.json')),
    json(join(root, 'content/card-regeneration/activation.json')),
  ])
  if (hash(artBytes) !== acceptance.artworkManifestSha256 || hash(reviewBytes) !== acceptance.audioReviewSha256) throw new Error('Accepted media manifest changed.')
  const art = JSON.parse(artBytes), review = JSON.parse(reviewBytes)
  if (art.audioManifestSha256 !== acceptance.audioReviewSha256 || draft.id !== acceptance.pack || draft.language !== 'es-419' ||
      !same(draft.items.map(({ id, text, meaning }) => ({ id, text, meaning })), review.items.map(({ id, text, meaning }) => ({ id, text, meaning })))) throw new Error('Accepted word list or linked audio review changed.')
  const bank = acceptedSpanishLevel2Bank(art, review, registry.voices)
  const bankPath = 'content/es-419-travel-2.json', activationPath = 'content/spanish-travel-2/activation.json'
  // Check every destination, including dangling symlinks, before any write.
  for (const file of [bankPath, activationPath, ...bank.items.flatMap(i => ['public/' + i.image.src, ...i.audio.map(c => 'public/' + c.src)])]) await rejectSymlinkTarget(root, file)
  const images = [], recordings = [], copies = []
  // Keep validated bytes in memory: later copies cannot race a changed source.
  for (const item of bank.items) {
    const picture = art.images.find(i => i.id === item.id), sourcePath = `${ART}/${picture.file}`
    const bytes = await readFile(join(root, sourcePath))
    if (hash(bytes) !== picture.sha256 || bytes.length !== picture.bytes) throw new Error('Accepted image bytes changed.')
    if (picture.source === 'generated') {
      const pixels = inspectPngAlpha(bytes)
      if (!pixels.transparentPixels || !pixels.opaquePixels || pixels.width !== pixels.height) throw new Error('Accepted PNG lost transparency or subject.')
      copies.push({ path: 'public/' + item.image.src, bytes })
    } else {
      const entry = approvedReuse.assets.find(i => i.id === picture.sourceId && i.path === picture.sourcePath)
      if (!entry || entry.sha256 !== picture.sha256 || hash(await readFile(join(root, picture.sourcePath))) !== picture.sha256) throw new Error('Approved source picture changed.')
    }
    images.push({ id: item.id, src: item.image.src, sha256: picture.sha256, bytes: bytes.length, sourcePath,
      source: picture.source, ...(picture.version ? { version: picture.version } : {}) })
    for (const audio of item.audio) {
      const clip = review.clips.find(c => c.id === item.id && c.voice === audio.voice), sourcePath = `${AUDIO}/${clip.file}`
      const bytes = await readFile(join(root, sourcePath))
      if (hash(bytes) !== clip.deliverySha256 || bytes.length !== clip.deliveryBytes) throw new Error('Accepted recording bytes changed.')
      copies.push({ path: 'public/' + audio.src, bytes })
      recordings.push({ id: item.id, voice: audio.voice, src: audio.src, sha256: clip.deliverySha256, bytes: bytes.length,
        originalSha256: clip.originalSha256, sourcePath, targetLimited: clip.targetLimited, after: clip.after })
    }
  }
  for (const copy of copies) { await mkdir(dirname(join(root, copy.path)), { recursive: true }); await writeFile(join(root, copy.path), copy.bytes) }
  const activation = { issue: 166, pack: bank.id, language: bank.language, acceptance: ACCEPTANCE, acceptanceSha256: hash(acceptanceBytes),
    words: bank.items.length, voices: registry.voices, images, recordings }
  await mkdir(dirname(join(root, activationPath)), { recursive: true })
  await writeFile(join(root, bankPath), JSON.stringify(bank, null, 2) + '\n')
  await writeFile(join(root, activationPath), JSON.stringify(activation, null, 2) + '\n')
  return { words: bank.items.length, images: images.length, recordings: recordings.length, voices: registry.voices.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  stageSpanishTravelLevel2().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1 })
}
