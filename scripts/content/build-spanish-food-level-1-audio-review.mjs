/** Complete local review for only the 96 new Food level 1 recordings (#218). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadSpanishFoodLevel1Plan } from './generate-spanish-food-level-1.mjs'
import { audioReviewManifest, spanishAudioReviewHtml } from './build-spanish-audio-review.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const jsonl = text => text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
/** Shared read-only validation for the audio-only and combined 36-word galleries. */
export function validateFoodAudioReviewManifest(plan, approval, manifest) {
  if (plan.issue !== 218
    || plan.items.length !== 12
    || plan.voices.length !== 8
    || plan.expectedClips !== 96
    || plan.characters !== 608
    || manifest.issue !== 218
    || manifest.pack !== 'es-419-food-1'
    || manifest.language !== 'es-419'
    || manifest.provider !== plan.provider
    || manifest.model !== plan.model
    || manifest.expectedClips !== 96
    || manifest.characters !== 608
    || manifest.planIdentity !== hash(JSON.stringify(plan))
    || !same(manifest.items, plan.items)
    || !same(manifest.voices, plan.voices)
    || manifest.clips.length !== 96
    || new Set(manifest.clips.map(c => c.id + ':' + c.voice)).size !== 96
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
export function foodAudioReviewManifest(plan, approval, originals, deliveries) {
  const manifest = {
    ...audioReviewManifest(plan, originals, deliveries), issue: 218, pack: 'es-419-food-1', draftSha256: approval.draftSha256, artworkAcceptanceSha256: approval.artworkAcceptanceSha256, audioApprovalSha256: hash(JSON.stringify(approval, null, 2) + '\n'), audioReuseSha256: approval.audioReuseSha256
  }
  return validateFoodAudioReviewManifest(plan, approval, manifest)
}
export function foodAudioReviewHtml(manifest) {
  return spanishAudioReviewHtml(manifest).replaceAll('Spanish travel ·', 'Spanish Food level 1 ·').replace('36 words · 8 voices · 4 regional pairs · 288 recordings. Cesar is excluded.', '12 new words · 8 voices · 4 regional pairs · 96 new recordings. The full Food pack also reuses 192 accepted recordings unchanged.')
}
export async function buildSpanishFoodLevel1AudioReview({ root = process.cwd(), input, delivery, output }) {
  const { plan, approval } = await loadSpanishFoodLevel1Plan(root)
  if (![input, delivery, output].every(v => typeof v === 'string' && v.trim()))
    throw Error('Choose input, delivery and output directories.')
  const sourceRoot = resolve(root, input)
  const deliveryRoot = resolve(root, delivery)
  const destination = resolve(root, output)
  const [originals, deliveries, savedApproval, summary] = await Promise.all([readFile(join(sourceRoot, 'originals.jsonl'), 'utf8').then(jsonl), readFile(join(deliveryRoot, 'deliveries.jsonl'), 'utf8').then(jsonl), readFile(join(sourceRoot, 'approval.json'), 'utf8').then(JSON.parse), readFile(join(sourceRoot, 'summary.json'), 'utf8').then(JSON.parse)])
  if (!same(savedApproval, approval) || summary.status !== 'generated' || summary.completed !== 96)
    throw Error('Generation or approval is incomplete.')
  const manifest = foodAudioReviewManifest(plan, approval, originals, deliveries)
  for (const clip of manifest.clips) {
    const original = await readFile(join(sourceRoot, clip.originalFile))
    const bytes = await readFile(join(deliveryRoot, clip.file.slice(6)))
    if (hash(original) !== clip.originalSha256
      || original.length !== clip.originalBytes
      || hash(bytes) !== clip.deliverySha256
      || bytes.length !== clip.deliveryBytes)
      throw Error('Original or delivery hash mismatch.')
  }
  await mkdir(destination, { recursive: false })
  for (const voice of plan.voices)
    await mkdir(join(destination, 'audio', voice.voice), { recursive: true })
  for (const clip of manifest.clips)
    await copyFile(join(deliveryRoot, clip.file.slice(6)), join(destination, clip.file))
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  await copyFile(join(deliveryRoot, 'normalization-summary.json'), join(destination, 'normalization-summary.json'))
  await writeFile(join(destination, 'index.html'), foodAudioReviewHtml(manifest))
  return manifest
}
async function main() {
  const { values } = parseArgs({ options: {
      input: { type: 'string' }, delivery: { type: 'string' }, output: { type: 'string' }
    } })
  const m = await buildSpanishFoodLevel1AudioReview(values)
  console.log(JSON.stringify({
    clips: m.clips.length, voices: m.voices.length, output: values.output
  }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e => {
    console.error(e.message)
    process.exitCode = 1
  })
