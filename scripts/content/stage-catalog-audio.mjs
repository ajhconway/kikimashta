/** Verify hosted artifacts and stage only recordings and their provenance (#27). */
import { readdir, readFile, mkdir, writeFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const input = 'artifacts/catalog-generated'
const target = 'public/audio/vocabulary'
await mkdir(target, { recursive: true })
await mkdir('content/catalog/audio', { recursive: true })
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
let count = 0
for (const directory of await readdir(input)) {
  const root = join(input, directory)
  const manifest = JSON.parse(await readFile(join(root, 'provenance.json'), 'utf8'))
  if (!Number.isInteger(manifest.sourceLevel) || manifest.sourceLevel < 1 || manifest.sourceLevel > 5) throw new Error('Invalid artifact level')
  for (const clip of manifest.clips) {
    if (!/^(marin|cedar)-ja-v-[a-f0-9]{12}\.mp3$/.test(clip.file) || clip.original !== clip.file.replace('.mp3', '.wav')) throw new Error('Unsafe artifact filename')
    const wav = await readFile(join(root, clip.original))
    const mp3 = await readFile(join(root, clip.file))
    if (sha256(wav) !== clip.originalSha256 || sha256(mp3) !== clip.deliverySha256 || mp3.length !== clip.deliveryBytes) throw new Error('Artifact content mismatch')
    await copyFile(join(root, clip.file), join(target, clip.file))
    count++
  }
  manifest.generation = { runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, sourceRevision: process.env.GITHUB_SHA }
  await writeFile(`content/catalog/audio/level-${manifest.sourceLevel}.json`, JSON.stringify(manifest, null, 2) + '\n')
}
console.log(`Staged ${count} verified recordings. Original WAVs remain in workflow artifacts.`)
