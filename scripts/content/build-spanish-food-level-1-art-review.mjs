/** Exact approved/reused Food level 1 artwork review (#218); no generation or activation. */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectPngAlpha } from './png-alpha.mjs'
const ART = 'artifacts/spanish-food-1-art', DRAFT = 'content/spanish-food-1/draft.json', APPROVAL = 'content/spanish-food-1/generation-approval.json'
const REQUESTS = ART + '/requests.json', SELECTION = ART + '/selection.json'
const STYLE = 'public/images/approved/es-419-travel-strawberry-b5b3b2ee6fe2.png'
const BANKS = {
  'content/es-419.json': 'content/spanish-travel-audio/activation.json',
  'content/es-419-travel-2.json': 'content/spanish-travel-2/activation.json',
  'content/es-419-travel-3.json': 'content/spanish-travel-3/activation.json',
  'content/es-419-travel-4.json': 'content/spanish-travel-4/activation.json',
}
const hash = b => createHash('sha256').update(b).digest('hex')
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
function safeRelative(path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part))) throw Error('Unsafe artwork path.')
  return path
}
async function noSymlink(root, path) {
  let current = resolve(root)
  if ((await lstat(current)).isSymbolicLink()) throw Error('Artwork paths must not contain symlinks.')
  for (const part of safeRelative(path).split('/')) {
    current = join(current, part)
    try { if ((await lstat(current)).isSymbolicLink()) throw Error('Artwork paths must not contain symlinks.') }
    catch (e) { if (e.code !== 'ENOENT') throw e }
  }
}
async function bytes(root, path, optional = false) {
  await noSymlink(root, path)
  try { return await readFile(join(root, path)) } catch (e) { if (optional && e.code === 'ENOENT') return null; throw e }
}
const json = async (root, path) => JSON.parse(await bytes(root, path))
const imagePath = path => {
  if (!/^public\/images\/approved\/[a-zA-Z0-9-]+\.(jpg|png)$/.test(path)) throw Error('Unsafe approved image path.')
  return path
}

