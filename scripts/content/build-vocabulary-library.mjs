/** Build the static vocabulary review library (#27, #86). No network calls. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRoot = fileURLToPath(new URL('../../', import.meta.url))
const nonempty = value => typeof value === 'string' && value.trim().length > 0

/** Catalogue paths are relative to the app root; the library lives one directory below it. */
export function libraryMediaPath(value, family) {
  if (!nonempty(value) || !value.startsWith(`${family}/`) ||
      value.split('/').some(segment => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(segment))) {
    throw new Error(`Unsafe ${family} media path: ${String(value)}`)
  }
  if (family === 'images' && !/\.(svg|jpg|png|webp)$/.test(value)) throw new Error(`Unsupported library image format: ${value}`)
  if (family === 'audio' && !value.endsWith('.mp3')) throw new Error(`Library audio must be MP3: ${value}`)
  return `../${value}`
}

/** Emit library data while preserving the authored HTML shell. Missing active audio is never marked available. */
export function buildLibrary({ root = defaultRoot, allowMissingAudio = false } = {}) {
  const catalog = JSON.parse(readFileSync(join(root, 'content/catalog/ja.json'), 'utf8'))
  if (!Array.isArray(catalog.items) || catalog.items.length === 0) throw new Error('Catalogue has no items')
  const overridesPath = join(root, 'content/catalog/review-overrides.json')
  const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, 'utf8')) : {}
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Review overrides must be an object')
  for (const [id, override] of Object.entries(overrides)) {
    if (!override || typeof override !== 'object' || Array.isArray(override) ||
        Object.keys(override).some(key => !['teachingNote', 'visualGroup', 'removalReason'].includes(key) || !nonempty(override[key]))) {
      throw new Error(`Invalid review override: ${id}`)
    }
  }
  const visualDirectory = join(root, 'content/visuals')
  const visuals = new Map()
  for (const file of readdirSync(visualDirectory).filter(file => file.endsWith('.json')).sort()) {
    const entries = JSON.parse(readFileSync(join(visualDirectory, file), 'utf8'))
    if (!Array.isArray(entries)) throw new Error(`Visual metadata must be an array: ${file}`)
    for (const entry of entries) {
      if (!nonempty(entry.id) || visuals.has(entry.id)) throw new Error(`Missing or duplicate visual metadata ID: ${entry.id}`)
      visuals.set(entry.id, entry)
    }
  }
  const ids = new Set()
  const missingAudio = []
  const cards = catalog.items.map(item => {
    if (!nonempty(item.id) || !/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id)) throw new Error(`Missing or duplicate catalogue ID: ${item.id}`)
    ids.add(item.id)
    if (![1, 2, 3, 4, 5].includes(item.sourceLevel) || !['text', 'reading', 'meaning'].every(key => nonempty(item[key]))) {
      throw new Error(`Incomplete catalogue item: ${item.id}`)
    }
    const visual = visuals.get(item.id)
    if (!visual || !nonempty(visual.concept) || !nonempty(visual.visualGroup) || typeof visual.reviewRequired !== 'boolean' ||
        (visual.reviewRequired && !nonempty(visual.reviewNote))) throw new Error(`Incomplete visual metadata: ${item.id}`)
    const override = overrides[item.id] || {}
    if (override.removalReason) return null
    const imageSrc = libraryMediaPath(item.image?.src, 'images')
    if (!existsSync(join(root, 'public', item.image.src))) throw new Error(`Missing image: ${item.image.src}`)
    if (!Array.isArray(item.audio) || item.audio.length === 0) throw new Error(`Expected at least one audio recording: ${item.id}`)
    const voices = new Set()
    const audio = item.audio.map(clip => {
      if (!clip || !nonempty(clip.voice) || !/^[a-zA-Z0-9_-]+$/.test(clip.voice)) throw new Error(`Invalid audio voice: ${item.id}`)
      if (voices.has(clip.voice)) throw new Error(`Duplicate audio voice ${clip.voice}: ${item.id}`)
      voices.add(clip.voice)
      if (clip.voiceName !== undefined && !nonempty(clip.voiceName)) throw new Error(`Invalid audio voice name: ${item.id}`)
      const src = libraryMediaPath(clip.src, 'audio')
      const available = existsSync(join(root, 'public', clip.src))
      if (!available) missingAudio.push(clip.src)
      return { voice: clip.voice, ...(clip.voiceName !== undefined ? { voiceName: clip.voiceName } : {}), src, available }
    })
    return {
      id: item.id, text: item.text, reading: item.reading, meaning: item.meaning, sourceLevel: item.sourceLevel,
      image: { src: imageSrc, alt: item.image.alt || item.meaning }, audio,
      concept: item.reuseStarterAssets ? (item.image.alt || item.meaning) : visual.concept,
      visualGroup: override.visualGroup || visual.visualGroup, reviewRequired: visual.reviewRequired || Boolean(override.teachingNote),
      ...(override.teachingNote ? { teachingNote: override.teachingNote } : {}),
      ...(visual.reviewNote ? { reviewNote: visual.reviewNote } : {}),
    }
  }).filter(Boolean)
  for (const id of Object.keys(overrides)) if (!ids.has(id)) throw new Error(`Unknown review override ID: ${id}`)
  if (!allowMissingAudio && missingAudio.length) throw new Error(`Missing ${missingAudio.length} audio files; first: ${missingAudio[0]}. Use --allow-missing-audio only for a preview.`)
  const data = { cards }
  const directory = join(root, 'public/vocabulary')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'library-data.json'), JSON.stringify(data, null, 2) + '\n')
  return { cards: cards.length, availableAudio: cards.reduce((count, card) => count + card.audio.filter(clip => clip.available).length, 0), missingAudio: missingAudio.length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.some(arg => arg !== '--allow-missing-audio')) throw new Error('Usage: node scripts/content/build-vocabulary-library.mjs [--allow-missing-audio]')
  const result = buildLibrary({ allowMissingAudio: args.includes('--allow-missing-audio') })
  console.log(`Built ${result.cards} vocabulary cards; ${result.availableAudio} audio clips available, ${result.missingAudio} missing.`)
}
