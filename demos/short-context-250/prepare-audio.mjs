/** Verify the shared pipeline's complete batch before staging demo-only audio (#250). */
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { buildContextualAudioReview } from '../../scripts/content/build-contextual-audio-review.mjs'
import { loadShortContextAudition } from '../../scripts/content/short-context-audio-plan.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const demo = fileURLToPath(new URL('.', import.meta.url))
const { values } = parseArgs({ options: { input: { type: 'string' }, delivery: { type: 'string' }, review: { type: 'string' } } })
// This shared preflight verifies every original, sidecar, request, approval,
// normalized hash/profile/level and full decode before writing the review.
const checked = await buildContextualAudioReview({ root, input: values.input,
  delivery: values.delivery, output: values.review, batch: 'short-demo-250' })
const { plan } = loadShortContextAudition(root)
const records = (await readFile(resolve(root, values.delivery, 'deliveries.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
for (const record of records) {
  const destination = resolve(demo, 'public/audio', record.file)
  await mkdir(dirname(destination), { recursive: true })
  await copyFile(resolve(root, values.delivery, record.file), destination)
}
await writeFile(resolve(demo, 'public/audio-provenance-v3.json'), JSON.stringify({ schemaVersion: 1, issue: 250,
  status: 'Pending owner listening review; demo only', plan,
  originalsPreserved: true, processing: 'Shared normalize-elevenlabs.py constant-gain profile; no compression, trimming, pitch or timing changes.',
  recordings: records }, null, 2) + '\n')
// Superseded prototype bytes and generator remain recoverable from Git history.
const drafts = JSON.parse(await readFile(resolve(demo, 'source/questions.json'), 'utf8'))
for (const draft of drafts) for (const kind of ['sentence', 'question']) {
  await rm(resolve(demo, `public/audio/${draft.id}-${kind}.mp3`), { force: true })
}
console.log(JSON.stringify({ ...checked, stagedRecordings: records.length }))
