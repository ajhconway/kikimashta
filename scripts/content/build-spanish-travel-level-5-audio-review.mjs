/** Complete, hash-bound Travel level 5 picture/listening review (#243). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises'
import { resolve, join, relative, isAbsolute, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadSpanishTravelLevel5Plan } from './generate-spanish-travel-level-5.mjs'
import { audioReviewManifest, spanishAudioReviewHtml } from './build-spanish-audio-review.mjs'
import { foodLevel2NormalizationVerification } from './build-spanish-food-level-2-audio-review.mjs'

const DATA = 'content/spanish-travel-5'
const ART = 'artifacts/spanish-travel-5-art'
const REVIEW = 'artifacts/spanish-travel-5-audio-review'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const jsonl = bytes => bytes.toString().trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const inside = (parent, child) => { const part = relative(parent, child); return !part || (!part.startsWith('..' + sep) && part !== '..' && !isAbsolute(part)) }

async function checkedPath(root, path, missing = false) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\')
      || path.split('/').some(part => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part)))
    throw Error('Unsafe Travel5 review path.')
  let current = resolve(root)
  for (const part of ['', ...path.split('/')]) {
    if (part) current = join(current, part)
    try { if ((await lstat(current)).isSymbolicLink()) throw Error('Travel5 review paths cannot contain symlinks.') }
    catch (error) { if (!missing || error.code !== 'ENOENT') throw error }
  }
  return current
}
async function checkedRead(root, path) { return readFile(await checkedPath(root, path)) }
async function hashedRead(root, path, expected) {
  const bytes = await checkedRead(root, path)
  if (!validHash(expected) || hash(bytes) !== expected) throw Error('Travel5 source hash mismatch: ' + path)
  return bytes
}

export function travelLevel5AudioReviewManifest(plan, approval, originals, deliveries) {
  if (plan.issue !== 243 || plan.language !== 'es-419' || plan.items.length !== 36 || plan.voices.length !== 8
      || plan.expectedClips !== 288 || approval.expectedClips !== 288 || approval.pack !== 'es-419-travel-5'
      || !validHash(approval.draftSha256) || !validHash(approval.artworkAcceptanceSha256))
    throw Error('Travel5 review matrix or authorization changed.')
  const manifest = { ...audioReviewManifest(plan, originals, deliveries), issue: 243, pack: 'es-419-travel-5',
    draftSha256: approval.draftSha256, artworkAcceptanceSha256: approval.artworkAcceptanceSha256,
    audioApprovalSha256: hash(JSON.stringify(approval, null, 2) + '\n'),
    artworkStatus: 'accepted', listeningStatus: 'pending', runtimeActivationAuthorized: false }
  for (const clip of manifest.clips) {
    if (!validHash(clip.originalSha256) || !validHash(clip.deliverySha256)
        || !Number.isSafeInteger(clip.originalBytes) || clip.originalBytes <= 0
        || !Number.isSafeInteger(clip.deliveryBytes) || clip.deliveryBytes <= 0
        || !same(clip.request.voice_settings, plan.voiceSettings)
        || (!clip.targetLimited && !same(clip.limitingReasons, [])))
      throw Error('Travel5 recording identity or playback profile changed.')
  }
  return manifest
}

/** Reuse the verified fixed-profile summary checker; retain Travel5 identity. */
export function travelLevel5NormalizationVerification(manifest, summaryBytes) {
  return { ...foodLevel2NormalizationVerification(manifest, summaryBytes), issue: 243, pack: 'es-419-travel-5' }
}