/** Read-only preflight. Missing generation records remain pending; malformed or altered media fails closed. */
export async function inspectFoodLevel1Art(root = process.cwd()) {
  const [draftBytes, approvalBytes, requestBytes, selectionBytes] = await Promise.all([DRAFT, APPROVAL, REQUESTS, SELECTION].map(path => bytes(root, path)))
  const draft = JSON.parse(draftBytes), approval = JSON.parse(approvalBytes), requests = JSON.parse(requestBytes), selection = JSON.parse(selectionBytes)
  if (approval.issue !== 218 || approval.pack !== 'es-419-food-1' || approval.language !== 'es-419' || approval.status !== 'artwork-generation-authorized' || !approval.ownerMessage ||
      approval.scope !== 'artwork-only' || approval.audioGenerationAuthorized !== false || approval.runtimeActivationAuthorized !== false || approval.reviewWorkflow !== 'complete-pack-before-owner-feedback' ||
      approval.draft !== DRAFT || approval.requests !== REQUESTS || approval.draftSha256 !== hash(draftBytes) || approval.requestsSha256 !== hash(requestBytes) ||
      approval.words !== 36 || approval.newPictures !== 11 || approval.reusedPictures !== 25) throw Error('Food artwork authorization or approved inputs changed.')
  if (draft.issue !== 218 || draft.id !== approval.pack || draft.language !== 'es-419' || draft.packId !== 'es-419-food-1-pictures' || draft.exercise !== 'audio-picture' || draft.interfaceLanguage !== 'en' ||
      draft.items.length !== 36 || new Set(draft.items.map(i => i.id)).size !== 36 || new Set(draft.items.map(i => i.slug)).size !== 36 || draft.groups.length !== 6 ||
      new Set(draft.groups.map(g => g.id)).size !== 6 || draft.groups.some(g => !/^[a-z0-9-]+$/.test(g.id) || !g.title || draft.items.filter(i => i.group === g.id).length !== 6) ||
      draft.scope?.words !== 36 || draft.scope.existingSpanishItems !== 24 || draft.scope.newSpanishItems !== 12 || draft.scope.artworkReuses !== 25 || draft.scope.newPictures !== 11 ||
      draft.scope.audioGenerationAuthorized !== false || draft.scope.runtimeActivationAuthorized !== false ||
      draft.items.filter(i => i.membership === 'existing-spanish-item').length !== 24 || draft.items.filter(i => i.membership === 'new-spanish-item').length !== 12 ||
      draft.items.filter(i => i.artwork.source === 'approved-reuse').length !== 25 || draft.items.filter(i => i.artwork.source === 'needs-generation').length !== 11) throw Error('Food draft identity or scope changed.')
  if (requests.issue !== 218 || requests.pack !== draft.id || requests.draftSha256 !== approval.draftSha256 || requests.tool !== 'built-in image_gen' || requests.requests.length !== 11 ||
      new Set(requests.requests.map(q => q.id)).size !== 11 || selection.issue !== 218 || selection.pack !== draft.id || !selection.versions || typeof selection.versions !== 'object' || Array.isArray(selection.versions) ||
      Object.entries(selection.versions).some(([slug, version]) => version !== 1 || !draft.items.some(i => i.slug === slug && i.artwork.source === 'needs-generation'))) throw Error('Food image request or selection scope changed.')
  const styleHash = hash(await bytes(root, STYLE)), inputs = new Map(), getJson = async path => {
    if (!inputs.has(path)) inputs.set(path, await json(root, path))
    return inputs.get(path)
  }
  const images = []
  for (const item of draft.items) {
    if (!/^es-419-(food|travel)-[a-z0-9-]+$/.test(item.id) || !/^[a-z0-9-]+$/.test(item.slug) || !item.text || !item.meaning || !draft.groups.some(g => g.id === item.group)) throw Error('Invalid Food item identity.')
    const image = { id: item.id, slug: item.slug, text: item.text, meaning: item.meaning, group: item.group, membership: item.membership }
    const a = item.artwork
    if (item.membership === 'existing-spanish-item') {
      if (!Object.hasOwn(BANKS, item.existingBank) || a.source !== 'approved-reuse' || a.sourceId !== item.id || a.evidence !== BANKS[item.existingBank]) throw Error('Existing Spanish identity or evidence changed.')
      const bank = await getJson(item.existingBank), word = bank.items.find(i => i.id === item.id)
      if (!word || word.language !== 'es-419' || word.text !== item.text || word.label !== item.meaning || 'public/' + word.image.src !== a.path) throw Error('Existing Spanish word or picture changed.')
    } else if (item.membership !== 'new-spanish-item' || !item.id.startsWith('es-419-food-') || item.existingBank !== undefined) throw Error('New Food item identity changed.')
    if (a.source === 'approved-reuse') {
      imagePath(a.path)
      const evidencePath = item.membership === 'existing-spanish-item' ? BANKS[item.existingBank] : 'content/card-regeneration/activation.json'
      if (a.evidence !== evidencePath) throw Error('Approved reuse evidence changed.')
      const evidence = await getJson(evidencePath)
      const entry = (evidence.assets ?? evidence.images).find(e => e.id === a.sourceId && (e.path ?? 'public/' + e.src) === a.path && e.sha256 === a.sha256)
      if (!entry || (item.membership === 'new-spanish-item' && (item.id !== 'es-419-food-onion' || a.sourceId !== 'ja-v-223e5321ecb8'))) throw Error('Approved reuse identity or hash changed.')
      const data = await bytes(root, a.path)
      if (hash(data) !== a.sha256) throw Error('Approved reuse bytes changed.')
      images.push({ ...image, source: 'approved-reuse', path: a.path, sha256: a.sha256, bytes: data.length, sourceId: a.sourceId, evidence: a.evidence })
    } else if (a.source === 'needs-generation') {
      if (item.membership !== 'new-spanish-item' || !a.concept) throw Error('Unapproved generated Food item.')
      const q = requests.requests.find(q => q.id === item.id)
      if (!q || q.slug !== item.slug || q.version !== 1 || q.group !== item.group || q.transparent_background !== true || q.referenceRole !== 'style-only' ||
          q.referencePath !== STYLE || q.referenceSha256 !== styleHash || !q.prompt.includes('Primary request: ' + a.concept) || (q.additionalReferences ?? []).length) throw Error('Approved image request identity changed.')
      const recordBytes = await bytes(root, `${ART}/records/${item.slug}-v1.json`, true)
      if (!recordBytes) { images.push({ ...image, source: 'pending', concept: a.concept }); continue }
      const record = JSON.parse(recordBytes), path = `${ART}/originals/${item.slug}-v1.png`
      if (record.id !== item.id || record.slug !== item.slug || record.version !== 1 || record.path !== `originals/${item.slug}-v1.png` || record.tool !== 'built-in image_gen' ||
          record.promptSha256 !== hash(q.prompt) || record.referenceSha256 !== q.referenceSha256 || (record.additionalReferences ?? []).length) throw Error('Generated Food record identity changed.')
      const data = await bytes(root, path)
      if (hash(data) !== record.sha256) throw Error('Generated Food image bytes changed.')
      const pixels = inspectPngAlpha(data)
      if (pixels.width !== pixels.height || pixels.width < 1024 || !pixels.transparentPixels || !pixels.opaquePixels) throw Error('Generated Food image requires a square transparent canvas and opaque subject.')
      images.push({ ...image, source: 'generated', path, sha256: record.sha256, bytes: data.length, version: 1, pixels, concept: a.concept,
        promptSha256: record.promptSha256, referenceSha256: record.referenceSha256 })
    } else throw Error('Unsupported Food artwork source.')
  }
  const generatedImages = images.filter(i => i.source === 'generated').length, reusedImages = images.filter(i => i.source === 'approved-reuse').length, pendingImages = images.filter(i => i.source === 'pending').length
  return { issue: 218, pack: draft.id, status: pendingImages ? 'artwork-generation-in-progress' : 'generated-awaiting-owner-artwork-review', tool: 'built-in image_gen',
    words: 36, newSpanishItems: 12, existingSpanishItems: 24, generatedImages, reusedImages, pendingImages, expectedNewImages: 11,
    audioGenerationAuthorized: false, runtimeActivationAuthorized: false, draft: DRAFT, draftSha256: hash(draftBytes), authorization: APPROVAL, authorizationSha256: hash(approvalBytes),
    requests: REQUESTS, requestsSha256: hash(requestBytes), selection: SELECTION, selectionSha256: hash(selectionBytes), groups: draft.groups, images }
}

