/** Build the static vocabulary review library (#27). No network calls. */
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
  if (family === 'images' && !value.endsWith('.svg')) throw new Error(`Library images must be SVG: ${value}`)
  if (family === 'audio' && !value.endsWith('.mp3')) throw new Error(`Library audio must be MP3: ${value}`)
  return `../${value}`
}

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#fff0dc">
  <title>Vocabulary cards</title>
  <link rel="stylesheet" href="/vocabulary/library.css">
  <script src="./library.js" type="module"></script>
</head>
<body>
  <main>
    <header class="page-header">
      <a class="home-link" href="../">← Listening practice</a>
      <h1>Vocabulary cards</h1>
      <p>Browse pictures and compare two Japanese voices. Source levels are provisional.</p>
    </header>
    <form class="filters" role="search" aria-label="Find vocabulary" id="filters">
      <label>Provisional level
        <select id="level" name="level">
          <option value="all">All levels</option>
          <option value="1">Level 1</option><option value="2">Level 2</option>
          <option value="3">Level 3</option><option value="4">Level 4</option>
          <option value="5">Level 5</option>
        </select>
      </label>
      <label class="search-label">Search words
        <input id="search" name="search" type="search" placeholder="Japanese, reading, or English" autocomplete="off">
      </label>
    </form>
    <section class="feedback-tools" aria-label="Card feedback">
      <button type="button" id="export-feedback" disabled>Export feedback</button>
      <p id="feedback-description">Feedback stays in this browser. Export it to share or back it up.</p>
      <p id="account-status" role="status" hidden></p>
    </section>
    <p id="results-status" role="status">Loading vocabulary…</p>
    <p id="library-error" role="alert" hidden></p>
    <p id="audio-status" role="status" class="audio-status"></p>
    <p id="audio-error" role="alert" hidden></p>
    <nav class="pagination" aria-label="Vocabulary pages">
      <button type="button" id="previous" disabled>← Previous</button>
      <span id="page-status">Page 1</span>
      <button type="button" id="next" disabled>Next →</button>
    </nav>
    <section id="cards" class="cards" aria-label="Vocabulary cards"></section>
    <noscript><p>Enable JavaScript to browse the vocabulary cards and listen to the voices.</p></noscript>
    <footer><a href="../credits.html">Credits and licenses</a></footer>
  </main>
</body>
</html>
`

/** Validate first, then emit a small manifest and HTML shell. Missing audio is never marked available. */
export function buildLibrary({ root = defaultRoot, allowMissingAudio = false } = {}) {
  const catalog = JSON.parse(readFileSync(join(root, 'content/catalog/ja.json'), 'utf8'))
  if (!Array.isArray(catalog.items) || catalog.items.length === 0) throw new Error('Catalogue has no items')
  const overridesPath = join(root, 'content/catalog/review-overrides.json')
  const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, 'utf8')) : {}
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Review overrides must be an object')
  for (const [id, override] of Object.entries(overrides)) {
    if (!override || typeof override !== 'object' || Array.isArray(override) ||
        Object.keys(override).some(key => !['teachingNote', 'visualGroup'].includes(key) || !nonempty(override[key]))) {
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
    const imageSrc = libraryMediaPath(item.image?.src, 'images')
    if (!existsSync(join(root, 'public', item.image.src))) throw new Error(`Missing image: ${item.image.src}`)
    if (!Array.isArray(item.audio) || item.audio.length !== 2) throw new Error(`Expected Marin and Cedar audio: ${item.id}`)
    const audio = ['marin', 'cedar'].map(voice => {
      const clips = item.audio.filter(clip => clip.voice === voice)
      if (clips.length !== 1) throw new Error(`Expected one ${voice} clip: ${item.id}`)
      const src = libraryMediaPath(clips[0].src, 'audio')
      const available = existsSync(join(root, 'public', clips[0].src))
      if (!available) missingAudio.push(clips[0].src)
      return { voice, src, available }
    })
    return {
      id: item.id, text: item.text, reading: item.reading, meaning: item.meaning, sourceLevel: item.sourceLevel,
      image: { src: imageSrc, alt: item.image.alt || item.meaning }, audio,
      concept: item.reuseStarterAssets ? (item.image.alt || item.meaning) : visual.concept,
      visualGroup: override.visualGroup || visual.visualGroup, reviewRequired: visual.reviewRequired || Boolean(override.teachingNote),
      ...(override.teachingNote ? { teachingNote: override.teachingNote } : {}),
      ...(visual.reviewNote ? { reviewNote: visual.reviewNote } : {}),
    }
  })
  for (const id of Object.keys(overrides)) if (!ids.has(id)) throw new Error(`Unknown review override ID: ${id}`)
  if (!allowMissingAudio && missingAudio.length) throw new Error(`Missing ${missingAudio.length} audio files; first: ${missingAudio[0]}. Use --allow-missing-audio only for a preview.`)
  const data = { cards }
  const directory = join(root, 'public/vocabulary')
  mkdirSync(directory, { recursive: true })
  mkdirSync(join(root, 'vocabulary'), { recursive: true })
  writeFileSync(join(root, 'vocabulary/index.html'), html)
  writeFileSync(join(directory, 'library-data.json'), JSON.stringify(data, null, 2) + '\n')
  return { cards: cards.length, availableAudio: cards.length * 2 - missingAudio.length, missingAudio: missingAudio.length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.some(arg => arg !== '--allow-missing-audio')) throw new Error('Usage: node scripts/content/build-vocabulary-library.mjs [--allow-missing-audio]')
  const result = buildLibrary({ allowMissingAudio: args.includes('--allow-missing-audio') })
  console.log(`Built ${result.cards} vocabulary cards; ${result.availableAudio} audio clips available, ${result.missingAudio} missing.`)
}