/** Add accepted pictures and group filtering to the existing native-audio gallery. */
export function travelLevel5AudioReviewHtml(manifest, { root = process.cwd(), output = resolve(root, REVIEW) } = {}) {
  let html = spanishAudioReviewHtml(manifest)
    .replaceAll('Spanish travel ·', 'Spanish Travel level 5 ·')
    .replace(' Cesar is excluded.', '')
    .replace('AI-generated audio, matched', 'Artwork accepted · AI-generated audio, matched')
    .replace('Final listening approval is pending.', 'Listening approval is pending; this pack is not active.')
    .replace('</style>', 'figure{margin:0 0 18px}figure img{width:auto;height:auto;max-width:145px;max-height:145px;object-fit:contain}</style>')
    .replace('</div>\n<button id="sequence">', `<label>Group<select id="group"><option value="">All groups</option>${manifest.groups.map(group => `<option value="${esc(group.id)}">${esc(group.title)}</option>`).join('')}</select></label></div>\n<button id="sequence">`)
  let article = 0, picture = 0
  html = html.replace(/<article data-search=/g, () => {
    const item = manifest.items[article++]
    return `<article data-item-id="${esc(item.id)}" data-group="${esc(item.group)}" data-search=`
  })
  html = html.replace(/<div class="clips">/g, () => {
    const item = manifest.items[picture++], image = manifest.images.find(row => row.id === item.id)
    const path = relative(output, resolve(root, image.path)).split(sep).join('/')
    return `<figure><a href="${esc(path)}" target="_blank" rel="noopener"><img width="145" height="145" src="${esc(path)}" alt="${esc(item.meaning)}"></a></figure><div class="clips">`
  })
  if (article !== 36 || picture !== 36 || (html.match(/<audio controls /g) ?? []).length !== 288)
    throw Error('Travel5 listening gallery did not render the complete matrix.')
  return html
    .replace("voice=document.querySelector('#voice'),status", "voice=document.querySelector('#voice'),group=document.querySelector('#group'),status")
    .replace('const matches=fold(article.dataset.search).includes(fold(search.value))', 'const matches=fold(article.dataset.search).includes(fold(search.value))&&(!group.value||article.dataset.group===group.value)')
    .replace("document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause()});current=audio", 'if(current&&current!==audio&&!current.paused)current.pause();current=audio;stop.disabled=false')
    .replace('[search,region,voice]', '[search,region,voice,group]')
    .replace('</script>', "window.addEventListener('pagehide',halt);</script>")
}

async function acceptedPictures(root, approval, plan) {
  const acceptancePath = DATA + '/artwork-acceptance.json'
  const acceptanceBytes = await hashedRead(root, acceptancePath, approval.artworkAcceptanceSha256)
  const acceptance = JSON.parse(acceptanceBytes)
  if (acceptance.status !== 'artwork-accepted' || acceptance.pictures !== 36 || acceptance.generated !== 34 || acceptance.reused !== 2
      || acceptance.artworkManifest !== ART + '/manifest.json' || acceptance.selection !== ART + '/selection.json')
    throw Error('Travel5 accepted artwork scope changed.')
  const artBytes = await hashedRead(root, acceptance.artworkManifest, acceptance.artworkManifestSha256)
  const art = JSON.parse(artBytes)
  await hashedRead(root, acceptance.selection, acceptance.selectionSha256)
  const images = acceptance.images
  if (!Array.isArray(images) || images.length !== 36 || new Set(images.map(row => row.id)).size !== 36
      || art.items.length !== 36 || !same(images.map(row => row.id), art.items.map(row => row.id)))
    throw Error('Travel5 accepted picture matrix changed.')
  for (const image of images) {
    const current = art.items.find(row => row.id === image.id)
    if (!plan.items.some(item => item.id === image.id)
        || ['path', 'sha256', 'source', 'version'].some(key => current[key] !== image[key]))
      throw Error('Travel5 accepted picture identity changed.')
    await hashedRead(root, image.path, image.sha256)
  }
  return { images, inputs: { [acceptancePath]: hash(acceptanceBytes), [acceptance.artworkManifest]: hash(artBytes), [acceptance.selection]: acceptance.selectionSha256 } }
}

