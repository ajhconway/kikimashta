/** Activate only the owner's exact accepted Spanish media set (#159). No network. */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectPngAlpha } from './png-alpha.mjs'
import { reviewedAudio } from './reviewed-audio.mjs'
import { reviewedImage } from './reviewed-image.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))

export function acceptedSpanishBank(art, review, voices) {
  if (art.items.length !== 36 || review.items.length !== 36 || review.clips.length !== 288 || voices.length !== 8 ||
      new Set(art.items.map(i => i.id)).size !== 36 || new Set(voices.map(v => v.voice)).size !== 8) throw new Error('Expected the complete approved Spanish matrix.')
  const seen = new Set()
  const items = art.items.map(item => {
    const spoken = review.items.find(word => word.id === item.id)
    if (!/^es-419-travel-[a-z0-9-]+$/.test(item.id) || ['entrance', 'exit'].includes(item.slug) || spoken?.text !== item.text || spoken.meaning !== item.meaning) throw new Error('Artwork and reviewed words differ.')
    const audio = voices.map(voice => {
      const clip = review.clips.find(c => c.id === item.id && c.voice === voice.voice)
      const key = `${item.id}:${voice.voice}`
      if (!clip || seen.has(key) || clip.voiceId !== voice.id || clip.text !== item.text || clip.voice === 'cesar' ||
          clip.file !== `audio/${voice.voice}/${item.id}.mp3` || clip.request?.language_code !== 'es') throw new Error('Reviewed audio identity mismatch.')
      seen.add(key)
      return { src: `audio/es-419-travel-v2/${voice.voice}/${item.id}.mp3`, source: 'synthesized', voice: voice.voice, voiceName: voice.name }
    })
    const picture = item.artwork
    const src = picture.status === 'reuse-approved' ? picture.sourcePath.replace(/^public\//, '')
      : `images/approved/${item.id}-${picture.sha256.slice(0, 12)}.png`
    if (!src.startsWith('images/') || src.includes('..')) throw new Error('Unsafe approved picture path.')
    return { id: item.id, language: 'es-419', theme: 'travel', label: item.meaning, text: item.text,
      image: { src, source: 'generated', alt: item.meaning }, audio,
      ...(['car', 'taxi'].includes(item.slug) ? { pictureDistractorExclusions: [`es-419-travel-${item.slug === 'car' ? 'taxi' : 'car'}`] } : {}) }
  })
  if (seen.size !== 288 || review.clips.some(clip => !seen.has(`${clip.id}:${clip.voice}`))) throw new Error('Unknown or duplicated reviewed recording.')
  return { id: 'es-419-travel-1', language: 'es-419', title: 'Travel level 1', status: 'approved', items }
}

export async function stageSpanishTravelPack({ root = process.cwd() } = {}) {
  const acceptance = await json(join(root, 'content/spanish-travel-audio/acceptance.json'))
  if (acceptance.issue !== 159 || acceptance.status !== 'accepted-for-activation' || acceptance.words !== 36 || acceptance.recordings !== 288 || acceptance.voices !== 8 ||
      acceptance.artworkManifest !== 'artifacts/spanish-travel-art/manifest.json' || acceptance.audioReviewManifest !== 'artifacts/spanish-travel-audio-review/manifest.json') throw new Error('Owner acceptance is missing or incomplete.')
  const [artBytes, audioBytes, config, feedback] = await Promise.all([
    readFile(join(root, acceptance.artworkManifest)), readFile(join(root, acceptance.audioReviewManifest)),
    json(join(root, 'content/es-419-voices.json')), json(join(root, 'artifacts/spanish-travel-art/owner-feedback.json')),
  ])
  if (hash(artBytes) !== acceptance.artworkManifestSha256 || hash(audioBytes) !== acceptance.audioReviewSha256) throw new Error('Accepted media manifest changed.')
  const art = JSON.parse(artBytes), review = JSON.parse(audioBytes)
  if (JSON.stringify(config.voices) !== JSON.stringify(review.voices)) throw new Error('Accepted voice registry changed.')
  const bank = acceptedSpanishBank(art, review, config.voices)
  const publicRoot = await realpath(join(root, 'public'))
  // Existing directory or file symlinks must not redirect any production write.
  for (const path of bank.items.flatMap(item => [item.image.src, ...item.audio.map(clip => clip.src)])) {
    let component = publicRoot
    for (const segment of path.split('/')) {
      component = join(component, segment)
      try {
        if ((await lstat(component)).isSymbolicLink()) throw new Error('Production media target escapes public/.')
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        break
      }
    }
    const target = resolve(publicRoot, path)
    let ancestor = target
    for (;;) {
      try {
        const actual = resolve(await realpath(ancestor), relative(ancestor, target))
        const within = relative(publicRoot, actual)
        if (!within || within === '..' || within.startsWith('../') || isAbsolute(within)) throw new Error('Production media target escapes public/.')
        break
      } catch (error) {
        if (error.code !== 'ENOENT' || ancestor === dirname(ancestor)) throw error
        ancestor = dirname(ancestor)
      }
    }
  }
  const approvedPictures = new Map(feedback.finalApproval.selectedImages.map(i => [i.id, i]))
  const images = [], recordings = [], copies = []
  // Complete preflight before any production copy or bank change.
  for (const item of bank.items) {
    const entry = art.items.find(i => i.id === item.id), picture = entry.artwork
    if (!picture.path.startsWith('artifacts/spanish-travel-art/') || picture.path.includes('..') ||
        !['owner-approved', 'reuse-approved'].includes(picture.status) || approvedPictures.get(item.id)?.sha256 !== picture.sha256) throw new Error('Picture approval changed.')
    const { bytes } = reviewedImage({ root, reviewPath: picture.path, productionPath: 'public/' + item.image.src,
      sha256: picture.sha256, message: 'Approved image hash mismatch.' })
    if (picture.status !== 'reuse-approved') {
      const alpha = inspectPngAlpha(bytes)
      if (!alpha.transparentPixels || !alpha.opaquePixels) throw new Error('Approved PNG lost transparency or subject.')
    } else if (hash(await readFile(join(root, 'public', item.image.src))) !== picture.sha256) throw new Error('Reused image changed.')
    images.push({ id: item.id, src: item.image.src, sha256: picture.sha256, sourcePath: picture.path })
    copies.push({ path: 'public/' + item.image.src, bytes })
    for (const audio of item.audio) {
      const clip = review.clips.find(c => c.id === item.id && c.voice === audio.voice)
      const sourcePath = `artifacts/spanish-travel-audio-review/${clip.file}`
      const { bytes } = await reviewedAudio({ root, reviewPath: sourcePath, productionPath: 'public/' + audio.src,
        sha256: clip.deliverySha256, size: clip.deliveryBytes, message: 'Accepted recording hash mismatch.' })
      copies.push({ path: 'public/' + audio.src, bytes })
      recordings.push({ id: item.id, voice: audio.voice, src: audio.src, sha256: clip.deliverySha256, bytes: clip.deliveryBytes,
        originalSha256: clip.originalSha256, sourcePath, targetLimited: clip.targetLimited, after: clip.after })
    }
  }
  for (const copy of copies) {
    const target = join(root, copy.path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, copy.bytes)
  }
  const activation = { issue: 159, pack: bank.id, language: bank.language, acceptance: 'content/spanish-travel-audio/acceptance.json',
    acceptanceSha256: hash(await readFile(join(root, 'content/spanish-travel-audio/acceptance.json'))),
    words: bank.items.length, voices: config.voices, recordings, images,
    retiredItemIds: ['es-419-travel-entrance', 'es-419-travel-exit'] }
  await writeFile(join(root, 'content/es-419.json'), JSON.stringify(bank, null, 2) + '\n')
  await writeFile(join(root, 'content/spanish-travel-audio/activation.json'), JSON.stringify(activation, null, 2) + '\n')
  return { words: bank.items.length, voices: config.voices.length, recordings: recordings.length, images: images.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  stageSpanishTravelPack().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1 })
}
