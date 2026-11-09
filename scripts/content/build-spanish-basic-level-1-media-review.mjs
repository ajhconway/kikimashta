/** Hash-verified Basic Spanish pictures, words and paired-context review (#191). */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectPngAlpha } from './png-alpha.mjs'
import { basicReviewHtml, validateBasicDraft } from './build-spanish-basic-level-1-review.mjs'
import { loadSpanishBasicLevel1Plan } from './generate-spanish-basic-level-1.mjs'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])

export function combinedBasicHtml(draft, images, audio) {
  let html = basicReviewHtml(draft), index = 0
  const player = clip => `<audio controls preload="none" src="../../artifacts/spanish-basic-1-audio-review/${esc(clip.file)}" aria-label="${esc(clip.voiceName + ': ' + clip.text)}"></audio>${clip.targetLimited ? '<small class="limited">Slightly quieter within processing limits</small>' : ''}`
  const clips = new Map(audio.clips.map(c => [c.id + ':' + c.voice, c]))
  html = html.replace(/<article data-kind="([^"]+)">([\s\S]*?)<\/article>/g, (_, kind, body) => {
    const item = draft.items[index++], image = images.find(i => i.id === item.id), context = audio.contexts.find(c => c.targetItemId === item.id)
    const picture = image?.source === 'generated' ? `<figure class="new-picture"><a href="../../${esc(image.path)}"><img width="145" height="145" src="../../${esc(image.path)}" alt="${esc(item.meaning)}"></a></figure>` : ''
    const words = `<details class="word-voices"><summary>Listen to ${esc(item.text)} · eight voices</summary>${audio.voices.map(v => `<div class="voice-row"><strong>${esc(v.name)}</strong><small>${esc(v.region)}</small>${player(clips.get(item.id + ':' + v.voice))}</div>`).join('')}</details>`
    const pairs = context ? `<section class="context-voices"><h3>Hear sentence, then question</h3>${audio.voices.map(v => `<div class="pair voice-row"><strong>${esc(v.name)}</strong><small>${esc(v.region)}</small><button type="button" class="play-pair">Play sentence + question</button><label>Sentence ${player(clips.get(context.sentenceId + ':' + v.voice))}</label><label>Question ${player(clips.get(context.questionId + ':' + v.voice))}</label></div>`).join('')}</section>` : ''
    return `<article data-kind="${kind}">${picture}${body}${words}${pairs}</article>`
  })
  if (index !== 24) throw Error('Incomplete combined review.')
  html = html.replace('Authored text and picture concepts for review. This pack is not active.', 'Generated media for review: nine new illustrations, six approved artwork reuses and 336 recordings. Media acceptance is pending; this pack is not active.')
    .replace('<p><a href="README.md">', '<p><a href="../../artifacts/spanish-basic-1-art/artwork.html">All 15 pictures</a> · <a href="../../artifacts/spanish-basic-1-audio-review/index.html">Audio-only review with voice filters</a></p><button id="stop-media" type="button">Stop audio</button><p id="playback-status" role="status" aria-live="polite"></p><p><a href="README.md">')
    .replace('</style>', '.new-picture{text-align:left;margin:0 0 16px}.voice-row{border-top:1px solid #e4d7f0;padding:14px 0}.voice-row strong,.voice-row small{display:block}audio{display:block;width:100%;max-width:420px;margin:6px 0}button{font:inherit;min-height:44px;padding:10px 14px;border-radius:10px;border:1px solid #9d7fba;background:#f2eafa;color:inherit}.limited{color:#8c4a16}</style>')
  const script = `<audio id="context-pair-player" preload="none" hidden></audio><script>
let mediaToken=0,gap,activeAudio;const status=document.querySelector('#playback-status'),paired=document.querySelector('#context-pair-player');
function stop(){mediaToken++;clearTimeout(gap);if(activeAudio&&!activeAudio.paused)activeAudio.pause();activeAudio=null;status.textContent=''}
document.querySelector('#stop-media').onclick=stop;
document.querySelectorAll('.play-pair').forEach(b=>b.onclick=()=>{
 stop();const token=mediaToken,[sentence,question]=b.closest('.pair').querySelectorAll('audio');
 question.preload='auto';question.load();
 const playPart=(src,label)=>{if(token!==mediaToken)return;paired.pause();paired.src=src;paired.currentTime=0;activeAudio=paired;status.textContent=label;paired.play().catch(()=>{if(token===mediaToken)status.textContent='Could not play recording; use its audio control to retry.'})};
 let part='sentence';paired.onended=()=>{if(token!==mediaToken)return;if(part==='sentence'){part='question';gap=setTimeout(()=>playPart(question.src,'Playing question'),650)}else status.textContent='Finished sentence and question'};
 playPart(sentence.src,'Playing sentence');
});
document.querySelectorAll('audio').forEach(a=>a.addEventListener('play',()=>{if(a!==paired){mediaToken++;clearTimeout(gap);status.textContent=''}if(activeAudio&&activeAudio!==a&&!activeAudio.paused)activeAudio.pause();activeAudio=a}));
window.addEventListener('pagehide',stop);document.querySelector('#search').addEventListener('input',stop);document.querySelector('#kind').addEventListener('change',stop);
</script>`
  return html.replace('</html>', script + '</html>')
}

