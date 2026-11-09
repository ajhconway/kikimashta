/** Hash-verified accepted pictures and complete Food level 2 listening review (#231). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectFoodLevel2Art, loadFoodLevel2ArtworkAcceptance } from './build-spanish-food-level-2-art-review.mjs'
import { spanishAudioReviewHtml } from './build-spanish-audio-review.mjs'
const FOOD = 'content/spanish-food-2', ART = 'artifacts/spanish-food-2-art', AUDIO = 'artifacts/spanish-food-2-audio-review', MEDIA = 'artifacts/spanish-food-2-media-review'
const BANKS = {
  'content/es-419-travel-2.json': 'content/spanish-travel-2',
}
const AUDIO_APPROVAL_SHA256 = 'fc38565c1e7f87837aa7c75944f7810d2cdaad369933f19ef1ee053c086d5523'
const hash = b => createHash('sha256').update(b).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
async function noSymlink(root, path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some(p => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(p))) throw Error('Unsafe Food2 media path.')
  let current = resolve(root)
  if ((await lstat(current)).isSymbolicLink()) throw Error('Food2 media paths cannot contain symlinks.')
  for (const part of path.split('/')) {
    current = join(current, part)
    try { if ((await lstat(current)).isSymbolicLink()) throw Error('Food2 media paths cannot contain symlinks.') } catch (e) { if (e.code !== 'ENOENT') throw e }
  }
}
async function checkedRead(root, path) { await noSymlink(root, path); return readFile(join(root, path)) }

/** All inputs and 288 recording bytes are checked before the caller writes anything. */
export async function inspectFoodLevel2Media(root = process.cwd()) {
  const art = await inspectFoodLevel2Art(root), artworkAcceptance = await loadFoodLevel2ArtworkAcceptance(root, art)
  if (!artworkAcceptance) throw Error('Food artwork acceptance is required before listening review.')
  const artManifestBytes = await checkedRead(root, ART + '/manifest.json')
  if (hash(artManifestBytes) !== artworkAcceptance.artworkManifestSha256 || artManifestBytes.toString() !== JSON.stringify(art, null, 2) + '\n') throw Error('Accepted artwork manifest differs from verified pictures.')
  const files = ['draft.json', 'artwork-acceptance.json', 'audio-config.json', 'audio-approval.json', 'audio-reuse.json']
  const inputs = Object.fromEntries(await Promise.all(files.map(async file => [FOOD + '/' + file, await checkedRead(root, FOOD + '/' + file)])))
  if (hash(inputs[FOOD+'/audio-approval.json']) !== AUDIO_APPROVAL_SHA256) throw Error('Food2 authorized audio approval bytes changed.')
  const registryBytes = await checkedRead(root, 'content/es-419-voices.json'), registry = JSON.parse(registryBytes)
  const draft = JSON.parse(inputs[FOOD + '/draft.json']), reuse = JSON.parse(inputs[FOOD + '/audio-reuse.json'])
  // The generation-plan loader rechecks reuse bytes; reject untrusted source paths before invoking it.
  if (!Array.isArray(reuse.sources) || !Array.isArray(reuse.clips)) throw Error('Accepted Food audio reuse matrix changed.')
  for (const source of reuse.sources) {
    if (!Object.hasOwn(BANKS, source.bank) || source.activation !== BANKS[source.bank] + '/activation.json' || source.acceptance !== BANKS[source.bank] + '/acceptance.json') throw Error('Unsupported Food audio reuse source.')
    for (const path of [source.bank, source.activation, source.acceptance]) await noSymlink(root, path)
  }
  for (const clip of reuse.clips) {
    if (!/^public\/audio\/es-419-travel-2\/[a-z-]+\/es-419-travel-[a-z0-9-]+\.mp3$/.test(clip.path)) throw Error('Unsafe Food2 accepted recording path.')
    await noSymlink(root, clip.path)
  }
  const { loadSpanishFoodLevel2Plan } = await import('./generate-spanish-food-level-2.mjs')
  const { validateFoodLevel2AudioReviewManifest, foodLevel2NormalizationVerification } = await import('./build-spanish-food-level-2-audio-review.mjs')
  const { plan, approval } = await loadSpanishFoodLevel2Plan(root)
  if (approval.artworkAcceptanceSha256 !== hash(inputs[FOOD + '/artwork-acceptance.json']) || approval.audioReuse !== FOOD + '/audio-reuse.json' || approval.audioReuseSha256 !== hash(inputs[FOOD + '/audio-reuse.json']) ||
      approval.reusedWords !== 5 || approval.reusedClips !== 40 || approval.runtimeActivationAuthorized !== false || !same(plan.voices, registry.voices)) throw Error('Food audio approval/reuse scope changed.')
  const newManifestBytes = await checkedRead(root, AUDIO + '/manifest.json'), generated = JSON.parse(newManifestBytes)
  validateFoodLevel2AudioReviewManifest(plan, approval, generated)
  if (generated.issue !== 231 || generated.pack !== draft.id || generated.status !== 'generated-awaiting-owner-listening' || generated.draftSha256 !== hash(inputs[FOOD + '/draft.json']) || generated.artworkAcceptanceSha256 !== hash(inputs[FOOD + '/artwork-acceptance.json']) ||
      generated.audioApprovalSha256 !== hash(inputs[FOOD + '/audio-approval.json']) || generated.audioReuseSha256 !== hash(inputs[FOOD + '/audio-reuse.json'])) throw Error('Food generated audio input bindings changed.')
  const summaryPath = AUDIO + '/normalization-summary.json', verificationPath = AUDIO + '/normalization-verification.json'
  const summaryBytes = await checkedRead(root,summaryPath), verificationBytes = await checkedRead(root,verificationPath)
  const normalization = foodLevel2NormalizationVerification(generated,summaryBytes)
  if (!same(JSON.parse(verificationBytes),normalization) || normalization.manifestSha256 !== hash(newManifestBytes)) throw Error('Food2 normalization verification binding changed.')
  const clipsByKey = new Map(), key = (id, voice) => id + ':' + voice
  for (const clip of generated.clips) {
    const path = AUDIO + '/' + clip.file, data = await checkedRead(root, path)
    if (hash(data) !== clip.deliverySha256 || data.length !== clip.deliveryBytes) throw Error('New Food recording bytes changed.')
    clipsByKey.set(key(clip.id, clip.voice), { ...clip, source: 'new-generation', path, sha256: clip.deliverySha256, bytes: clip.deliveryBytes })
  }
  const reusedItems = draft.items.filter(i => i.membership === 'existing-spanish-item')
  if (reuse.issue !== 231 || reuse.pack !== draft.id || reuse.language !== 'es-419' || reuse.status !== 'accepted-audio-reuse-verified' || reuse.words !== 5 || reuse.recordings !== 40 ||
      reuse.draft !== FOOD + '/draft.json' || reuse.draftSha256 !== hash(inputs[FOOD + '/draft.json']) || reuse.voiceRegistry !== 'content/es-419-voices.json' || reuse.voiceRegistrySha256 !== hash(registryBytes) ||
      !same(reuse.items, reusedItems.map(i => ({ id: i.id, text: i.text, meaning: i.meaning, bank: i.existingBank }))) || reuse.sources.length !== 1 ||
      new Set(reuse.sources.map(s => s.bank)).size !== 1 || reuse.clips.length !== 40 || new Set(reuse.clips.map(c => key(c.id, c.voice))).size !== 40) throw Error('Accepted Food audio reuse matrix changed.')
  const sources = new Map(), sourceBindings = []
  for (const source of reuse.sources) {
    if (!Object.hasOwn(BANKS, source.bank) || source.activation !== BANKS[source.bank] + '/activation.json' || source.acceptance !== BANKS[source.bank] + '/acceptance.json') throw Error('Unsupported Food audio reuse source.')
    const bankBytes = await checkedRead(root, source.bank), activationBytes = await checkedRead(root, source.activation), acceptanceBytes = await checkedRead(root, source.acceptance)
    if (hash(bankBytes) !== source.bankSha256 || hash(activationBytes) !== source.activationSha256 || hash(acceptanceBytes) !== source.acceptanceSha256) throw Error('Accepted Food source bank/activation/acceptance bytes changed.')
    const bank = JSON.parse(bankBytes), activation = JSON.parse(activationBytes), acceptance = JSON.parse(acceptanceBytes)
    if (bank.language !== 'es-419' || activation.language !== 'es-419' || acceptance.language !== 'es-419' || acceptance.status !== 'accepted-for-activation' ||
        activation.pack !== bank.id || acceptance.pack !== bank.id || activation.acceptance !== source.acceptance || activation.acceptanceSha256 !== source.acceptanceSha256 ||
        activation.voices.length !== 8 || plan.voices.some(v => !activation.voices.some(a => a.voice === v.voice && a.id === v.id && a.name === v.name))) throw Error('Food source listening acceptance or regional voices changed.')
    sources.set(source.bank, { bank, activation, source }); sourceBindings.push(source)
  }
  for (const clip of reuse.clips) {
    const item = reusedItems.find(i => i.id === clip.id), voice = plan.voices.find(v => v.voice === clip.voice), source = item && sources.get(item.existingBank)
    const word = source?.bank.items.find(i => i.id === clip.id), asset = word?.audio.find(a => a.voice === clip.voice)
    const recording = source?.activation.recordings.find(c => c.id === clip.id && c.voice === clip.voice)
    if (!item || !voice || !source || !word || word.language !== 'es-419' || word.text !== item.text || word.label !== item.meaning || word.audio.length !== 8 || new Set(word.audio.map(a => a.voice)).size !== 8 ||
        clip.text !== item.text || clip.meaning !== item.meaning || clip.voiceId !== voice.id || clip.voiceName !== voice.name || clip.region !== voice.region || clip.locale !== voice.locale ||
        !asset || asset.source !== 'synthesized' || asset.voiceName !== voice.name || !/^public\/audio\/es-419-travel-2\/[a-z-]+\/es-419-travel-[a-z0-9-]+\.mp3$/.test(clip.path) ||
        clip.path !== 'public/' + asset.src || clip.sourceActivation !== source.source.activation || !recording || recording.src !== asset.src || recording.sha256 !== clip.sha256 || recording.bytes !== clip.bytes ||
        clipsByKey.has(key(clip.id, clip.voice))) throw Error('Current accepted Food word/voice/recording identity changed.')
    const data = await checkedRead(root, clip.path)
    if (hash(data) !== clip.sha256 || data.length !== clip.bytes) throw Error('Accepted reused Food recording bytes changed.')
    clipsByKey.set(key(clip.id, clip.voice), { ...clip, spelling: item.text, source: 'accepted-reuse', sourceBank: item.existingBank,
      sourceAcceptance: source.source.acceptance, originalSha256: recording.originalSha256, after: recording.after,
      ...(recording.gainDb !== undefined ? { gainDb: recording.gainDb } : {}), targetLimited: recording.targetLimited, limitingReasons: recording.limitingReasons ?? [] })
  }
  const items = draft.items.map(({ id, text, meaning, group, membership }) => ({ id, text, spelling: text, meaning, group, membership }))
  const clips = items.flatMap(item => plan.voices.map(voice => {
    const clip = clipsByKey.get(key(item.id, voice.voice))
    if (!clip || clip.text !== item.text) throw Error('Incomplete effective Food word/voice matrix.')
    return clip
  }))
  if (clips.length !== 288 || clipsByKey.size !== 288 || clips.filter(c => c.source === 'new-generation').length !== 248 || clips.filter(c => c.source === 'accepted-reuse').length !== 40 ||
      new Set(clips.map(c => key(c.id, c.voice))).size !== 288) throw Error('Incomplete effective Food listening review.')
  return { issue: 231, pack: draft.id, language: 'es-419', status: 'generated-awaiting-owner-listening-review', artworkStatus: 'accepted', listeningStatus: 'pending', runtimeActivationAuthorized: false,
    words: 36, recordings: 288, newRecordings: 248, reusedRecordings: 40, provider: plan.provider, model: plan.model, voices: plan.voices, groups: draft.groups, items, images: art.images,
    inputs: { ...Object.fromEntries(Object.entries(inputs).map(([path, data]) => [path, hash(data)])), 'content/es-419-voices.json': hash(registryBytes), [ART + '/manifest.json']: hash(artManifestBytes), [AUDIO + '/manifest.json']: hash(newManifestBytes), [summaryPath]:hash(summaryBytes), [verificationPath]:hash(verificationBytes) },
    normalizationEvidence:{...normalization,summary:summaryPath,verification:verificationPath,verificationSha256:hash(verificationBytes)},
    generatedPlanIdentity: hash(JSON.stringify(plan)), acceptedSourceBindings: sourceBindings, clips }
}