export function foodArtReviewHtml(manifest, artworkOnly = false) {
  const e = esc
  const figures = manifest.images.map(i => `<article data-item-id="${e(i.id)}" data-group="${e(i.group)}" data-source="${e(i.source)}" data-search="${e(i.text + ' ' + i.meaning)}"><figure>${i.source === 'pending' ? '<div class="pending">Picture generation pending</div>' : `<a href="../../${e(i.path)}"><img width="145" height="145" src="../../${e(i.path)}" alt="${e(i.meaning)}"></a>`}</figure><h2 lang="es-419">${e(i.text)}</h2><p>${e(i.meaning)}</p><span class="badge ${e(i.source)}">${i.source === 'generated' ? 'New illustration' : i.source === 'approved-reuse' ? 'Approved artwork reuse' : 'Pending'}</span>${!artworkOnly && i.concept ? `<details><summary>Picture concept</summary><p>${e(i.concept)}</p></details>` : ''}</article>`).join('\n')
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spanish Food level 1 · artwork review</title><style>*{box-sizing:border-box}body{margin:0;background:#faf6fd;color:#302148;font:17px/1.5 system-ui}header,main{max-width:1200px;padding:24px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}article{background:white;border:1px solid #e4d7f0;border-radius:18px;padding:18px;text-align:center}figure{margin:0 0 12px;display:flex;justify-content:center}img{width:145px;height:145px;object-fit:contain}h2{font-size:22px;line-height:1.3;margin:0}article p{margin:6px 0 10px}.pending{width:145px;height:145px;display:grid;place-items:center;padding:10px;background:#f2eafa;border-radius:12px;color:#715a83}.badge{display:inline-block;font-size:14px;border-radius:12px;padding:4px 10px;background:#f2eafa}.badge.generated{background:#fff0ce}.badge.approved-reuse{background:#e6f5e3}.badge.pending{width:auto;height:auto;display:inline-block}input,select{font:inherit;max-width:100%;border:1px solid #b49acb;border-radius:10px;padding:10px;color:inherit;background:white}label{display:block;margin-top:10px}a{color:#634098}summary{cursor:pointer;min-height:44px;padding:8px 0}details{text-align:left;font-size:15px}[hidden]{display:none!important}@media(max-width:500px){header,main{padding:16px}.grid{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}}</style><header><h1>Spanish Food level 1 · artwork review</h1><p>36 words · ${manifest.generatedImages} new pictures ready · ${manifest.reusedImages} approved reuses · ${manifest.pendingImages} pending.</p><p>${manifest.pendingImages ? 'Generation is in progress; the complete pack will be reviewed together.' : 'All 36 pictures are ready for consolidated owner review.'} Artwork acceptance remains pending. This is an artwork-only preparation; no new audio or practice activation is included.</p><p><a href="${artworkOnly ? 'review.html' : 'artwork.html'}">${artworkOnly ? 'Pictures with concepts' : 'All pictures at 145px'}</a> · <a href="../../content/spanish-food-1/README.md">Pack notes</a> · <a href="../../${e(manifest.draft)}">Approved word draft</a> · <a href="requests.json">Exact prompts</a> · <a href="manifest.json">Verified image provenance</a></p><label>Find a food <input id="search" type="search" placeholder="Spanish or English"></label><label>Food group <select id="group"><option value="all">All six groups</option>${manifest.groups.map(g => `<option value="${e(g.id)}">${e(g.title)}</option>`).join('')}</select></label><label>Artwork source <select id="source"><option value="all">All artwork</option><option value="generated">New illustrations</option><option value="approved-reuse">Approved reuses</option><option value="pending">Pending</option></select></label><p id="count" role="status">36 words</p></header><main class="grid">${figures}</main><script>const articles=[...document.querySelectorAll('article')],search=document.querySelector('#search'),group=document.querySelector('#group'),source=document.querySelector('#source'),normal=s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();function filter(){let n=0;for(const a of articles){a.hidden=!normal(a.dataset.search).includes(normal(search.value))||(group.value!=='all'&&a.dataset.group!==group.value)||(source.value!=='all'&&a.dataset.source!==source.value);if(!a.hidden)n++}document.querySelector('#count').textContent=n+' words'}search.oninput=filter;group.onchange=filter;source.onchange=filter;</script></html>`
}

export async function buildFoodLevel1ArtReview(root = process.cwd()) {
  const manifest = await inspectFoodLevel1Art(root)
  const outputs = [[`${ART}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n'], [`${ART}/review.html`, foodArtReviewHtml(manifest)], [`${ART}/artwork.html`, foodArtReviewHtml(manifest, true)]]
  for (const [path] of outputs) await noSymlink(root, path)
  await mkdir(join(root, ART), { recursive: true })
  for (const [path, value] of outputs) await writeFile(join(root, path), value)
  return manifest
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) buildFoodLevel1ArtReview().then(m => console.log(JSON.stringify({ words: m.words, generated: m.generatedImages, reused: m.reusedImages, pending: m.pendingImages }))).catch(e => { console.error(e.message); process.exitCode = 1 })
