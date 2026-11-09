/** Reproducible, hash-verified level 2 picture and voice review (#166). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectPngAlpha } from './png-alpha.mjs'
import { loadSpanishTravelLevel2Plan } from './generate-spanish-travel-level-2.mjs'
import { level2AudioReviewHtml } from './build-spanish-travel-level-2-audio-review.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export async function buildLevel2MediaReview(root = process.cwd()) {
  const art = join(root, 'artifacts/spanish-travel-2-art')
  const audioRoot = join(root, 'artifacts/spanish-travel-2-audio-review')
  const [bank, requests, audio, { plan }] = await Promise.all([
    json(join(root, 'content/spanish-travel-2/draft.json')), json(join(art, 'requests.json')),
    json(join(audioRoot, 'manifest.json')), loadSpanishTravelLevel2Plan(root),
  ])
  const generated = bank.items.filter(item => item.artwork.status === 'needs-generation')
  if (generated.length !== 34 || requests.issue !== 166 || requests.requests.length !== 34 ||
      new Set(requests.requests.map(q => q.id)).size !== 34 ||
      requests.requests.some(q => !generated.some(item => item.id === q.id && item.slug === q.slug))) throw new Error('Expected exactly 34 approved image requests.')
  const images = []
  for (const item of bank.items) {
    const { id, slug, text, meaning, group, artwork } = item
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('Invalid image slug.')
    if (artwork.status === 'needs-generation') {
      const version = artwork.selectedVersion ?? 1
      if (!Number.isSafeInteger(version) || version < 1) throw new Error('Invalid selected artwork version.')
      const request = version === 1 ? requests.requests.find(q => q.id === id) : await json(join(art, 'revisions', `${slug}-v${version}-request.json`))
      if (request.id !== id || request.slug !== slug || (version > 1 && (request.version !== version || !request.ownerFeedback)) ||
          request.transparent_background !== true || (version === 1 ? request.referenceRole !== 'style-only' : !['style-only', 'geometry-and-style'].includes(request.referenceRole)) ||
          request.referencePath !== 'artifacts/card-regeneration/references/cat-style-reference.png' ||
          !request.prompt.includes('Primary request: ' + artwork.concept)) throw new Error('Image request identity changed.')
      const reference = await readFile(join(root, request.referencePath))
      if (hash(reference) !== request.referenceSha256) throw new Error('Style reference hash mismatch.')
      const record = await json(join(art, 'records', `${slug}-v${version}.json`))
      if (record.id !== id || record.slug !== slug || record.path !== `originals/${slug}-v${version}.png` ||
          record.promptSha256 !== hash(request.prompt) || record.referenceSha256 !== request.referenceSha256) throw new Error('Image record identity changed.')
      const additionalReferences = request.additionalReferences ?? []
      if (JSON.stringify(additionalReferences) !== JSON.stringify(record.additionalReferences ?? [])) throw new Error('Additional reference identity changed.')
      for (const extra of additionalReferences) {
        if (extra.role !== 'strict-geometry' || extra.path !== `artifacts/spanish-travel-2-art/revisions/${slug}-geometry-reference.png` ||
            hash(await readFile(join(root, extra.path))) !== extra.sha256) throw new Error('Geometry reference hash mismatch.')
      }
      const bytes = await readFile(join(art, record.path))
      if (hash(bytes) !== record.sha256) throw new Error('Generated image hash mismatch.')
      const pixels = inspectPngAlpha(bytes)
      if (pixels.width !== pixels.height || pixels.width < 1024 || !pixels.transparentPixels || !pixels.opaquePixels) throw new Error('Image requires a square transparent canvas and opaque subject.')
      images.push({ id, slug, text, meaning, group, source: 'generated', file: record.path,
        sha256: record.sha256, bytes: bytes.length, pixels, promptSha256: hash(request.prompt),
        referenceSha256: request.referenceSha256, additionalReferences, version, reviewStatus: 'awaiting-owner-review' })
    } else if (artwork.status === 'reuse-candidate') {
      const bytes = await readFile(join(root, artwork.candidatePath))
      if (hash(bytes) !== artwork.candidateSha256) throw new Error('Approved reuse hash mismatch.')
      images.push({ id, slug, text, meaning, group, source: 'approved-reuse', file: `reused/${slug}.jpg`,
        sha256: artwork.candidateSha256, bytes: bytes.length, sourcePath: artwork.candidatePath,
        sourceId: artwork.candidateSourceId, evidence: artwork.candidateEvidence,
        transparency: 'Existing opaque JPG preserved unchanged.', reviewStatus: 'awaiting-owner-review' })
    } else throw new Error('Unreviewed artwork preparation state.')
  }
  if (audio.issue !== 166 || audio.pack !== bank.id || audio.planIdentity !== hash(JSON.stringify(plan)) ||
      JSON.stringify(audio.items) !== JSON.stringify(plan.items) || JSON.stringify(audio.voices) !== JSON.stringify(plan.voices) ||
      audio.clips.length !== 288 || new Set(audio.clips.map(c => `${c.id}:${c.voice}`)).size !== 288) throw new Error('Audio review matrix changed.')
  for (const clip of audio.clips) {
    const item = plan.items.find(i => i.id === clip.id), voice = plan.voices.find(v => v.voice === clip.voice)
    if (!item || !voice || item.text !== clip.text || voice.id !== clip.voiceId ||
        clip.file !== `audio/${voice.voice}/${item.id}.mp3`) throw new Error('Audio word or voice identity changed.')
    const bytes = await readFile(join(audioRoot, clip.file))
    if (bytes.length !== clip.deliveryBytes || hash(bytes) !== clip.deliverySha256) throw new Error('Review recording hash mismatch.')
  }
  // Validate all media before writing the gallery or copying approved originals.
  await mkdir(join(art, 'reused'), { recursive: true })
  for (const image of images.filter(i => i.source === 'approved-reuse')) await copyFile(join(root, image.sourcePath), join(art, image.file))
  const manifest = { issue: 166, pack: bank.id, status: 'generated-awaiting-owner-media-review',
    tool: 'built-in image_gen', generatedImages: 34, reusedImages: 2, expectedClips: 288,
    audioManifest: '../spanish-travel-2-audio-review/manifest.json', audioManifestSha256: hash(await readFile(join(audioRoot, 'manifest.json'))), images }
  const figures = images.map(image => `<figure><a href="${escape(image.file)}"><img width="145" height="145" src="${escape(image.file)}" alt="${escape(image.meaning)}"></a><figcaption><span lang="es-419">${escape(image.text)}</span><small>${escape(image.meaning)} · ${image.source === 'generated' ? 'New artwork' : 'Reused artwork'}</small></figcaption></figure>`)
  const galleryAudio = { ...audio, clips: audio.clips.map(c => ({ ...c, file: '../spanish-travel-2-audio-review/' + c.file })) }
  let html = level2AudioReviewHtml(galleryAudio)
    .replace('listen to the full pack', 'pictures and voices')
    .replace('36 words · 8 voices · 4 regional pairs · 288 recordings.', '36 pictures · 8 voices · 4 regional pairs · 288 recordings.')
    .replace('AI-generated audio, matched', '<a href="artwork.html">See all 36 pictures together</a>. AI-generated audio, matched')
    .replace('Final listening approval is pending.', 'Picture and listening approval is pending.')
    .replace('href="normalization-summary.json"', 'href="../spanish-travel-2-audio-review/normalization-summary.json"')
    .replace('href="manifest.json">Full recording provenance', 'href="../spanish-travel-2-audio-review/manifest.json">Full recording provenance')
    .replace('</style>', 'figure{margin:0 0 20px;display:flex;align-items:center;gap:20px}figure img{object-fit:contain;background:#faf7fd;border-radius:14px;max-width:100%}figcaption small{display:block;color:#715a83}@media(max-width:400px){figure{gap:12px}figcaption{font-size:15px}}article>h2{scroll-margin-top:20px}</style>')
  let index = 0
  html = html.replace(/<div class="clips">/g, () => figures[index++] + '<div class="clips">')
  if (index !== 36) throw new Error('Gallery did not include every picture.')
  const artworkHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spanish travel level 2 · artwork</title><style>*{box-sizing:border-box}body{margin:0;background:#f8f4fc;color:#302148;font:17px/1.5 system-ui,sans-serif}header,main{max-width:1120px;margin:auto;padding:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:18px}figure{margin:0;padding:18px;border-radius:18px;background:white;text-align:center}img{width:145px;height:145px;object-fit:contain}figcaption small{display:block;color:#715a83}a{color:#634098}figcaption{margin-top:12px}</style><header><h1>Spanish travel level 2 · artwork</h1><p>34 new illustrations and 2 approved reuses, shown at the 145px card size. Click a picture for its full original.</p><a href="review.html">Review pictures with all eight voices</a></header><main>${figures.join('\n')}</main></html>`
  await writeFile(join(art, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(join(art, 'review.html'), html)
  await writeFile(join(art, 'artwork.html'), artworkHtml)
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  buildLevel2MediaReview().then(result => console.log(JSON.stringify({ pictures: result.images.length, recordings: result.expectedClips }))).catch(error => { console.error(error.message); process.exitCode = 1 })
}
