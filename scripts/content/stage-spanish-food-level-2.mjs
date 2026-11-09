/** Stage the exact accepted Food level 2 media; reuse existing assets in place (#231). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectFoodLevel2Media } from './build-spanish-food-level-2-media-review.mjs'
import { inspectPngAlpha } from './png-alpha.mjs'
const FOOD = 'content/spanish-food-2'
const ACCEPTANCE = FOOD + '/acceptance.json'
const MEDIA = 'artifacts/spanish-food-2-media-review/manifest.json'
const hash = b => createHash('sha256').update(b).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const validHash = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s)
const QUIETER = []
const REQUIRED = [
  ...[
    'draft.json', 'artwork-acceptance.json', 'audio-config.json', 'audio-approval.json', 'audio-reuse.json', 'artwork-revisions-v1.json', 'generation-approval.json', 'proposal-v1.json'
  ].map(p => FOOD + '/' + p), 'content/es-419-voices.json', 'artifacts/spanish-food-2-art/manifest.json', 'artifacts/spanish-food-2-art/selection.json', 'artifacts/spanish-food-2-art/requests.json', 'artifacts/spanish-food-2-audio-review/manifest.json', 'artifacts/spanish-food-2-audio-review/normalization-summary.json', 'artifacts/spanish-food-2-audio-review/normalization-verification.json', MEDIA
]
async function noSymlink(root, path) {
  if (typeof path !== 'string'
    || !path
    || path.startsWith('/')
    || path.includes('\\')
    || path.split('/').some(p => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(p)))
    throw Error('Unsafe Food staging path.')
  let current = resolve(root)
  if ((await lstat(current)).isSymbolicLink())
    throw Error('Food staging paths cannot contain symlinks.')
  for (const part of path.split('/')) {
    current = join(current, part)
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw Error('Food staging paths cannot contain symlinks.')
    }
    catch (e) {
      if (e.code !== 'ENOENT')
        throw e
    }
  }
}
export async function stageSpanishFoodLevel2({ root = process.cwd() } = {}) {
  const read = async (path) => {
    await noSymlink(root, path)
    return readFile(join(root, path))
  }
  const acceptanceBytes = await read(ACCEPTANCE)
  const acceptance = JSON.parse(acceptanceBytes)
  if (acceptance.issue !== 231
    || acceptance.pack !== 'es-419-food-2'
    || acceptance.language !== 'es-419'
    || acceptance.status !== 'accepted-for-activation'
    || acceptance.ownerMessage !== "Let's ship. You can auto-merge"
    || acceptance.words !== 36
    || acceptance.images !== 36
    || acceptance.recordings !== 288
    || acceptance.voices !== 8
    || acceptance.newWords !== 31
    || acceptance.reusedWords !== 5
    || acceptance.generatedImages !== 32
    || acceptance.reusedImages !== 4
    || acceptance.newRecordings !== 248
    || acceptance.reusedRecordings !== 40
    || acceptance.combinedMediaManifest !== MEDIA
    || !same(acceptance.acceptedNewQuieterClips, QUIETER)
    || !acceptance.inputs)
    throw Error('Exact final Food owner acceptance is required.')
  const inputBytes = new Map()
  for (const [path, sha] of Object.entries(acceptance.inputs)) {
    const bytes = await read(path)
    if (!validHash(sha) || hash(bytes) !== sha)
      throw Error('Accepted Food input bytes changed: ' + path)
    inputBytes.set(path, bytes)
  }
  if (REQUIRED.some(p => !inputBytes.has(p)) || hash(inputBytes.get(MEDIA)) !== acceptance.combinedMediaManifestSha256)
    throw Error('Food final input bindings are incomplete.')
  const media = await inspectFoodLevel2Media(root)
  if (hash(JSON.stringify(media, null, 2) + '\n') !== acceptance.combinedMediaManifestSha256
    || inputBytes.get(MEDIA).toString() !== JSON.stringify(media, null, 2) + '\n')
    throw Error('Accepted Food media differs from current validated sources.')
  if (media.words !== 36
    || media.recordings !== 288
    || media.newRecordings !== 248
    || media.reusedRecordings !== 40
    || media.images.length !== 36
    || media.items.length !== 36
    || media.voices.length !== 8
    || new Set(media.items.map(i => i.id)).size !== 36
    || new Set(media.clips.map(c => c.id + ':' + c.voice)).size !== 288
    || media.images.filter(i => i.source === 'generated').length !== 32
    || media.images.filter(i => i.source === 'approved-reuse').length !== 4)
    throw Error('Accepted Food effective matrix changed.')
  if (!same(media.clips.filter(c => c.source === 'new-generation' && c.targetLimited).map(c => ({
    id: c.id, voice: c.voice, sha256: c.sha256, integratedLufs: c.after.integratedLufs, limitingReasons: c.limitingReasons
  })), QUIETER))
    throw Error('Accepted new quieter Food recordings changed.')
  for (const [path, sha] of Object.entries(media.inputs))
    if (acceptance.inputs[path] !== sha)
      throw Error('Unbound current Food input.')
  const draft = JSON.parse(inputBytes.get(FOOD + '/draft.json'))
  const reuse = JSON.parse(inputBytes.get(FOOD + '/audio-reuse.json'))
  const banks = new Map()
  for (const source of reuse.sources) {
    if (!inputBytes.has(source.bank) || !inputBytes.has(source.activation) || !inputBytes.has(source.acceptance))
      throw Error('Unbound accepted Food source.')
    banks.set(source.bank, JSON.parse(inputBytes.get(source.bank)))
  }
  const snapshots = new Map([...banks.keys()].map(p => [p, inputBytes.get(p)]))
  const art = JSON.parse(inputBytes.get('artifacts/spanish-food-2-art/manifest.json'))
  const artworkAcceptance = JSON.parse(inputBytes.get(FOOD + '/artwork-acceptance.json'))
  const replacement = art.sharedReplacement
  if (!replacement
    || replacement.source !== 'generated'
    || replacement.targets.length !== 3
    || !same(replacement, artworkAcceptance.sharedReplacement)
    || !same(replacement, acceptance.sharedReplacement))
    throw Error('Accepted shared glass replacement changed.')
  const japanesePath = 'content/ja.json'
  const japaneseBytes = await read(japanesePath)
  const japanese = JSON.parse(japaneseBytes)
  snapshots.set(japanesePath, japaneseBytes)
  const originalGlass = draft.items.find(i => i.id === 'es-419-travel-drinking-glass')
  const legacyGlass = japanese.items.find(i => i.id === 'ja-cup')
  if (!originalGlass
    || !legacyGlass
    || 'public/' + legacyGlass.image.src !== replacement.supersedes
    || originalGlass.artwork.path !== replacement.supersedes)
    throw Error('Legacy shared glass source mapping changed.')
  const legacyGlassBytes = await read(replacement.supersedes)
  if (hash(legacyGlassBytes) !== replacement.supersedesSha256)
    throw Error('Historical shared glass bytes changed.')
  snapshots.set(replacement.supersedes, legacyGlassBytes)
  const copies = []
  const images = []
  const recordings = []
  const items = []
  for (const selected of media.items) {
    const authored = draft.items.find(i => i.id === selected.id)
    const picture = media.images.find(i => i.id === selected.id)
    if (!authored || !picture || picture.text !== selected.text || picture.meaning !== selected.meaning)
      throw Error('Food picture membership changed.')
    const imageBytes = await read(picture.path)
    if (hash(imageBytes) !== picture.sha256 || imageBytes.length !== picture.bytes)
      throw Error('Accepted Food image bytes changed.')
    let imageSrc
    if (picture.source === 'generated') {
      if (!/^artifacts\/spanish-food-2-art\/originals\/[a-z0-9-]+-v[1-9][0-9]*\.png$/.test(picture.path))
        throw Error('Unsafe generated Food image.')
      const pixels = inspectPngAlpha(imageBytes)
      if (pixels.width !== pixels.height || !pixels.transparentPixels || !pixels.opaquePixels)
        throw Error('Food PNG lost square alpha subject.')
      imageSrc = `images/approved/${selected.id}-${picture.sha256.slice(0, 12)}.png`
      copies.push({ path: 'public/' + imageSrc, bytes: imageBytes })
    }
    else {
      if (picture.source !== 'approved-reuse' || !/^public\/images\/approved\/[a-zA-Z0-9-]+\.(jpg|png)$/.test(picture.path))
        throw Error('Unsafe Food image reuse.')
      imageSrc = picture.path.slice(7)
    }
    const sourceWord = authored.membership === 'existing-spanish-item' ? banks.get(authored.existingBank)?.items.find(i => i.id === selected.id) : undefined
    if (authored.membership === 'existing-spanish-item'
      && (!sourceWord
        || sourceWord.text !== selected.text
        || sourceWord.label !== selected.meaning
        || !same(sourceWord.audio.map(a => a.voice), media.voices.map(v => v.voice))))
      throw Error('Shared Food item metadata changed.')
    if (sourceWord && selected.id !== 'es-419-travel-drinking-glass' && sourceWord.image.src !== imageSrc)
      throw Error('Only the accepted drinking glass may override a shared picture.')
    const bankAudio = []
    for (const voice of media.voices) {
      const clip = media.clips.find(c => c.id === selected.id && c.voice === voice.voice)
      if (!clip)
        throw Error('Missing Food recording.')
      const bytesPath = clip.path
      const bytesSize = clip.bytes
      const bytes = await read(bytesPath)
      if (hash(bytes) !== clip.sha256 || bytes.length !== bytesSize)
        throw Error('Accepted Food recording bytes changed.')
      let src
      if (clip.source === 'new-generation') {
        if (sourceWord
          || !/^artifacts\/spanish-food-2-audio-review\/audio\/[a-z-]+\/es-419-food-[a-z-]+\.mp3$/.test(bytesPath))
          throw Error('Food generation/reuse membership changed.')
        src = `audio/es-419-food-2/${voice.voice}/${selected.id}.mp3`
        copies.push({ path: 'public/' + src, bytes })
        bankAudio.push({
          src, source: 'synthesized', voice: voice.voice, voiceName: voice.name
        })
      }
      else {
        const asset = sourceWord?.audio.find(a => a.voice === voice.voice)
        if (clip.source !== 'accepted-reuse' || !asset || bytesPath !== 'public/' + asset.src)
          throw Error('Accepted Food audio reuse changed.')
        src = asset.src
        bankAudio.push(structuredClone(asset))
      }
      recordings.push({
        id: selected.id, voice: voice.voice, src, sha256: clip.sha256, bytes: bytes.length, sourcePath: bytesPath, source: clip.source, originalSha256: clip.originalSha256, targetLimited: clip.targetLimited, limitingReasons: clip.limitingReasons, gainDb: clip.gainDb, after: clip.after
      })
    }
    const image = {
      src: imageSrc, source: 'generated', alt: selected.meaning
    }
    items.push(sourceWord ? { ...structuredClone(sourceWord), ...(selected.id === 'es-419-travel-drinking-glass' ? { image } : {}) } : {
      id: selected.id, language: 'es-419', theme: 'food', label: selected.meaning, text: selected.text, image, audio: bankAudio
    })
    images.push({
      id: selected.id, src: imageSrc, sha256: picture.sha256, bytes: imageBytes.length, sourcePath: picture.path, source: picture.source, ...(picture.version ? { version: picture.version } : {})
    })
  }
  if (copies.length !== 280
    || copies.filter(c => c.path.startsWith('public/audio/')).length !== 248
    || copies.filter(c => c.path.startsWith('public/images/')).length !== 32)
    throw Error('Food staging would duplicate accepted assets.')
  const bank = {
    id: 'es-419-food-2', language: 'es-419', title: 'Food level 2', status: 'approved', items
  }
  const bankPath = 'content/es-419-food-2.json'
  const activationPath = FOOD + '/activation.json'
  for (const path of [bankPath, activationPath, ...images.map(i => 'public/' + i.src), ...recordings.map(c => 'public/' + c.src)])
    await noSymlink(root, path)
  for (const [path, bytes] of snapshots)
    if (!(await read(path)).equals(bytes))
      throw Error('A shared source changed during staging preflight.')
  const protectedPaths = new Set([...snapshots.keys(), ...images.filter(i => i.source === 'approved-reuse').map(i => i.sourcePath), ...recordings.filter(c => c.source === 'accepted-reuse').map(c => c.sourcePath)])
  if (copies.some(c => protectedPaths.has(c.path)))
    throw Error('Food staging cannot overwrite shared source assets.')
  for (const c of copies) {
    await mkdir(dirname(join(root, c.path)), { recursive: true })
    await writeFile(join(root, c.path), c.bytes)
  }
  const glass = images.find(i => i.id === 'es-419-travel-drinking-glass')
  const sharedReplacement = {
    ...replacement, sourcePath: replacement.path, path: 'public/' + glass.src, src: glass.src,
    targets: replacement.targets.map(target => ({
      ...target, sourcePath: target.path, path: 'public/' + glass.src, src: glass.src
    }))
  }
  const activation = {
    issue: 231, pack: bank.id, language: bank.language, acceptance: ACCEPTANCE, acceptanceSha256: hash(acceptanceBytes), words: 36, newWords: 31, sharedItemIds: items.filter(i => i.id.startsWith('es-419-travel-')).map(i => i.id), voices: media.voices, generatedImages: 32, reusedImages: 4, newRecordings: 248, reusedRecordings: 40, copiedFiles: 280, sharedReplacement, images, recordings
  }
  await writeFile(join(root, bankPath), JSON.stringify(bank, null, 2) + '\n')
  await writeFile(join(root, activationPath), JSON.stringify(activation, null, 2) + '\n')
  return {
    words: 36, images: 36, recordings: 288, newImages: 32, newRecordings: 248, reusedImages: 4, reusedRecordings: 40, copiedFiles: 280
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  stageSpanishFoodLevel2().then(r => console.log(JSON.stringify(r))).catch(e => {
    console.error(e.message)
    process.exitCode = 1
  })
