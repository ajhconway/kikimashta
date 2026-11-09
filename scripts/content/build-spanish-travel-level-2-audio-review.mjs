/** Verified Spanish Travel level 2 audio review (#166). No activation. */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadSpanishTravelLevel2Plan } from './generate-spanish-travel-level-2.mjs'
import { audioReviewManifest, spanishAudioReviewHtml } from './build-spanish-audio-review.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const jsonl = text => text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))

export function level2AudioReviewManifest(plan, originals, deliveries) {
  if (plan.issue !== 166 || plan.items.length !== 36 || plan.voices.length !== 8 || plan.expectedClips !== 288 || plan.characters !== 2240) throw new Error('Expected the approved level 2 audio matrix.')
  return { ...audioReviewManifest(plan, originals, deliveries), issue: 166, pack: 'es-419-travel-2' }
}

export function level2AudioReviewHtml(manifest) {
  return spanishAudioReviewHtml(manifest)
    .replaceAll('Spanish travel ·', 'Spanish travel level 2 ·')
    .replace(' Cesar is excluded.', '')
}

export async function buildSpanishTravelLevel2AudioReview({ root = process.cwd(), input, delivery, output }) {
  const { plan, approval } = await loadSpanishTravelLevel2Plan(root)
  if (![input, delivery, output].every(value => typeof value === 'string' && value.trim())) throw new Error('Choose input, delivery and output directories.')
  const sourceRoot = resolve(root, input), deliveryRoot = resolve(root, delivery), destination = resolve(root, output)
  const [originals, deliveries, savedApproval, summary] = await Promise.all([
    readFile(join(sourceRoot, 'originals.jsonl'), 'utf8').then(jsonl), readFile(join(deliveryRoot, 'deliveries.jsonl'), 'utf8').then(jsonl),
    readFile(join(sourceRoot, 'approval.json'), 'utf8').then(JSON.parse), readFile(join(sourceRoot, 'summary.json'), 'utf8').then(JSON.parse),
  ])
  if (JSON.stringify(savedApproval) !== JSON.stringify(approval) || summary.status !== 'generated' || summary.completed !== plan.expectedClips) throw new Error('Generation or approval is incomplete.')
  const manifest = level2AudioReviewManifest(plan, originals, deliveries)
  // Validate the entire source/delivery matrix before creating any review files.
  for (const clip of manifest.clips) {
    const original = await readFile(join(sourceRoot, clip.originalFile)), audio = await readFile(join(deliveryRoot, clip.file.slice(6)))
    if (hash(original) !== clip.originalSha256 || original.length !== clip.originalBytes || hash(audio) !== clip.deliverySha256 || audio.length !== clip.deliveryBytes) throw new Error('Original or delivery hash mismatch.')
  }
  await mkdir(destination, { recursive: false })
  for (const voice of plan.voices) await mkdir(join(destination, 'audio', voice.voice), { recursive: true })
  for (const clip of manifest.clips) await copyFile(join(deliveryRoot, clip.file.slice(6)), join(destination, clip.file))
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  await copyFile(join(deliveryRoot, 'normalization-summary.json'), join(destination, 'normalization-summary.json'))
  await writeFile(join(destination, 'index.html'), level2AudioReviewHtml(manifest))
  return manifest
}

async function main() {
  const { values } = parseArgs({ options: { input: { type: 'string' }, delivery: { type: 'string' }, output: { type: 'string' } } })
  const manifest = await buildSpanishTravelLevel2AudioReview(values)
  console.log(JSON.stringify({ clips: manifest.clips.length, voices: manifest.voices.length, output: values.output }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
