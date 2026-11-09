/** Complete/pending artwork-only review of the exact Food level 2 authorization (#231). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectPngAlpha } from './png-alpha.mjs'
const FOOD = 'content/spanish-food-2', ART = 'artifacts/spanish-food-2-art'
const DRAFT = FOOD + '/draft.json', APPROVAL = FOOD + '/generation-approval.json', PROPOSAL = FOOD + '/proposal-v1.json'
const REQUESTS = ART + '/requests.json', SELECTION = ART + '/selection.json'
const AUTHORIZATION_SHA256 = '9f745d07af3e70cf6bda3b7104549f91db4d31441b4f567757df8f642c08cd33'
const STYLE = 'public/images/approved/es-419-travel-strawberry-b5b3b2ee6fe2.png'
const BANK = 'content/es-419-travel-2.json', EVIDENCE = 'content/spanish-travel-2/activation.json', ACCEPTANCE = 'content/spanish-travel-2/acceptance.json'
const hash = b => createHash('sha256').update(b).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const unexpectedReferences = value => value.additionalReferences !== undefined && (!Array.isArray(value.additionalReferences) || value.additionalReferences.length > 0)
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
async function noSymlink(root, path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some(p => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(p))) throw Error('Unsafe Food2 artwork path.')
  let current = resolve(root)
  if ((await lstat(current)).isSymbolicLink()) throw Error('Food2 artwork paths must not contain symlinks.')
  for (const part of path.split('/')) {
    current = join(current, part)
    try { if ((await lstat(current)).isSymbolicLink()) throw Error('Food2 artwork paths must not contain symlinks.') } catch (e) { if (e.code !== 'ENOENT') throw e }
  }
}
async function bytes(root, path, optional = false) {
  await noSymlink(root, path)
  try { return await readFile(join(root, path)) } catch (e) { if (optional && e.code === 'ENOENT') return null; throw e }
}
const wordIdentity = ({ id, slug, text, meaning, group, membership, existingBank }) => ({ id, slug, text, meaning, group, membership, ...(existingBank ? { existingBank } : {}) })

const AMENDMENT = FOOD + '/artwork-revisions-v1.json'
const AMENDMENT_SHA256 = '4207389b25aaa31061a5046e6911e2117abee2dbc8cd991b69f971c3343909ba'
const GLASS = 'es-419-travel-drinking-glass'
async function inspectGlassAmendment(root, { amendment, inputs, draft, selection, images }) {
  const a = amendment, target = a.target
  if (a.issue !== 231 || a.pack !== draft.id || a.language !== 'es-419' || a.status !== 'artwork-revision-generation-authorized' || !a.ownerMessage || a.scope !== 'shared-drinking-glass-artwork-only' ||
      a.audioGenerationAuthorized !== false || a.runtimeActivationAuthorized !== false || a.originalDraft !== DRAFT || a.originalDraftSha256 !== hash(inputs[DRAFT]) ||
      a.originalGenerationApproval !== APPROVAL || a.originalGenerationApprovalSha256 !== hash(inputs[APPROVAL]) || a.originalRequests !== REQUESTS || a.originalRequestsSha256 !== hash(inputs[REQUESTS]) ||
      a.previousManifest !== ART+'/revisions/before-feedback-v1-manifest.json' || a.previousSelection !== ART+'/revisions/before-feedback-v1-selection.json' ||
      a.previousContactSheet !== ART+'/revisions/before-feedback-v1-contact-sheet.png' || a.request !== ART+'/revisions/glass-v1-request.json' ||
      a.expectedWords !== 36 || a.expectedNewPictures !== 32 || a.expectedReusedPictures !== 4 || a.unchangedPictureCount !== 35 || target.id !== GLASS || target.slug !== 'glass' || target.version !== 1 ||
      target.supersedes !== 'public/images/approved/ja-cup-a6b3cf43ae54.jpg') throw Error('Food2 glass amendment scope changed.')
  for (const [path,sha] of [[a.previousManifest,a.previousManifestSha256],[a.previousSelection,a.previousSelectionSha256],[a.previousContactSheet,a.previousContactSheetSha256],[a.request,a.requestSha256]]) {
    inputs[path] = await bytes(root,path)
    if (hash(inputs[path]) !== sha) throw Error('Food2 glass amendment snapshot/request bytes changed.')
  }
  const previous = JSON.parse(inputs[a.previousManifest]), priorSelection = JSON.parse(inputs[a.previousSelection])
  if (previous.issue !== 231 || previous.pack !== draft.id || previous.status !== 'generated-awaiting-owner-artwork-review' || previous.words !== 36 || previous.generatedImages !== 31 || previous.reusedImages !== 5 || previous.pendingImages !== 0 ||
      previous.draftSha256 !== hash(inputs[DRAFT]) || previous.authorizationSha256 !== hash(inputs[APPROVAL]) || previous.requestsSha256 !== hash(inputs[REQUESTS]) || previous.selectionSha256 !== hash(inputs[a.previousSelection]) ||
      priorSelection.issue !== 231 || priorSelection.pack !== draft.id || !same(previous.images,images) ||
      Object.entries(previous.inputHashes).some(([p,sha]) => p !== SELECTION && (!inputs[p] || hash(inputs[p]) !== sha)) ||
      Object.keys(selection.versions).length !== Object.keys(priorSelection.versions).length+1 || selection.versions.glass !== 1 ||
      Object.entries(priorSelection.versions).some(([slug,v]) => selection.versions[slug] !== v)) throw Error('Food2 original artwork or selected version snapshot changed.')
  const index = images.findIndex(i => i.id === GLASS), prior = images[index], q = JSON.parse(inputs[a.request])
  if (!prior || prior.source !== 'approved-reuse' || prior.path !== target.supersedes || prior.sha256 !== target.supersedesSha256 ||
      q.issue !== 231 || q.pack !== draft.id || q.id !== GLASS || q.slug !== 'glass' || q.version !== 1 || q.tool !== 'built-in image_gen' || q.transparent_background !== true || !q.prompt || unexpectedReferences(q) ||
      q.editTarget.path !== prior.path || q.editTarget.sha256 !== prior.sha256 || q.editTarget.role !== 'edit-target-object-reference' ||
      q.styleReference.path !== ART+'/originals/cooking-oil-v1.png' || q.styleReference.role !== 'style-only') throw Error('Food2 glass revision request or supersession changed.')
  for (const ref of [q.editTarget,q.styleReference]) {
    inputs[ref.path] = await bytes(root,ref.path)
    if (hash(inputs[ref.path]) !== ref.sha256) throw Error('Food2 glass revision reference bytes changed.')
  }
  const expectedUses = [
    {bank:BANK,id:GLASS,language:'es-419',pack:'Travel level 2'},
    {draft:DRAFT,id:GLASS,language:'es-419',pack:'Food level 2'},
    {bank:'content/ja.json',id:'ja-cup',language:'ja-JP',pack:'Legacy Japanese starter glass'},
  ]
  if (!same(target.sharedUses,expectedUses)) throw Error('Food2 shared glass identities changed.')
  inputs['content/ja.json'] = await bytes(root,'content/ja.json')
  const japanese = JSON.parse(inputs['content/ja.json']), oldJapanese = japanese.items.find(i => i.id === 'ja-cup')
  const spanish = JSON.parse(inputs[BANK]).items.find(i => i.id === GLASS), food = draft.items.find(i => i.id === GLASS)
  if (japanese.language !== 'ja-JP' || !oldJapanese || oldJapanese.language !== 'ja-JP' || oldJapanese.text !== 'コップ' || 'public/'+oldJapanese.image.src !== target.supersedes ||
      !spanish || spanish.language !== 'es-419' || spanish.text !== 'vaso' || 'public/'+spanish.image.src !== target.supersedes || food.text !== 'vaso' || food.artwork.path !== target.supersedes) throw Error('Food2 current shared glass source mapping changed.')
  const recordPath = ART+'/records/glass-v1.json', recordBytes = await bytes(root,recordPath,true), path = ART+'/originals/glass-v1.png'
  const replacement = { ...wordIdentity(food), source:'pending', version:1, concept:q.prompt.split('Primary request: ')[1].split('\nComposition:')[0], supersedes:target.supersedes, supersedesSha256:target.supersedesSha256 }
  if (recordBytes) {
    const r = JSON.parse(recordBytes)
    if (r.id !== GLASS || r.slug !== 'glass' || r.version !== 1 || r.path !== 'originals/glass-v1.png' || r.tool !== 'built-in image_gen' || r.promptSha256 !== hash(q.prompt) ||
        r.editTargetSha256 !== q.editTarget.sha256 || r.styleReferenceSha256 !== q.styleReference.sha256 || r.supersedes !== target.supersedes || r.supersedesSha256 !== target.supersedesSha256 ||
        unexpectedReferences(r) || !/^[a-f0-9]{64}$/.test(r.sha256)) throw Error('Food2 glass revision record or supersession changed.')
    const data = await bytes(root,path)
    if (hash(data) !== r.sha256) throw Error('Food2 glass revision image bytes changed.')
    const pixels = inspectPngAlpha(data)
    if (r.bytes !== data.length || r.width !== pixels.width || r.height !== pixels.height) throw Error('Food2 glass revision record measurements changed.')
    if (pixels.width !== pixels.height || pixels.width < 1024 || !pixels.transparentPixels || !pixels.opaquePixels) throw Error('Food2 glass revision requires square transparent PNG and opaque subject.')
    Object.assign(replacement,{source:'generated',path,sha256:r.sha256,bytes:data.length,pixels,promptSha256:r.promptSha256,editTargetSha256:r.editTargetSha256,styleReferenceSha256:r.styleReferenceSha256,record:recordPath,recordSha256:hash(recordBytes)})
  }
  images[index] = replacement
  return {artworkAmendment:AMENDMENT,artworkAmendmentSha256:hash(inputs[AMENDMENT]),request:a.request,requestSha256:hash(inputs[a.request]),
    previousManifest:a.previousManifest,previousManifestSha256:a.previousManifestSha256,previousSelection:a.previousSelection,previousSelectionSha256:a.previousSelectionSha256,
    previousContactSheet:a.previousContactSheet,previousContactSheetSha256:a.previousContactSheetSha256,unchangedPictureCount:35,unchangedImages:images.filter(i => i.id !== GLASS).map(({id,path,sha256}) => ({id,path,sha256})),
    sharedReplacement:{source:replacement.source,...(replacement.path ? {path:replacement.path,sha256:replacement.sha256} : {}),supersedes:target.supersedes,supersedesSha256:target.supersedesSha256,targets:expectedUses.map(use => ({...use,...(replacement.path ? {path:replacement.path,sha256:replacement.sha256} : {})}))}}
}

/** Read-only; missing records are pending, but every existing record and image must validate. */
export async function inspectFoodLevel2Art(root = process.cwd()) {
  const inputPaths = [DRAFT, APPROVAL, PROPOSAL, REQUESTS, SELECTION]
  const inputs = Object.fromEntries(await Promise.all(inputPaths.map(async p => [p, await bytes(root, p)])))
  const amendmentBytes = await bytes(root,AMENDMENT,true), amendment = amendmentBytes ? JSON.parse(amendmentBytes) : null
  if (amendmentBytes && hash(amendmentBytes) !== AMENDMENT_SHA256) throw Error('Authorized Food2 glass amendment bytes changed.')
  if (amendmentBytes) inputs[AMENDMENT] = amendmentBytes
  const draft = JSON.parse(inputs[DRAFT]), auth = JSON.parse(inputs[APPROVAL]), proposal = JSON.parse(inputs[PROPOSAL]), requests = JSON.parse(inputs[REQUESTS]), selection = JSON.parse(inputs[SELECTION])
  if (hash(inputs[APPROVAL]) !== AUTHORIZATION_SHA256 || auth.issue !== 231 || auth.pack !== 'es-419-food-2' || auth.language !== 'es-419' || auth.status !== 'artwork-generation-authorized' || auth.ownerMessage !== "Let's do it." ||
      auth.scope !== 'artwork-only' || auth.audioGenerationAuthorized !== false || auth.runtimeActivationAuthorized !== false || auth.reviewWorkflow !== 'complete-pack-before-owner-feedback' ||
      auth.draft !== DRAFT || auth.draftSha256 !== hash(inputs[DRAFT]) || auth.approvedProposal !== PROPOSAL || auth.approvedProposalSha256 !== hash(inputs[PROPOSAL]) ||
      auth.requests !== REQUESTS || auth.requestsSha256 !== hash(inputs[REQUESTS]) || auth.words !== 36 || auth.newPictures !== 31 || auth.reusedPictures !== 5) throw Error('Food2 authorization or approved input bytes changed.')
  if (draft.issue !== 231 || draft.id !== auth.pack || draft.packId !== 'es-419-food-2-pictures' || draft.language !== 'es-419' || draft.exercise !== 'audio-picture' || draft.interfaceLanguage !== 'en' ||
      draft.status !== 'word-list-approved-artwork-generation-authorized' || draft.generationAuthorized !== true || draft.audioGenerationAuthorized !== false || draft.runtimeActivationAuthorized !== false ||
      !Array.isArray(draft.items) || draft.items.length !== 36 || new Set(draft.items.map(i => i.id)).size !== 36 || new Set(draft.items.map(i => i.slug)).size !== 36 ||
      !Array.isArray(draft.groups) || draft.groups.length !== 6 || new Set(draft.groups.map(g => g.id)).size !== 6 || draft.groups.some(g => !/^[a-z0-9-]+$/.test(g.id) || !g.title || draft.items.filter(i => i.group === g.id).length !== 6) ||
      !same(draft.scope, { words:36, newSpanishItems:31, existingSpanishItems:5, newPictures:31, artworkReuses:5, audioGenerationAuthorized:false, runtimeActivationAuthorized:false }) ||
      draft.items.filter(i => i.membership === 'new-spanish-item' && i.artwork.source === 'needs-generation').length !== 31 ||
      draft.items.filter(i => i.membership === 'existing-spanish-item' && i.artwork.source === 'approved-reuse').length !== 5) throw Error('Food2 draft identity or scope changed.')
  if (proposal.issue !== 231 || proposal.id !== draft.id || proposal.status !== 'word-list-proposal' || proposal.generationAuthorized !== false ||
      !same(proposal.items.map(wordIdentity), draft.items.map(wordIdentity)) || !same(proposal.groups, draft.groups)) throw Error('Food2 original proposed word identities changed.')
  if (requests.issue !== 231 || requests.pack !== draft.id || requests.draftSha256 !== hash(inputs[DRAFT]) || requests.tool !== 'built-in image_gen' || !Array.isArray(requests.requests) || requests.requests.length !== 31 ||
      new Set(requests.requests.map(q => q.id)).size !== 31 || new Set(requests.requests.map(q => q.slug)).size !== 31 ||
      selection.issue !== 231 || selection.pack !== draft.id || !selection.versions || typeof selection.versions !== 'object' || Array.isArray(selection.versions) ||
      Object.entries(selection.versions).some(([slug, version]) => version !== 1 || !(amendment && slug === 'glass') && !draft.items.some(i => i.slug === slug && i.artwork.source === 'needs-generation'))) throw Error('Food2 request or selected version scope changed.')
  inputs[STYLE] = await bytes(root, STYLE)
  const styleHash = hash(inputs[STYLE])
  // Check every request and its style source before considering any optional generation record.
  for (const q of requests.requests) {
    const item = draft.items.find(i => i.id === q.id)
    if (!item || item.artwork.source !== 'needs-generation' || q.slug !== item.slug || q.group !== item.group || q.version !== 1 || q.transparent_background !== true ||
        q.referenceRole !== 'style-only' || q.referencePath !== STYLE || q.referenceSha256 !== styleHash || typeof q.prompt !== 'string' ||
        !q.prompt.includes(`Subject: ${item.meaning} (${item.text}).`) || !q.prompt.includes('Primary request: ' + item.artwork.concept) || unexpectedReferences(q)) throw Error('Food2 approved request or style reference changed.')
  }
  for (const path of [BANK, EVIDENCE, ACCEPTANCE]) inputs[path] = await bytes(root, path)
  const bank = JSON.parse(inputs[BANK]), evidence = JSON.parse(inputs[EVIDENCE]), acceptance = JSON.parse(inputs[ACCEPTANCE])
  if (bank.id !== 'es-419-travel-2' || bank.language !== 'es-419' || evidence.pack !== bank.id || evidence.language !== 'es-419' || evidence.acceptance !== ACCEPTANCE || evidence.acceptanceSha256 !== hash(inputs[ACCEPTANCE]) ||
      acceptance.pack !== bank.id || acceptance.language !== 'es-419' || acceptance.status !== 'accepted-for-activation') throw Error('Food2 approved reuse acceptance changed.')
  const images = []
  for (const item of draft.items) {
    if (!/^es-419-(food|travel)-[a-z0-9-]+$/.test(item.id) || !/^[a-z0-9-]+$/.test(item.slug) || !item.text || !item.meaning || !draft.groups.some(g => g.id === item.group)) throw Error('Invalid Food2 word identity.')
    const identity = wordIdentity(item), a = item.artwork
    if (a.source === 'approved-reuse') {
      const old = proposal.items.find(i => i.id === item.id), word = bank.items.find(i => i.id === item.id)
      if (item.membership !== 'existing-spanish-item' || item.existingBank !== BANK || !same(old.artwork, a) || a.sourceId !== item.id || a.evidence !== EVIDENCE ||
          !/^public\/images\/approved\/[a-zA-Z0-9-]+\.(jpg|png)$/.test(a.path) || !word || word.language !== 'es-419' || word.text !== item.text || word.label !== item.meaning || 'public/' + word.image.src !== a.path) throw Error('Food2 existing Spanish reuse identity changed.')
      const entry = evidence.images.find(i => i.id === item.id && 'public/' + i.src === a.path && i.sha256 === a.sha256)
      if (!entry) throw Error('Food2 approved reuse evidence changed.')
      const data = await bytes(root, a.path)
      if (hash(data) !== a.sha256 || data.length !== entry.bytes) throw Error('Food2 approved reuse bytes changed.')
      images.push({ ...identity, source:'approved-reuse', path:a.path, sha256:a.sha256, bytes:data.length, sourceId:a.sourceId, evidence:a.evidence })
    } else {
      if (item.membership !== 'new-spanish-item' || !item.id.startsWith('es-419-food-') || item.existingBank !== undefined || a.source !== 'needs-generation' || !a.concept) throw Error('Unapproved Food2 generated item.')
      const q = requests.requests.find(q => q.id === item.id), recordPath = `${ART}/records/${item.slug}-v1.json`, recordBytes = await bytes(root, recordPath, true)
      if (!recordBytes) { images.push({ ...identity, source:'pending', concept:a.concept }); continue }
      const record = JSON.parse(recordBytes), path = `${ART}/originals/${item.slug}-v1.png`
      if (record.id !== item.id || record.slug !== item.slug || record.version !== 1 || record.path !== `originals/${item.slug}-v1.png` || record.tool !== 'built-in image_gen' ||
          record.promptSha256 !== hash(q.prompt) || record.referenceSha256 !== q.referenceSha256 ||
          (record.referenceRole !== undefined && record.referenceRole !== q.referenceRole) || (record.referencePath !== undefined && record.referencePath !== q.referencePath) || unexpectedReferences(record) || !/^[a-f0-9]{64}$/.test(record.sha256)) throw Error('Food2 generated record identity changed.')
      const data = await bytes(root, path)
      if (hash(data) !== record.sha256) throw Error('Food2 generated image bytes changed.')
      const pixels = inspectPngAlpha(data)
      if ((record.bytes !== undefined && record.bytes !== data.length) || (record.width !== undefined && record.width !== pixels.width) ||
          (record.height !== undefined && record.height !== pixels.height)) throw Error('Food2 generated record measurements changed.')
      if (pixels.width !== pixels.height || pixels.width < 1024 || !pixels.transparentPixels || !pixels.opaquePixels) throw Error('Food2 generated image requires a square canvas at least1024px, transparent margins and an opaque subject.')
      images.push({ ...identity, source:'generated', version:1, concept:a.concept, path, sha256:record.sha256, bytes:data.length, pixels,
        promptSha256:record.promptSha256, referenceSha256:record.referenceSha256, record:recordPath, recordSha256:hash(recordBytes) })
    }
  }
  const amendmentEvidence = amendment ? await inspectGlassAmendment(root,{amendment,inputs,draft,selection,images}) : null
  const generatedImages = images.filter(i => i.source === 'generated').length, reusedImages = images.filter(i => i.source === 'approved-reuse').length, pendingImages = images.filter(i => i.source === 'pending').length
  return { issue:231, pack:draft.id, language:'es-419', status:pendingImages ? 'artwork-generation-in-progress' : 'generated-awaiting-owner-artwork-review', words:36, newSpanishItems:31, existingSpanishItems:5,
    generatedImages, reusedImages, pendingImages, expectedNewImages:amendment ? 32 : 31, audioGenerationAuthorized:false, runtimeActivationAuthorized:false, reviewWorkflow:auth.reviewWorkflow,
    draft:DRAFT, draftSha256:hash(inputs[DRAFT]), authorization:APPROVAL, authorizationSha256:hash(inputs[APPROVAL]), approvedProposal:PROPOSAL, approvedProposalSha256:hash(inputs[PROPOSAL]),
    requests:REQUESTS, requestsSha256:hash(inputs[REQUESTS]), selection:SELECTION, selectionSha256:hash(inputs[SELECTION]),
    inputHashes:Object.fromEntries(Object.entries(inputs).map(([p,b]) => [p,hash(b)])), groups:draft.groups, ...(amendmentEvidence ? {amendmentEvidence,sharedReplacement:amendmentEvidence.sharedReplacement} : {}), images }
}

