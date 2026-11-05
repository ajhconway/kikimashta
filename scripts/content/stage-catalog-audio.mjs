/** Verify hosted artifacts and stage only recordings and their provenance (#27). */
import { readdir, readFile, mkdir, writeFile, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

/** Preflight every artifact before writing anything into the publication directories. */
export async function stageCatalogAudio({
  input = 'artifacts/catalog-generated', target = 'public/audio/vocabulary',
  provenanceTarget = 'content/catalog/audio', catalog,
  expectedSourceRevision = process.env.SOURCE_REVISION ?? process.env.GITHUB_SHA,
  generation = { runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, sourceRevision: process.env.GITHUB_SHA },
} = {}) {
  catalog ??= JSON.parse(await readFile('content/catalog/ja.json', 'utf8'))
  const items = new Map(catalog.items.map(item => [item.id, item]))
  const levels = new Set()
  const files = new Set()
  const plans = []
  for (const directory of await readdir(input)) {
    const root = join(input, directory)
    const manifest = JSON.parse(await readFile(join(root, 'provenance.json'), 'utf8'))
    if (!Number.isInteger(manifest.sourceLevel) || manifest.sourceLevel < 1 || manifest.sourceLevel > 5) throw new Error('Invalid artifact level')
    if (levels.has(manifest.sourceLevel)) throw new Error('Duplicate artifact level')
    levels.add(manifest.sourceLevel)
    if (expectedSourceRevision && manifest.sourceRevision !== expectedSourceRevision) throw new Error('Artifact source revision mismatch')
    if (!Array.isArray(manifest.clips)) throw new Error('Invalid artifact clips')
    const recordings = []
    for (const clip of manifest.clips) {
      if (!/^(marin|cedar)-ja-v-[a-f0-9]{12}\.mp3$/.test(clip.file) || clip.original !== clip.file.replace('.mp3', '.wav')) throw new Error('Unsafe artifact filename')
      const item = items.get(clip.id)
      if (!item || item.reuseStarterAssets || item.sourceLevel !== manifest.sourceLevel || !['marin', 'cedar'].includes(clip.voice) ||
          clip.file !== `${clip.voice}-${clip.id}.mp3` || clip.text !== item.reading || clip.spelling !== item.text || clip.meaning !== item.meaning) throw new Error('Artifact catalog identity mismatch')
      if (files.has(clip.file)) throw new Error('Duplicate artifact recording')
      files.add(clip.file)
      const wav = await readFile(join(root, clip.original))
      const mp3 = await readFile(join(root, clip.file))
      if (sha256(wav) !== clip.originalSha256 || sha256(mp3) !== clip.deliverySha256 || mp3.length !== clip.deliveryBytes) throw new Error('Artifact content mismatch')
      recordings.push({ source: join(root, clip.file), file: clip.file })
    }
    plans.push({ manifest, recordings })
  }
  await mkdir(target, { recursive: true })
  await mkdir(provenanceTarget, { recursive: true })
  let count = 0
  for (const { manifest, recordings } of plans) {
    for (const recording of recordings) {
      await copyFile(recording.source, join(target, recording.file))
      count++
    }
    manifest.generation = generation
    await writeFile(join(provenanceTarget, `level-${manifest.sourceLevel}.json`), JSON.stringify(manifest, null, 2) + '\n')
  }
  return count
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  stageCatalogAudio().then(count => console.log(`Staged ${count} verified recordings. Original WAVs remain in workflow artifacts.`)).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