/** Complete all authorization, source, picture and normalization checks before writing. */
export async function buildSpanishTravelLevel5AudioReview({ root = process.cwd(), input, delivery, output }) {
  const { plan, approval } = await loadSpanishTravelLevel5Plan(root)
  if (![input, delivery, output].every(value => typeof value === 'string' && value.trim()))
    throw Error('Choose input, delivery and output directories.')
  const sourceRoot = resolve(root, input), deliveryRoot = resolve(root, delivery), destination = resolve(root, output)
  if (inside(sourceRoot, destination) || inside(destination, sourceRoot) || inside(deliveryRoot, destination) || inside(destination, deliveryRoot))
    throw Error('Review output must be separate from private source directories.')
  const [originals, deliveries, savedApproval, summary] = await Promise.all([
    checkedRead(sourceRoot, 'originals.jsonl').then(jsonl), checkedRead(deliveryRoot, 'deliveries.jsonl').then(jsonl),
    checkedRead(sourceRoot, 'approval.json').then(bytes => JSON.parse(bytes)), checkedRead(sourceRoot, 'summary.json').then(bytes => JSON.parse(bytes)),
  ])
  if (!same(savedApproval, approval) || summary.status !== 'generated' || summary.completed !== 288)
    throw Error('Travel5 generation or approval is incomplete.')
  const manifest = travelLevel5AudioReviewManifest(plan, approval, originals, deliveries)
  for (const clip of manifest.clips) {
    const original = await hashedRead(sourceRoot, clip.originalFile, clip.originalSha256)
    const bytes = await hashedRead(deliveryRoot, clip.file.slice(6), clip.deliverySha256)
    if (original.length !== clip.originalBytes || bytes.length !== clip.deliveryBytes)
      throw Error('Travel5 original or delivery byte count mismatch.')
  }
  const draftBytes = await hashedRead(root, DATA + '/draft.json', approval.draftSha256)
  const draft = JSON.parse(draftBytes), artwork = await acceptedPictures(root, approval, plan)
  manifest.groups = draft.groups
  manifest.items = manifest.items.map(item => ({ ...item, group: draft.items.find(row => row.id === item.id).group }))
  manifest.images = artwork.images
  manifest.inputs = { [DATA + '/draft.json']: hash(draftBytes), ...artwork.inputs }
  const normalizationBytes = await checkedRead(deliveryRoot, 'normalization-summary.json')
  const normalization = travelLevel5NormalizationVerification(manifest, normalizationBytes)
  const html = travelLevel5AudioReviewHtml(manifest, { root, output: destination })
  // Validate every destination component before creating the new directory.
  const outputParent = resolve(destination, '..')
  await checkedPath(outputParent, destination.slice(outputParent.length + 1), true)
  // Also reject symlinked ancestors inside the supplied repository.
  if (inside(resolve(root), destination)) await checkedPath(root, relative(resolve(root), destination).split(sep).join('/'), true)
  await mkdir(destination, { recursive: false })
  for (const voice of plan.voices) await mkdir(join(destination, 'audio', voice.voice), { recursive: true })
  for (const clip of manifest.clips) {
    // Write the verified bytes only; never publish provider originals or private metadata.
    const bytes = await hashedRead(deliveryRoot, clip.file.slice(6), clip.deliverySha256)
    await writeFile(join(destination, clip.file), bytes, { flag: 'wx' })
  }
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  await writeFile(join(destination, 'normalization-summary.json'), normalizationBytes, { flag: 'wx' })
  await writeFile(join(destination, 'normalization-verification.json'), JSON.stringify(normalization, null, 2) + '\n', { flag: 'wx' })
  await writeFile(join(destination, 'index.html'), html, { flag: 'wx' })
  return manifest
}

async function main() {
  const { values } = parseArgs({ options: { input: { type: 'string' }, delivery: { type: 'string' }, output: { type: 'string' } } })
  const manifest = await buildSpanishTravelLevel5AudioReview(values)
  console.log(JSON.stringify({ words: manifest.items.length, pictures: manifest.images.length, clips: manifest.clips.length, output: values.output }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