export async function buildBasicMediaReview(root = process.cwd()) {
  const art = join(root, 'artifacts/spanish-basic-1-art'), folder = join(root, 'content/spanish-basic-1')
  const draft = validateBasicDraft(await json(join(folder, 'draft.json'))), approval = await json(join(folder, 'generation-approval.json'))
  const draftBytes = await readFile(join(folder, 'draft.json'))
  const requests = await json(join(art, 'requests.json')), selection = await json(join(art, 'selection.json'))
  if (hash(draftBytes) !== approval.draftSha256 || requests.draftSha256 !== approval.draftSha256 || approval.issue !== 191 || requests.issue !== 191 ||
      requests.requests.length !== 9 || new Set(requests.requests.map(q => q.id)).size !== 9 || selection.issue !== 191) throw Error('Approved artwork scope changed.')
  const approved = await json(join(root, 'content/card-regeneration/activation.json')), images = []
  for (const item of draft.items.filter(i => i.practice.kind === 'picture')) {
    if (item.artwork.reuseCandidate) {
      const c = item.artwork.reuseCandidate, entry = approved.assets.find(a => a.id === c.sourceId && a.path === c.path)
      if (!entry || c.evidence !== 'content/card-regeneration/activation.json' || entry.sha256 !== c.sha256 || hash(await readFile(join(root, c.path))) !== c.sha256) throw Error('Approved reuse changed.')
      images.push({ id: item.id, text: item.text, meaning: item.meaning, source: 'approved-reuse', path: c.path, sha256: c.sha256, evidence: c.evidence })
    } else {
      const version = selection.versions[item.slug] ?? 1
      if (!Number.isSafeInteger(version) || version < 1) throw Error('Invalid artwork version.')
      const q = version === 1 ? requests.requests.find(q => q.id === item.id) : await json(join(art, 'revisions', `${item.slug}-v${version}-request.json`))
      const r = await json(join(art, 'records', `${item.slug}-v${version}.json`))
      const expectedRef = version === 1 ? 'artifacts/card-regeneration/references/cat-style-reference.png' : `artifacts/spanish-basic-1-art/originals/${item.slug}-v${version - 1}.png`
      if (q?.id !== item.id || q.slug !== item.slug || q.version !== version || q.transparent_background !== true || q.referencePath !== expectedRef ||
          r.id !== item.id || r.slug !== item.slug || r.path !== `originals/${item.slug}-v${version}.png` || r.promptSha256 !== hash(q.prompt) ||
          r.referenceSha256 !== q.referenceSha256 || hash(await readFile(join(root, expectedRef))) !== q.referenceSha256 ||
          JSON.stringify(q.additionalReferences ?? []) !== JSON.stringify(r.additionalReferences ?? [])) throw Error('Artwork provenance changed.')
      for (const ref of q.additionalReferences ?? []) {
        if (ref.role !== 'matched-counterpart' || !/^artifacts\/spanish-basic-1-art\/originals\/[a-z-]+-v1\.png$/.test(ref.path) || hash(await readFile(join(root, ref.path))) !== ref.sha256) throw Error('Counterpart reference changed.')
      }
      const path = 'artifacts/spanish-basic-1-art/' + r.path, bytes = await readFile(join(root, path))
      if (hash(bytes) !== r.sha256) throw Error('Generated picture bytes changed.')
      const pixels = inspectPngAlpha(bytes)
      if (pixels.width !== pixels.height || pixels.width < 1024 || !pixels.transparentPixels || !pixels.opaquePixels) throw Error('Picture requires a square transparent canvas and opaque subject.')
      images.push({ id: item.id, text: item.text, meaning: item.meaning, source: 'generated', path, sha256: r.sha256, bytes: bytes.length, version, pixels, promptSha256: r.promptSha256 })
    }
  }
  const audioBytes = await readFile(join(root, 'artifacts/spanish-basic-1-audio-review/manifest.json')), audio = JSON.parse(audioBytes), { plan } = await loadSpanishBasicLevel1Plan(root)
  if (audio.issue !== 191 || audio.pack !== draft.id || audio.draftSha256 !== approval.draftSha256 || audio.planIdentity !== hash(JSON.stringify(plan)) ||
      JSON.stringify(audio.items) !== JSON.stringify(plan.items) || JSON.stringify(audio.voices) !== JSON.stringify(plan.voices) || audio.clips.length !== 336 ||
      new Set(audio.clips.map(c => c.id + ':' + c.voice)).size !== 336 || audio.contexts.length !== 9) throw Error('Approved audio matrix changed.')
  const expectedContexts = draft.contexts.map(c => ({ id: c.id, targetItemId: c.targetItemId, revision: c.revision, sentenceId: c.id + '-sentence', questionId: c.id + '-question' }))
  if (JSON.stringify(audio.contexts) !== JSON.stringify(expectedContexts)) throw Error('Contextual sentence/question mapping changed.')
  for (const c of audio.clips) {
    const item = plan.items.find(i => i.id === c.id), voice = plan.voices.find(v => v.voice === c.voice)
    if (!item || !voice || c.text !== item.text || c.role !== item.role || c.targetItemId !== item.targetItemId || c.contextId !== item.contextId || c.contextRevision !== item.contextRevision || c.voiceId !== voice.id || c.voiceName !== voice.name ||
        c.file !== `audio/${c.voice}/${c.id}.mp3`) throw Error('Audio identity changed.')
    const bytes = await readFile(join(root, 'artifacts/spanish-basic-1-audio-review', c.file))
    if (hash(bytes) !== c.deliverySha256 || bytes.length !== c.deliveryBytes) throw Error('Recording bytes changed.')
  }
  const manifest = { issue: 191, pack: draft.id, status: 'generated-awaiting-owner-media-review', draftSha256: approval.draftSha256,
    audioManifestSha256: hash(audioBytes), generatedPictures: 9, reusedPictures: 6, recordings: 336, images }
  const figures = images.map(i => `<figure><a href="../../${esc(i.path)}"><img src="../../${esc(i.path)}" width="145" height="145" alt="${esc(i.meaning)}"></a><figcaption lang="es-419">${esc(i.text)}</figcaption><small>${esc(i.meaning)} · ${i.source === 'generated' ? 'New illustration' : 'Approved artwork reuse'}</small></figure>`).join('')
  const artworkHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Basic Spanish level 1 pictures</title><style>body{font:17px/1.5 system-ui;background:#faf6fd;color:#302148;max-width:1100px;margin:auto;padding:20px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px}figure{margin:0;padding:18px;background:white;border-radius:16px;text-align:center}img{object-fit:contain}small{display:block;color:#715c85}a{color:#634098}</style><h1>Basic Spanish level 1 · pictures</h1><p>15 pictures: nine new illustrations and six approved reuses. Shown at 145px.</p><p><a href="../../content/spanish-basic-1/media-review.html">Pictures, words and contextual audio</a></p><main>${figures}</main></html>`
  await writeFile(join(art, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(join(art, 'artwork.html'), artworkHtml)
  await writeFile(join(folder, 'media-review.html'), combinedBasicHtml(draft, images, audio))
  return manifest
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) buildBasicMediaReview().then(m => console.log(JSON.stringify({ pictures: m.images.length, recordings: m.recordings }))).catch(e => { console.error(e.message); process.exitCode = 1 })
