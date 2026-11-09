/** Stage the exact owner-accepted Basic Spanish media (#191). No network. */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildBasicMediaReview } from './build-spanish-basic-level-1-media-review.mjs'

const ART = 'artifacts/spanish-basic-1-art'
const AUDIO = 'artifacts/spanish-basic-1-audio-review'
const ACCEPTANCE = 'content/spanish-basic-1/acceptance.json'
const hash = b => createHash('sha256').update(b).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
async function rejectSymlink(root, path) {
  let current = root
  for (const part of path.split('/')) {
    current = join(current, part)
    try { if ((await lstat(current)).isSymbolicLink()) throw Error('Staging target contains a symlink.') }
    catch (e) { if (e.code !== 'ENOENT') throw e }
  }
}

export async function stageSpanishBasicLevel1({ root = process.cwd() } = {}) {
  const acceptedBytes = await readFile(join(root, ACCEPTANCE)), acceptance = JSON.parse(acceptedBytes)
  if (acceptance.issue !== 191 || acceptance.pack !== 'es-419-basic-1' || acceptance.language !== 'es-419' ||
      acceptance.status !== 'accepted-for-activation' || !acceptance.ownerMessage || acceptance.words !== 24 ||
      acceptance.images !== 15 || acceptance.recordings !== 336 || acceptance.contexts !== 9 || acceptance.voices !== 8) throw Error('Complete owner acceptance is required.')
  const files = { draft: 'content/spanish-basic-1/draft.json', artwork: ART + '/manifest.json', audio: AUDIO + '/manifest.json' }
  const input = {}
  for (const [key, path] of Object.entries(files)) {
    const bytes = await readFile(join(root, path))
    if (acceptance[key + 'Path'] !== path || hash(bytes) !== acceptance[key + 'Sha256']) throw Error('Accepted media manifest or draft changed.')
    input[key] = JSON.parse(bytes)
  }
  // Reuse the complete provenance and approved matrix validator before production writes.
  // This only refreshes identical review files on success.
  await buildBasicMediaReview(root)
  if (hash(await readFile(join(root, files.artwork))) !== acceptance.artworkSha256) throw Error('Accepted artwork selection changed.')
  const { draft, artwork, audio } = input
  const voices = (await json(join(root, 'content/es-419-voices.json'))).voices
  if (artwork.audioManifestSha256 !== acceptance.audioSha256 || !same(audio.voices, voices)) throw Error('Accepted voices or linked audio changed.')
  const clips = new Map(audio.clips.map(c => [c.id + ':' + c.voice, c]))
  const audioFor = id => voices.map(v => ({ src: `audio/es-419-basic-1/${v.voice}/${id}.mp3`, source: 'synthesized', voice: v.voice, voiceName: v.name }))
  const items = draft.items.filter(i => i.practice.kind === 'picture').map(item => {
    const image = artwork.images.find(i => i.id === item.id)
    const src = image.source === 'approved-reuse' ? image.path.slice(7) : `images/approved/${item.id}-${image.sha256.slice(0, 12)}.png`
    return { id: item.id, language: 'es-419', theme: 'basic', label: item.meaning, text: item.text,
      image: { src, source: 'generated', alt: item.meaning }, audio: audioFor(item.id) }
  })
  const foundationVocabulary = draft.items.filter(i => i.practice.kind === 'contextual').map(i => ({
    id: i.id, text: i.text, reading: i.text, meaning: i.meaning, audio: audioFor(i.id),
  }))
  if (items.length !== 15 || foundationVocabulary.length !== 9) throw Error('Accepted picture/foundation scope changed.')
  const bank = { id: draft.id, language: draft.language, title: draft.title, status: 'approved', items, foundationVocabulary }
  const bankPath = 'content/es-419-basic-1.json', activationPath = 'content/spanish-basic-1/activation.json'
  const copies = [], images = [], recordings = []
  for (const item of items) {
    const image = artwork.images.find(i => i.id === item.id), bytes = await readFile(join(root, image.path))
    if (hash(bytes) !== image.sha256) throw Error('Accepted image bytes changed.')
    if (image.source === 'generated') copies.push({ path: 'public/' + item.image.src, bytes })
    images.push({ id: item.id, src: item.image.src, sha256: image.sha256, bytes: bytes.length, sourcePath: image.path,
      source: image.source, ...(image.version ? { version: image.version } : {}) })
  }
  for (const spoken of audio.items) for (const voice of voices) {
    const c = clips.get(spoken.id + ':' + voice.voice)
    const expectedLimited = (c.id === 'es-419-basic-go' && c.voice === 'carlos-figueroa') || (c.id === 'es-419-basic-hunger' && c.voice === 'juan')
    if (!Number.isFinite(c.gainDb) || c.gainDb > 9 || !Number.isFinite(c.after?.truePeakDbtp) || c.after.truePeakDbtp > -2 ||
        !Number.isFinite(c.after?.integratedLufs) || (expectedLimited ? c.targetLimited !== true : c.targetLimited !== false || Math.abs(c.after.integratedLufs + 22) > 0.25)) throw Error('Accepted playback profile changed.')
    const sourcePath = AUDIO + '/' + c.file, bytes = await readFile(join(root, sourcePath))
    if (hash(bytes) !== c.deliverySha256 || bytes.length !== c.deliveryBytes) throw Error('Accepted recording bytes changed.')
    const src = `audio/es-419-basic-1/${voice.voice}/${spoken.id}.mp3`
    copies.push({ path: 'public/' + src, bytes })
    recordings.push({ id: spoken.id, role: spoken.role, targetItemId: spoken.targetItemId, voice: voice.voice, src,
      sha256: c.deliverySha256, bytes: bytes.length, originalSha256: c.originalSha256, sourcePath,
      targetLimited: c.targetLimited, limitingReasons: c.limitingReasons, gainDb: c.gainDb, after: c.after })
  }
  for (const path of [bankPath, activationPath, ...copies.map(c => c.path)]) await rejectSymlink(root, path)
  for (const c of copies) { await mkdir(dirname(join(root, c.path)), { recursive: true }); await writeFile(join(root, c.path), c.bytes) }
  const activation = { issue: 191, pack: draft.id, language: draft.language, acceptance: ACCEPTANCE, acceptanceSha256: hash(acceptedBytes),
    words: 24, pictureWords: 15, foundationWords: 9, contexts: 9, voices, images, recordings }
  await mkdir(dirname(join(root, bankPath)), { recursive: true })
  await writeFile(join(root, bankPath), JSON.stringify(bank, null, 2) + '\n')
  await writeFile(join(root, activationPath), JSON.stringify(activation, null, 2) + '\n')
  return { words: 24, pictureWords: items.length, foundationWords: foundationVocabulary.length, images: images.length, recordings: recordings.length, voices: voices.length }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) stageSpanishBasicLevel1().then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e.message); process.exitCode = 1 })