export function foodLevel2ArtReviewHtml(manifest, artworkOnly = false) {
  const e = escape, cards = manifest.images.map((i, n) => `<article data-item-id="${e(i.id)}" data-group="${e(i.group)}" data-source="${e(i.source)}" data-search="${e(i.text + ' ' + i.meaning)}"><figure>${i.path ? `<a href="../../${e(i.path)}"><img width="145" height="145" src="../../${e(i.path)}" alt="${e(i.meaning)}"></a>` : '<div class="placeholder">Picture generation pending</div>'}</figure><h2 lang="es-419">${n+1}. ${e(i.text)}</h2><p>${e(i.meaning)}</p><span class="badge ${e(i.source)}">${i.source === 'generated' ? 'New illustration' : i.source === 'approved-reuse' ? 'Approved reuse' : 'Pending'}</span>${!artworkOnly && i.concept ? `<details><summary>Picture concept</summary><p>${e(i.concept)}</p></details>` : ''}</article>`).join('\n')
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spanish Food level 2 · artwork review</title><style>*{box-sizing:border-box}body{margin:0;background:#faf6fd;color:#302148;font:17px/1.5 system-ui,sans-serif}header,main{max-width:1200px;margin:auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}article{background:white;border:1px solid #e4d7f0;border-radius:18px;padding:18px;text-align:center}figure{margin:0 0 12px;display:flex;justify-content:center}img,.placeholder{width:145px;height:145px;object-fit:contain}.placeholder{display:grid;place-items:center;padding:10px;background:#f2eafa;border-radius:12px;color:#715a83}h2{font-size:22px;line-height:1.3;margin:0}article p{margin:6px 0 10px}.badge{display:inline-block;font-size:14px;border-radius:12px;padding:4px 10px;background:#f2eafa}.generated{background:#fff0ce}.approved-reuse{background:#e6f5e3}input,select{font:inherit;max-width:100%;border:1px solid #b49acb;border-radius:10px;padding:10px;color:inherit;background:white}label{display:block;margin-top:10px}a{color:#634098}summary{cursor:pointer;min-height:44px;padding:8px 0}details{text-align:left;font-size:15px}[hidden]{display:none!important}@media(max-width:500px){header,main{padding:16px}.grid{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}}</style><header><h1>Spanish Food level 2 · artwork review</h1><p>36 words · ${manifest.generatedImages} new pictures ready · ${manifest.reusedImages} approved reuses · ${manifest.pendingImages} pending.</p><p>${manifest.pendingImages ? 'Generation is in progress; the complete pack will be reviewed together.' : 'All 36 pictures are ready for consolidated owner review.'} Artwork acceptance remains pending. No new audio or practice activation is included.</p><p><a href="../../${ART}/${artworkOnly ? 'review.html' : 'artwork.html'}">${artworkOnly ? 'Pictures with concepts' : 'All pictures at145px'}</a> · <a href="../../${DRAFT}">Approved draft</a> · <a href="../../${PROPOSAL}">Original proposal</a> · <a href="../../${APPROVAL}">Generation authorization</a> · <a href="../../${REQUESTS}">Exact prompts</a> · <a href="../../${ART}/manifest.json">Verified provenance</a>${manifest.amendmentEvidence ? ` · <a href="../../${ART}/shared-glass-review.html">Shared glass replacement</a> · <a href="../../${manifest.amendmentEvidence.artworkAmendment}">Owner artwork feedback</a>` : ''}</p><label>Find a word <input id="search" type="search" placeholder="Spanish or English"></label><label>Food group <select id="group"><option value="all">All six groups</option>${manifest.groups.map(g => `<option value="${e(g.id)}">${e(g.title)}</option>`).join('')}</select></label><label>Artwork source <select id="source"><option value="all">All artwork</option><option value="generated">New illustrations</option><option value="approved-reuse">Approved reuses</option><option value="pending">Pending</option></select></label><p id="count" role="status">36 words</p></header><main class="grid">${cards}</main><script>const articles=[...document.querySelectorAll('article')],search=document.querySelector('#search'),group=document.querySelector('#group'),source=document.querySelector('#source'),fold=s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();function filter(){let n=0;for(const a of articles){a.hidden=!fold(a.dataset.search).includes(fold(search.value))||(group.value!=='all'&&a.dataset.group!==group.value)||(source.value!=='all'&&a.dataset.source!==source.value);if(!a.hidden)n++}document.querySelector('#count').textContent=n+' words'}search.oninput=filter;group.onchange=filter;source.onchange=filter;</script></html>`
}

export function sharedGlassReviewHtml(manifest) {
  const shared = manifest.sharedReplacement, e = escape
  const picture = (path,alt) => path ? `<a href="../../${e(path)}"><img width="145" height="145" src="../../${e(path)}" alt="${e(alt)}"></a>` : '<div class="placeholder">Replacement generation pending</div>'
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shared drinking-glass artwork review</title><style>*{box-sizing:border-box}body{background:#faf6fd;color:#302148;font:17px/1.5 system-ui,sans-serif;margin:0}header,main{max-width:1100px;margin:auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:18px}article{background:white;border:1px solid #e4d7f0;border-radius:18px;padding:18px;text-align:center}figure{margin:0 0 12px;display:flex;justify-content:center}img,.placeholder{width:145px;height:145px;object-fit:contain}.placeholder{display:grid;place-items:center;background:#f2eafa;border-radius:12px}h2{font-size:22px}code{overflow-wrap:anywhere;font-size:14px}a{color:#634098}@media(max-width:500px){header,main{padding:16px}}</style><header><h1>One shared drinking-glass replacement</h1><p>${shared.path ? 'The same new candidate is shown for all three source uses.' : 'The shared replacement is being generated.'} Stable item identities, recordings and progress are preserved. Artwork approval and production activation remain pending. This preview does not enable retired Japanese practice.</p><p><a href="../../${ART}/review.html">Complete Food level 2 review</a> · <a href="../../${manifest.amendmentEvidence.artworkAmendment}">Owner feedback and shared-use scope</a> · <a href="../../${manifest.amendmentEvidence.request}">Exact edit/style references</a> · <a href="../../${ART}/manifest.json">Verified provenance</a></p></header><main class="grid">${shared.targets.map(t => `<article data-item-id="${e(t.id)}" data-language="${e(t.language)}"><figure>${picture(shared.path,t.language === 'ja-JP' ? 'コップ — proposed shared glass' : 'vaso — proposed shared glass')}</figure><h2>${e(t.pack)}</h2><p lang="${e(t.language)}">${t.language === 'ja-JP' ? 'コップ' : 'vaso'}</p><code>${e(t.id)}</code><p>Proposed shared replacement</p></article>`).join('')}<article data-source="superseded"><figure>${picture(shared.supersedes,'Superseded flat drinking-glass picture')}</figure><h2>Earlier picture</h2><p>Preserved for comparison and historical evidence.</p></article></main></html>`
}

export async function buildFoodLevel2ArtReview(root = process.cwd()) {
  const manifest = await inspectFoodLevel2Art(root)
  const outputs = [[ART+'/manifest.json',JSON.stringify(manifest,null,2)+'\n'],[ART+'/review.html',foodLevel2ArtReviewHtml(manifest)],[ART+'/artwork.html',foodLevel2ArtReviewHtml(manifest,true)],[FOOD+'/review.html',foodLevel2ArtReviewHtml(manifest)]]
  if (manifest.sharedReplacement) outputs.push([ART+'/shared-glass-review.html',sharedGlassReviewHtml(manifest)])
  for (const [path] of outputs) await noSymlink(root,path)
  await mkdir(join(root,ART),{recursive:true})
  for (const [path,value] of outputs) await writeFile(join(root,path),value)
  return manifest
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) buildFoodLevel2ArtReview().then(m => console.log(JSON.stringify({words:m.words,generated:m.generatedImages,reused:m.reusedImages,pending:m.pendingImages}))).catch(e => {console.error(e.message);process.exitCode=1})
