/** Progressive, hash-verified Travel level 4 artwork/listening review (#207). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectPngAlpha } from './png-alpha.mjs'
import { loadSpanishTravelLevel4Plan } from './generate-spanish-travel-level-4.mjs'
const ART = 'artifacts/spanish-travel-4-art', AUDIO = 'artifacts/spanish-travel-4-audio-review', REPLACEMENT_AUDIO = 'artifacts/spanish-travel-4-replacement-audio-review'
const STYLE = 'public/images/approved/es-419-travel-museum-22a089082940.png'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const optional = async path => { try { return await readFile(path) } catch (e) { if (e.code === 'ENOENT') return null; throw e } }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])

export async function buildLevel4MediaReview(root = process.cwd()) {
  const draftBytes = await readFile(join(root, 'content/spanish-travel-4/draft.json')), draft = JSON.parse(draftBytes)
  const approval = await json(join(root, 'content/spanish-travel-4/generation-approval.json'))
  const requests = await json(join(root, ART, 'requests.json')), selection = await json(join(root, ART, 'selection.json'))
  const amendmentBytes = await optional(join(root, 'content/spanish-travel-4/word-replacement.json'))
  const amendment = amendmentBytes ? JSON.parse(amendmentBytes) : null
  let replacementPlan = null
  if (amendment) {
    if (amendment.issue !== 207 || amendment.pack !== draft.id || amendment.status !== 'generation-authorized-media-review-pending' || amendment.baseDraftSha256 !== hash(draftBytes) ||
        amendment.retiredItemId !== 'es-419-travel-bandage' || amendment.item.id !== 'es-419-travel-power-outlet' || amendment.item.slug !== 'power-outlet' ||
        amendment.item.text !== 'enchufe' || amendment.item.meaning !== 'Power outlet' || amendment.item.group !== 'health' || amendment.voices !== 8 || amendment.recordings !== 8 ||
        amendment.artworkRequest !== ART + '/revisions/power-outlet-v1-request.json' || !same(amendment.groupTitleAmendment, { id: 'health', title: 'Practical essentials' })) throw Error('Word replacement identity changed.')
    const { loadSpanishTravelLevel4ReplacementPlan } = await import('./generate-spanish-travel-level-4-replacement.mjs')
    replacementPlan = (await loadSpanishTravelLevel4ReplacementPlan(root)).plan
  }
  const items = draft.items.map(item => amendment && item.id === amendment.retiredItemId ? amendment.item : item)
  const groups = draft.groups.map(group => amendment && group.id === amendment.groupTitleAmendment.id ? amendment.groupTitleAmendment : group)
  if (approval.issue !== 207 || approval.status !== 'generation-authorized-media-review-pending' || approval.draftSha256 !== hash(draftBytes) ||
      approval.words !== 36 || approval.voices !== 8 || approval.recordings !== 288 || approval.newPictures !== 35 || approval.approvedReuses !== 1 ||
      draft.issue !== 207 || draft.id !== 'es-419-travel-4' || draft.language !== 'es-419' || draft.items.length !== 36 || new Set(draft.items.map(i => i.id)).size !== 36 ||
      items.length !== 36 || new Set(items.map(i => i.id)).size !== 36 ||
      requests.issue !== 207 || requests.pack !== draft.id || requests.draftSha256 !== approval.draftSha256 || requests.requests.length !== 35 ||
      new Set(requests.requests.map(q => q.id)).size !== 35 || selection.issue !== 207 || !selection.versions ||
      Object.keys(selection.versions).some(slug => ![...draft.items, ...(amendment ? [amendment.item] : [])].some(i => i.slug === slug && !i.artwork.reuseCandidate))) throw Error('Approved artwork scope changed.')
  const referenceHash = hash(await readFile(join(root, STYLE)))
  for (const q of requests.requests) {
    const item = draft.items.find(i => i.id === q.id && i.slug === q.slug && !i.artwork.reuseCandidate)
    if (!item || q.version !== 1 || q.referenceRole !== 'style-only' || q.referencePath !== STYLE || q.referenceSha256 !== referenceHash ||
        q.transparent_background !== true || !q.prompt.includes('Primary request: ' + item.artwork.concept) || (q.additionalReferences ?? []).length) throw Error('Initial artwork request changed.')
  }
  const approved = await json(join(root, 'content/card-regeneration/activation.json'))
  async function picture(item, replacement = false) {
    const identity = { id: item.id, slug: item.slug, text: item.text, meaning: item.meaning, group: item.group, concept: item.artwork.concept, reviewNotes: item.reviewNotes }
    if (!/^[a-z0-9-]+$/.test(item.slug)) throw Error('Invalid artwork slug.')
    const reuse = item.artwork.reuseCandidate
    if (reuse) {
      const asset = approved.assets.find(a => a.id === reuse.sourceId && a.path === reuse.path && a.sha256 === reuse.sha256)
      if (!asset || reuse.evidence !== 'content/card-regeneration/activation.json' || hash(await readFile(join(root, reuse.path))) !== reuse.sha256) throw Error('Approved reuse changed.')
      return { ...identity, source: 'approved-reuse', path: reuse.path, sha256: reuse.sha256, sourceId: reuse.sourceId, evidence: reuse.evidence }
    }
    const version = selection.versions[item.slug] ?? 1
    if (!Number.isSafeInteger(version) || version < 1) throw Error('Invalid selected artwork version.')
    const q = version === 1 && !replacement ? requests.requests.find(q => q.id === item.id) : await json(join(root, ART, 'revisions', `${item.slug}-v${version}-request.json`))
    const ref = version === 1 ? STYLE : `${ART}/originals/${item.slug}-v${version - 1}.png`
    if (q.id !== item.id || q.slug !== item.slug || q.version !== version || q.referencePath !== ref || q.transparent_background !== true ||
        (version > 1 && (q.referenceRole !== 'edit-target' || !q.ownerFeedback || !q.concept || !q.prompt.includes('Primary request: ' + q.concept))) || (q.additionalReferences ?? []).length ||
        (replacement && version === 1 && (q.referenceRole !== 'style-only' || q.ownerSelection !== amendment.ownerSelection || !q.prompt.includes('Primary request: ' + item.artwork.concept))) ||
        hash(await readFile(join(root, ref))) !== q.referenceSha256) throw Error('Artwork reference changed.')
    if (version > 1) identity.concept = q.concept
    const recordBytes = await optional(join(root, ART, 'records', `${item.slug}-v${version}.json`))
    if (!recordBytes) return { ...identity, source: 'pending', version }
    const r = JSON.parse(recordBytes)
    if (r.id !== item.id || r.slug !== item.slug || r.version !== version || r.path !== `originals/${item.slug}-v${version}.png` || r.promptSha256 !== hash(q.prompt) ||
        r.referenceSha256 !== q.referenceSha256 || !same(r.additionalReferences ?? [], q.additionalReferences ?? [])) throw Error('Artwork record changed.')
    const path = `${ART}/${r.path}`, bytes = await readFile(join(root, path))
    if (hash(bytes) !== r.sha256) throw Error('Generated artwork bytes changed.')
    const pixels = inspectPngAlpha(bytes)
    if (pixels.width !== pixels.height || pixels.width < 1024 || !pixels.transparentPixels || !pixels.opaquePixels) throw Error('Artwork requires a square transparent canvas and opaque subject.')
    return { ...identity, source: 'generated', version, path, sha256: r.sha256, bytes: bytes.length, pixels, promptSha256: r.promptSha256, referenceSha256: r.referenceSha256 }
  }
  // Check the historical artwork and complete original audio before applying the amendment.
  let images = []
  for (const item of draft.items) images.push(await picture(item))
  if (amendment) images = images.map(image => image.id === amendment.retiredItemId ? null : image)
  if (amendment) images[draft.items.findIndex(i => i.id === amendment.retiredItemId)] = await picture(amendment.item, true)
  async function validateAudio(bytes, plan, pack, folder, expectedClips) {
    const review = JSON.parse(bytes)
    if (review.issue !== 207 || review.pack !== pack || review.planIdentity !== hash(JSON.stringify(plan)) || !same(review.items, plan.items) || !same(review.voices, plan.voices) ||
        review.clips.length !== expectedClips || new Set(review.clips.map(c => c.id + ':' + c.voice)).size !== expectedClips) throw Error('Audio review matrix changed.')
    for (const clip of review.clips) {
      const item = plan.items.find(i => i.id === clip.id), voice = plan.voices.find(v => v.voice === clip.voice)
      if (!item || !voice || clip.text !== item.text || clip.voiceId !== voice.id || clip.voiceName !== voice.name || clip.file !== `audio/${voice.voice}/${item.id}.mp3`) throw Error('Audio word or voice identity changed.')
      const data = await readFile(join(root, folder, clip.file))
      if (hash(data) !== clip.deliverySha256 || data.length !== clip.deliveryBytes) throw Error('Recording bytes changed.')
    }
    return { ...review, clips: review.clips.map(clip => ({ ...clip, reviewFolder: folder })) }
  }
  const audioBytes = await optional(join(root, AUDIO, 'manifest.json'))
  let audio = null
  if (audioBytes) {
    const { plan } = await loadSpanishTravelLevel4Plan(root)
    audio = await validateAudio(audioBytes, plan, draft.id, AUDIO, 288)
  }
  const replacementAudioBytes = amendment ? await optional(join(root, REPLACEMENT_AUDIO, 'manifest.json')) : null
  if (replacementAudioBytes) {
    if (!audio) throw Error('Original audio review is required before word replacement.')
    const replacementAudio = await validateAudio(replacementAudioBytes, replacementPlan, 'es-419-travel-4-replacement', REPLACEMENT_AUDIO, 8)
    if (replacementAudio.replacementSha256 !== hash(amendmentBytes) || replacementAudio.baseDraftSha256 !== hash(draftBytes) || !same(replacementAudio.voices, audio.voices)) throw Error('Replacement audio amendment changed.')
    audio = { ...audio, items: items.map(({ id, text, meaning }) => ({ id, text, spelling: text, meaning })),
      clips: [...audio.clips.filter(c => c.id !== amendment.retiredItemId), ...replacementAudio.clips] }
  } else if (amendment && audio) audio = { ...audio, clips: audio.clips.filter(c => c.id !== amendment.retiredItemId) }
  const generatedImages = images.filter(i => i.source === 'generated').length, reusedImages = images.filter(i => i.source === 'approved-reuse').length
  const pendingImages = images.filter(i => i.source === 'pending').length
  const complete = generatedImages === 35 && reusedImages === 1 && pendingImages === 0 && audio?.clips.length === 288
  const manifest = { issue: 207, pack: draft.id, status: complete ? 'generated-awaiting-owner-media-review' : 'generation-in-progress', draftSha256: approval.draftSha256,
    tool: 'built-in image_gen', generatedImages, reusedImages, pendingImages,
    expectedNewImages: 35, expectedClips: 288, recordings: audio?.clips.length ?? 0,
    ...(audioBytes ? { audioManifest: `${AUDIO}/manifest.json`, audioManifestSha256: hash(audioBytes) } : {}),
    ...(amendment ? { wordReplacement: 'content/spanish-travel-4/word-replacement.json', wordReplacementSha256: hash(amendmentBytes), retiredItemId: amendment.retiredItemId,
      ...(replacementAudioBytes ? { replacementAudioManifest: `${REPLACEMENT_AUDIO}/manifest.json`, replacementAudioManifestSha256: hash(replacementAudioBytes) } : {}) } : {}), images }
  const shell = (title, body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#faf6fd;color:#302148;font:17px/1.5 system-ui}header,main{max-width:1100px;margin:auto;padding:24px}a{color:#634098}article{padding:20px;background:white;border:1px solid #e4d7f0;border-radius:18px;margin-bottom:18px}h2{margin:0}figure{margin:0 0 12px}img{width:145px;height:145px;object-fit:contain}.pending{width:145px;height:145px;display:grid;place-items:center;background:#f2eafa;border-radius:14px;color:#715a83;text-align:center}.voice{border-top:1px solid #e4d7f0;padding:12px 0}.voice strong,.voice small{display:block}audio{width:100%;max-width:420px;display:block}summary{cursor:pointer;min-height:44px;padding:8px 0}input,select,button{font:inherit;border:1px solid #b49acb;border-radius:10px;padding:10px;max-width:100%;color:inherit;background:white}label{display:block;margin-top:10px}small{color:#715a83}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px}.grid article{margin:0;text-align:center}.grid figure{display:grid;justify-content:center}[hidden]{display:none!important}@media(max-width:500px){header,main{padding:16px}}</style>${body}</html>`
  const figure = image => image.source === 'pending' ? '<figure><div class="pending">Picture generation pending</div></figure>' : `<figure><a href="../../${esc(image.path)}"><img width="145" height="145" src="../../${esc(image.path)}" alt="${esc(image.meaning)}"></a></figure>`
  const progress = `<p>${generatedImages} new pictures ready · ${reusedImages} approved reuse · ${manifest.pendingImages} pictures pending · ${manifest.recordings} of 288 recordings ready.</p><p>${complete ? 'All 36 pictures and 288 recordings are ready for full-pack review.' : 'Generation is in progress. The owner will review the full pack together once all pictures and recordings are ready.'} This pack is not active; picture and listening acceptance remain pending.</p>`
  const filters = `<label>Find a word <input id="search" type="search" placeholder="Spanish or English"></label><label>Word group <select id="group"><option value="all">All 36 words</option>${groups.map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('')}</select></label><p id="count" role="status">36 words</p>`
  const script = `<script>const entries=[...document.querySelectorAll('article')],search=document.querySelector('#search'),group=document.querySelector('#group'),normal=s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();let active;function stop(){if(active&&!active.paused)active.pause();active=null}function filter(){stop();let n=0;for(const el of entries){el.hidden=(group.value!=='all'&&el.dataset.group!==group.value)||!normal(el.dataset.search).includes(normal(search.value));if(!el.hidden)n++}document.querySelector('#count').textContent=n+' words'}search.oninput=filter;group.onchange=filter;document.querySelector('#stop-audio').onclick=stop;document.querySelectorAll('audio').forEach(a=>a.addEventListener('play',()=>{if(active&&active!==a&&!active.paused)active.pause();active=a}));window.addEventListener('pagehide',stop)</script>`
  const clips = new Map(audio?.clips.map(c => [c.id + ':' + c.voice, c]))
  const articles = images.map(image => {
    const item = items.find(i => i.id === image.id)
    const controls = audio && audio.voices.every(v => clips.has(image.id + ':' + v.voice)) ? `<details><summary>Listen · eight voices</summary>${audio.voices.map(v => {
      const c = clips.get(image.id + ':' + v.voice)
      return `<div class="voice"><strong>${esc(v.name)}</strong><small>${esc(v.region)}</small><audio controls preload="none" src="../../${esc(c.reviewFolder)}/${esc(c.file)}" aria-label="${esc(v.name + ': ' + image.text)}"></audio>${c.targetLimited ? '<small>Slightly quieter within processing limits</small>' : ''}</div>`
    }).join('')}</details>` : '<p>Audio generation in progress.</p>'
    return `<article data-group="${esc(image.group)}" data-search="${esc(image.text + ' ' + image.meaning)}">${figure(image)}<h2 lang="es-419">${esc(image.text)}</h2><p>${esc(image.meaning)} · ${image.source === 'pending' ? 'Picture pending' : image.source === 'generated' ? 'New illustration' : 'Approved artwork reuse'}</p><details><summary>Picture concept and notes</summary><p>${esc(image.concept)}</p><p>${item.reviewNotes.map(esc).join(' ')}</p></details>${controls}</article>`
  }).join('\n')
  const review = shell('Travel level 4 · pictures and voices', `<header><h1>Travel level 4 · pictures and voices</h1>${progress}<p><a href="artwork.html">All pictures at card size</a> · <a href="../../content/spanish-travel-4/README.md">Pack notes</a> · <a href="requests.json">Artwork prompts</a> · <a href="manifest.json">Media provenance</a>${audio && !amendment ? ' · <a href="../spanish-travel-4-audio-review/index.html">Audio-only review</a>' : ''}${amendment ? ' · <a href="../../content/spanish-travel-4/word-replacement.json">Owner word replacement</a>' : ''}</p><button id="stop-audio" type="button">Stop audio</button>${filters}</header><main>${articles}</main>${script}`)
  const artwork = shell('Travel level 4 · artwork', `<header><h1>Travel level 4 · artwork</h1>${progress}<p>Pictures shown at 145px. Click for the full original.</p><a href="review.html">Pictures and all eight voices</a></header><main class="grid">${images.map(i => `<article>${figure(i)}<h2 lang="es-419">${esc(i.text)}</h2><small>${esc(i.meaning)}</small></article>`).join('')}</main>`)
  const wordReview = shell('Travel level 4 · current word review', `<header><h1>Travel level 4 · current word review</h1><p>36 current words · Latin American Spanish · Pictures · English interface. Media acceptance and activation remain pending.</p><p><a href="../../artifacts/spanish-travel-4-art/review.html">Pictures and all eight voices</a> · <a href="draft.json">Original approved draft</a>${amendment ? ' · <a href="word-replacement.json">Owner word replacement</a>' : ''}</p><label>Find a word <input id="search" type="search" placeholder="Spanish or English"></label><p id="count" role="status">36 words</p></header><main>${groups.map(group => `<section id="${esc(group.id)}"><h2>${esc(group.title)}</h2>${items.filter(item => item.group === group.id).map(item => { const image = images.find(i => i.id === item.id); return `<article data-search="${esc(item.text + ' ' + item.meaning)}"><h3 lang="es-419">${esc(item.text)}</h3><p>${esc(item.meaning)}</p>${image.source === 'approved-reuse' ? figure(image) : ''}<details><summary>Current picture concept and notes</summary><p>${esc(image.concept)}</p><p>${item.reviewNotes.map(esc).join(' ')}</p></details></article>` }).join('')}</section>`).join('')}</main><script>const normalizeWord=s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();document.querySelector('#search').oninput=e=>{let n=0;for(const a of document.querySelectorAll('article')){a.hidden=!normalizeWord(a.dataset.search).includes(normalizeWord(e.target.value));if(!a.hidden)n++}for(const section of document.querySelectorAll('section'))section.hidden=![...section.querySelectorAll('article')].some(a=>!a.hidden);document.querySelector('#count').textContent=n+' words'}</script>`)
  await mkdir(join(root, ART), { recursive: true })
  await writeFile(join(root, ART, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(join(root, ART, 'review.html'), review)
  await writeFile(join(root, ART, 'artwork.html'), artwork)
  await writeFile(join(root, 'content/spanish-travel-4/review.html'), wordReview)
  return manifest
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) buildLevel4MediaReview().then(m => console.log(JSON.stringify({ pictures: m.generatedImages + m.reusedImages, pending: m.pendingImages, recordings: m.recordings }))).catch(e => { console.error(e.message); process.exitCode = 1 })
