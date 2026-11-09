/** Complete local review for only the 248 new Food level 2 recordings (#231). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadSpanishFoodLevel2Plan } from './generate-spanish-food-level-2.mjs'
import { audioReviewManifest, spanishAudioReviewHtml } from './build-spanish-audio-review.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const jsonl = text => text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
const PROFILE = {
  version: 1, targetLufs: -22, truePeakCeilingDbtp: -2, maxBoostDb: 9, rate: 44100, bitrate: '128k', dualMono: true, shortClipAnalysis: 'pad-to-500ms-only-for-measurement'
}
const PROCESSING = 'Constant gain; each delivered MP3 encoded directly from its provider original. No dynamics compression, trimming, or timing changes.'
const ordered = value => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value
/** The summary is reporting evidence, not a second authority for the playback profile. */
export function foodLevel2NormalizationVerification(manifest, summaryBytes) {
  const summary = JSON.parse(summaryBytes)
  const fields = [
    'profile', 'clips', 'resumed', 'targetLimited', 'shortClipMeasurements', 'originalsPreserved', 'processing'
  ]
  const limited = manifest.clips.filter(c => c.targetLimited).length
  const short = manifest.clips.filter(c => c.decodedFrames < PROFILE.rate / 2).length
  if (!same(Object.keys(summary ?? {}).sort(), fields.sort())
    || !same(ordered(summary.profile), ordered(PROFILE))
    || summary.clips !== manifest.clips.length
    || !Number.isSafeInteger(summary.resumed) || summary.resumed < 0 || summary.resumed > summary.clips
    || summary.targetLimited !== limited
    || summary.shortClipMeasurements !== short
    || summary.originalsPreserved !== true || summary.processing !== PROCESSING
    || manifest.clips.some(c => c.after.analysisPadding !== (c.decodedFrames < PROFILE.rate / 2)
      || c.after.measurementMethod !== (c.decodedFrames < PROFILE.rate / 2 ? 'r128-analysis-padded-to-500ms' : 'r128')))
    throw Error('Food normalization summary differs from verified recordings.')
  return {
    issue: 231, pack: 'es-419-food-2', manifest: 'manifest.json', manifestSha256: hash(JSON.stringify(manifest, null, 2) + '\n'),
    normalizationSummary: 'normalization-summary.json', normalizationSummarySha256: hash(summaryBytes), normalizationSummaryBytes: summaryBytes.length,
    clips: manifest.clips.length, targetLimited: limited, shortClipMeasurements: short,
    resumed: summary.resumed, resumeEvidence: 'Reported normalization-run count, checked within 0..clips; not derivable from individual recording records.'
  }
}
/** Shared read-only validation for the audio-only and combined 36-word galleries. */
export function validateFoodLevel2AudioReviewManifest(plan, approval, manifest) {
  if (plan.issue !== 231
    || plan.items.length !== 31
    || plan.voices.length !== 8
    || plan.expectedClips !== 248
    || plan.characters !== 1616
    || manifest.issue !== 231
    || manifest.pack !== 'es-419-food-2'
    || manifest.language !== 'es-419'
    || manifest.provider !== plan.provider
    || manifest.model !== plan.model
    || manifest.expectedClips !== 248
    || manifest.characters !== 1616
    || manifest.planIdentity !== hash(JSON.stringify(plan))
    || !same(manifest.items, plan.items)
    || !same(manifest.voices, plan.voices)
    || manifest.clips.length !== 248
    || new Set(manifest.clips.map(c => c.id + ':' + c.voice)).size !== 248
    || manifest.draftSha256 !== approval.draftSha256
    || manifest.artworkAcceptanceSha256 !== approval.artworkAcceptanceSha256
    || manifest.audioApprovalSha256 !== hash(JSON.stringify(approval, null, 2) + '\n')
    || manifest.audioReuseSha256 !== approval.audioReuseSha256)
    throw Error('Food review matrix or authorization changed.')
  for (const clip of manifest.clips) {
    const item = plan.items.find(i => i.id === clip.id)
    const voice = plan.voices.find(v => v.voice === clip.voice)
    const limited = clip.targetLimited === true
      && clip.after?.integratedLufs < -22.25
      && Array.isArray(clip.limitingReasons)
      && clip.limitingReasons.length > 0
      && clip.limitingReasons.every(r => ['maximum_gain', 'true_peak_headroom', 'encoded_loudness_resolution'].includes(r))
    if (!item
      || !voice
      || clip.text !== item.text
      || clip.spelling !== item.spelling
      || clip.meaning !== item.meaning
      || clip.voiceId !== voice.id
      || clip.voiceName !== voice.name
      || clip.region !== voice.region
      || clip.locale !== voice.locale
      || clip.file !== `audio/${voice.voice}/${item.id}.mp3`
      || clip.originalFile !== `originals/${voice.voice}/${item.id}.mp3`
      || clip.request?.text !== item.text
      || clip.request.model_id !== plan.model
      || clip.request.language_code !== 'es'
      || !same(clip.request.voice_settings, plan.voiceSettings)
      || !validHash(clip.originalSha256)
      || !validHash(clip.deliverySha256)
      || !Number.isSafeInteger(clip.originalBytes)
      || clip.originalBytes <= 0
      || !Number.isSafeInteger(clip.deliveryBytes)
      || clip.deliveryBytes <= 0
      || !Number.isSafeInteger(clip.decodedFrames)
      || clip.decodedFrames <= 0
      || !Number.isFinite(clip.gainDb)
      || clip.gainDb > 9
      || !Number.isFinite(clip.after?.integratedLufs)
      || !Number.isFinite(clip.after?.truePeakDbtp)
      || clip.after.truePeakDbtp > -2
      || typeof clip.targetLimited !== 'boolean'
      || (clip.targetLimited
        && !limited)
      || (Math.abs(clip.after.integratedLufs + 22) > .25
        && !limited)
      || (!clip.targetLimited
        && !same(clip.limitingReasons, [])))
      throw Error('Food recording identity or playback profile changed.')
  }
  return manifest
}
export function foodLevel2AudioReviewManifest(plan, approval, originals, deliveries) {
  const manifest = {
    ...audioReviewManifest(plan, originals, deliveries), issue: 231, pack: 'es-419-food-2', draftSha256: approval.draftSha256, artworkAcceptanceSha256: approval.artworkAcceptanceSha256, audioApprovalSha256: hash(JSON.stringify(approval, null, 2) + '\n'), audioReuseSha256: approval.audioReuseSha256
  }
  return validateFoodLevel2AudioReviewManifest(plan, approval, manifest)
}
export function foodLevel2AudioReviewHtml(manifest) {
  return spanishAudioReviewHtml(manifest).replaceAll('Spanish travel ·', 'Spanish Food level 2 ·').replace('36 words · 8 voices · 4 regional pairs · 288 recordings. Cesar is excluded.', '31 new words · 8 voices · 4 regional pairs · 248 new recordings. The full Food pack also reuses 40 accepted recordings unchanged.')
}
export async function buildSpanishFoodLevel2AudioReview({ root = process.cwd(), input, delivery, output }) {
  const { plan, approval } = await loadSpanishFoodLevel2Plan(root)
  if (![input, delivery, output].every(v => typeof v === 'string' && v.trim()))
    throw Error('Choose input, delivery and output directories.')
  const sourceRoot = resolve(root, input)
  const deliveryRoot = resolve(root, delivery)
  const destination = resolve(root, output)
  const [originals, deliveries, savedApproval, summary] = await Promise.all([readFile(join(sourceRoot, 'originals.jsonl'), 'utf8').then(jsonl), readFile(join(deliveryRoot, 'deliveries.jsonl'), 'utf8').then(jsonl), readFile(join(sourceRoot, 'approval.json'), 'utf8').then(JSON.parse), readFile(join(sourceRoot, 'summary.json'), 'utf8').then(JSON.parse)])
  if (!same(savedApproval, approval) || summary.status !== 'generated' || summary.completed !== 248)
    throw Error('Generation or approval is incomplete.')
  const manifest = foodLevel2AudioReviewManifest(plan, approval, originals, deliveries)
  for (const clip of manifest.clips) {
    const original = await readFile(join(sourceRoot, clip.originalFile))
    const bytes = await readFile(join(deliveryRoot, clip.file.slice(6)))
    if (hash(original) !== clip.originalSha256
      || original.length !== clip.originalBytes
      || hash(bytes) !== clip.deliverySha256
      || bytes.length !== clip.deliveryBytes)
      throw Error('Original or delivery hash mismatch.')
  }
  const normalizationBytes = await readFile(join(deliveryRoot, 'normalization-summary.json'))
  const normalizationVerification = foodLevel2NormalizationVerification(manifest, normalizationBytes)
  await mkdir(destination, { recursive: false })
  for (const voice of plan.voices)
    await mkdir(join(destination, 'audio', voice.voice), { recursive: true })
  for (const clip of manifest.clips)
    await copyFile(join(deliveryRoot, clip.file.slice(6)), join(destination, clip.file))
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(join(destination, 'normalization-summary.json'), normalizationBytes)
  await writeFile(join(destination, 'normalization-verification.json'), JSON.stringify(normalizationVerification, null, 2) + '\n')
  await writeFile(join(destination, 'index.html'), foodLevel2AudioReviewHtml(manifest))
  return manifest
}
async function main() {
  const { values } = parseArgs({ options: {
      input: { type: 'string' }, delivery: { type: 'string' }, output: { type: 'string' }
    } })
  const m = await buildSpanishFoodLevel2AudioReview(values)
  console.log(JSON.stringify({
    clips: m.clips.length, voices: m.voices.length, output: values.output
  }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e => {
    console.error(e.message)
    process.exitCode = 1
  })