export function foodLevel2MediaReviewHtml(manifest) {
  const rendering = { ...manifest, clips: manifest.clips.map(c => ({ ...c, file: '../../' + c.path })) }
  let html = spanishAudioReviewHtml(rendering).replaceAll('Spanish travel ·', 'Spanish Food level 2 ·').replace(' Cesar is excluded.', '')
    .replace('AI-generated audio, matched', 'Artwork accepted · 248 new recordings and 40 unchanged accepted reuses. AI-generated audio, matched')
    .replace('Final listening approval is pending.', 'Food listening approval is pending; this pack is not active.')
    .replace('Review only; these recordings have not been activated in practice. Provider originals and exact requests are preserved.', 'Food level 2 is not active. The 40 reused recordings remain accepted in earlier packs; the 248 new clips await listening acceptance. Provider originals and exact requests are preserved.')
    .replace('href="manifest.json"', `href="../../${MEDIA}/manifest.json"`)
    .replace('href="normalization-summary.json"', `href="../../${AUDIO}/normalization-summary.json"`).replace('Playback-level measurements', 'New-recording playback measurements')
    .replace('</style>', 'figure{display:flex;align-items:center;gap:16px;margin:0 0 18px}figure img{width:145px;height:145px;object-fit:contain}.origin{font-size:13px;color:#715a83}</style>')
    .replace('<button id="sequence">', `<label>Food group<select id="group"><option value="">All groups</option>${manifest.groups.map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('')}</select></label><label>Recording source<select id="audio-source"><option value="">All recordings</option><option value="new-generation">New recordings only</option><option value="accepted-reuse">Accepted reuses only</option></select></label><p><a href="../../${ART}/review.html">Accepted artwork and provenance</a> · <a href="../../${FOOD}/audio-reuse.json">Existing audio reuse evidence</a></p><button id="sequence">`)
  let itemIndex = 0, pictureIndex = 0, clipIndex = 0, wrapperIndex = 0
  html = html.replace(/<article data-search=/g, () => `<article data-item-id="${esc(manifest.items[itemIndex].id)}" data-group="${esc(manifest.items[itemIndex++].group)}" data-search=`)
  html = html.replace(/<div class="clips">/g, () => {
    const item = manifest.items[pictureIndex++], image = manifest.images.find(i => i.id === item.id)
    return `<figure><a href="../../${esc(image.path)}"><img width="145" height="145" src="../../${esc(image.path)}" alt="${esc(item.meaning)}"></a></figure><div class="clips">`
  })
  html = html.replace(/<div class="clip" /g, () => `<div class="clip" data-source="${manifest.clips[wrapperIndex++].source}" `)
  html = html.replace(/<audio controls /g, () => { const clip = manifest.clips[clipIndex++]; return `<small class="origin">${clip.source === 'new-generation' ? 'New Food recording' : 'Accepted recording reuse'}</small><audio controls data-source="${clip.source}" ` })
  if (itemIndex !== 36 || pictureIndex !== 36 || clipIndex !== 288 || wrapperIndex !== 288) throw Error('Food gallery did not render the complete matrix.')
  html = html.replace("voice=document.querySelector('#voice'),status", "voice=document.querySelector('#voice'),group=document.querySelector('#group'),sourceFilter=document.querySelector('#audio-source'),status")
    .replace('const matches=fold(article.dataset.search).includes(fold(search.value))', "const matches=fold(article.dataset.search).includes(fold(search.value))&&(!group.value||article.dataset.group===group.value)")
    .replace("document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause()});current=audio", 'if(current&&current!==audio&&!current.paused)current.pause();current=audio;stop.disabled=false')
    .replace("(voice.value&&clip.dataset.voice!==voice.value)", "(voice.value&&clip.dataset.voice!==voice.value)||(sourceFilter.value&&clip.dataset.source!==sourceFilter.value)")
    .replace('[search,region,voice]', '[search,region,voice,group,sourceFilter]')
    .replace('</script>', "window.addEventListener('pagehide',halt);</script>")
  return html
}

export async function buildFoodLevel2MediaReview(root = process.cwd()) {
  const manifest = await inspectFoodLevel2Media(root), html = foodLevel2MediaReviewHtml(manifest)
  const outputs = [[MEDIA + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n'], [MEDIA + '/index.html', html], [FOOD + '/media-review.html', html]]
  for (const [path] of outputs) await noSymlink(root, path)
  await mkdir(join(root, MEDIA), { recursive: true })
  for (const [path, data] of outputs) await writeFile(join(root, path), data)
  return manifest
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) buildFoodLevel2MediaReview().then(m => console.log(JSON.stringify({ words: m.words, pictures: m.images.length, recordings: m.recordings, new: m.newRecordings, reused: m.reusedRecordings }))).catch(e => { console.error(e.message); process.exitCode = 1 })
