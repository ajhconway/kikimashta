/** Verified word and contextual audio review for Basic Spanish level 1 (#191). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadSpanishBasicLevel1Plan } from './generate-spanish-basic-level-1.mjs'
import { audioReviewManifest, spanishAudioReviewHtml } from './build-spanish-audio-review.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const jsonl = text => text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

export function basicAudioReviewManifest(plan, originals, deliveries, approval) {
  if (plan.issue !== 191 || plan.items.length !== 42 || plan.voices.length !== 8 || plan.expectedClips !== 336 || plan.characters !== 4760 ||
      approval.issue !== 191 || approval.pack !== 'es-419-basic-1' || hash(JSON.stringify(plan.items)) !== approval.itemsSha256 ||
      hash(JSON.stringify(plan.voices)) !== approval.voicesSha256 || !/^[a-f0-9]{64}$/.test(approval.draftSha256) ||
      !/^[a-f0-9]{64}$/.test(approval.generationApprovalSha256)) throw new Error('Expected the exact approved Basic Spanish audio matrix.')
  const words = plan.items.filter(i => i.role === 'word'), sentences = plan.items.filter(i => i.role === 'sentence'), questions = plan.items.filter(i => i.role === 'question')
  if (words.length !== 24 || sentences.length !== 9 || questions.length !== 9 || new Set(sentences.map(s => s.contextId)).size !== 9) throw new Error('Incomplete Basic Spanish contextual identity.')
  const contexts = sentences.map(sentence => {
    const question = questions.find(q => q.contextId === sentence.contextId)
    if (!question || question.targetItemId !== sentence.targetItemId || question.contextRevision !== sentence.contextRevision || !words.some(w => w.id === sentence.targetItemId)) throw new Error('Mismatched Basic Spanish contextual identity.')
    return { id: sentence.contextId, targetItemId: sentence.targetItemId, revision: sentence.contextRevision, sentenceId: sentence.id, questionId: question.id }
  })
  return { ...audioReviewManifest(plan, originals, deliveries), issue: 191, pack: 'es-419-basic-1', title: 'Basic Spanish level 1',
    draftSha256: approval.draftSha256, generationApprovalSha256: approval.generationApprovalSha256,
    wordCount: words.length, contextCount: contexts.length, contexts }
}

export function basicAudioReviewHtml(manifest) {
  let html = spanishAudioReviewHtml(manifest)
    .replaceAll('Spanish travel ·', 'Basic Spanish level 1 ·')
    .replace('36 words · 8 voices · 4 regional pairs · 288 recordings. Cesar is excluded.', '24 words · 9 sentence/question pairs · 8 voices · 336 recordings.')
    .replace('Word or meaning', 'Word, sentence or meaning')
    .replace("words+' words · '+clips", "words+' spoken parts · '+clips")
  for (const [index, item] of manifest.items.entries()) {
    const target = manifest.items.find(i => i.id === item.targetItemId && i.role === 'word')
    const label = item.role === 'word' ? 'Word' : `Context ${item.role} · ${target.meaning}`
    const heading = `<h2 lang="es-419">${index + 1}.`
    html = html.replace(heading, `<p class="meaning">${escape(label)}</p>${heading}`)
  }
  return html
}

export async function buildSpanishBasicLevel1AudioReview({ root = process.cwd(), input, delivery, output }) {
  const { plan, approval } = await loadSpanishBasicLevel1Plan(root)
  if (![input, delivery, output].every(value => typeof value === 'string' && value.trim())) throw new Error('Choose input, delivery and output directories.')
  const sourceRoot = resolve(root, input), deliveryRoot = resolve(root, delivery), destination = resolve(root, output)
  const [originals, deliveries, savedApproval, summary] = await Promise.all([
    readFile(join(sourceRoot, 'originals.jsonl'), 'utf8').then(jsonl), readFile(join(deliveryRoot, 'deliveries.jsonl'), 'utf8').then(jsonl),
    readFile(join(sourceRoot, 'approval.json'), 'utf8').then(JSON.parse), readFile(join(sourceRoot, 'summary.json'), 'utf8').then(JSON.parse),
  ])
  if (JSON.stringify(savedApproval) !== JSON.stringify(approval) || summary.status !== 'generated' || summary.completed !== plan.expectedClips) throw new Error('Generation or approval is incomplete.')
  const manifest = basicAudioReviewManifest(plan, originals, deliveries, approval)
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
  await writeFile(join(destination, 'index.html'), basicAudioReviewHtml(manifest))
  return manifest
}

async function main() {
  const { values } = parseArgs({ options: { input: { type: 'string' }, delivery: { type: 'string' }, output: { type: 'string' } } })
  const manifest = await buildSpanishBasicLevel1AudioReview(values)
  console.log(JSON.stringify({ clips: manifest.clips.length, voices: manifest.voices.length, output: values.output }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
