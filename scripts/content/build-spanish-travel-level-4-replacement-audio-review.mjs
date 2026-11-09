/** Verified Spanish Travel level 4 audio review (#207). No activation. */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadSpanishTravelLevel4ReplacementPlan } from './generate-spanish-travel-level-4-replacement.mjs'
import { audioReviewManifest, spanishAudioReviewHtml } from './build-spanish-audio-review.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const jsonl = text => text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))

export function level4ReplacementAudioReviewManifest(plan, originals, deliveries) {
  if (plan.issue !== 207 || plan.items.length !== 1 || plan.voices.length !== 8 || plan.expectedClips !== 8 || plan.characters !== 56) throw new Error('Expected the approved level 4 audio matrix.')
  return { ...audioReviewManifest(plan, originals, deliveries), issue: 207, pack: 'es-419-travel-4-replacement' }
}

export function level4ReplacementAudioReviewHtml(manifest) {
  return spanishAudioReviewHtml(manifest)
    .replaceAll('Spanish travel ·', 'Spanish travel level 4 ·')
    .replace(' Cesar is excluded.', '').replace('36 words · 8 voices · 4 regional pairs · 288 recordings.', '1 replacement word · 8 voices · 4 regional pairs · 8 recordings.')
}

export async function buildSpanishTravelLevel4ReplacementAudioReview({ root = process.cwd(), input, delivery, output }) {
  const { plan, approval } = await loadSpanishTravelLevel4ReplacementPlan(root)
  if (![input, delivery, output].every(value => typeof value === 'string' && value.trim())) throw new Error('Choose input, delivery and output directories.')
  const sourceRoot = resolve(root, input), deliveryRoot = resolve(root, delivery), destination = resolve(root, output)
  const [originals, deliveries, savedApproval, summary] = await Promise.all([
    readFile(join(sourceRoot, 'originals.jsonl'), 'utf8').then(jsonl), readFile(join(deliveryRoot, 'deliveries.jsonl'), 'utf8').then(jsonl),
    readFile(join(sourceRoot, 'approval.json'), 'utf8').then(JSON.parse), readFile(join(sourceRoot, 'summary.json'), 'utf8').then(JSON.parse),
  ])
  if (JSON.stringify(savedApproval) !== JSON.stringify(approval) || summary.status !== 'generated' || summary.completed !== plan.expectedClips) throw new Error('Generation or approval is incomplete.')
  const manifest = { ...level4ReplacementAudioReviewManifest(plan, originals, deliveries), replacementSha256: approval.replacementSha256, baseDraftSha256: approval.baseDraftSha256 }
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
  await writeFile(join(destination, 'index.html'), level4ReplacementAudioReviewHtml(manifest))
  return manifest
}

async function main() {
  const { values } = parseArgs({ options: { input: { type: 'string' }, delivery: { type: 'string' }, output: { type: 'string' } } })
  const manifest = await buildSpanishTravelLevel4ReplacementAudioReview(values)
  console.log(JSON.stringify({ clips: manifest.clips.length, voices: manifest.voices.length, output: values.output }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
