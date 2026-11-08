/** Complete, local listening review for the approved Spanish matrix (#155). */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadSpanishTravelPlan } from './generate-spanish-travel-pack.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const PROFILE = { version: 1, targetLufs: -22, truePeakCeilingDbtp: -2, maxBoostDb: 9, rate: 44100, bitrate: '128k', dualMono: true, shortClipAnalysis: 'pad-to-500ms-only-for-measurement' }
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]))
  return value
}
const canonical = value => JSON.stringify(sorted(value))
const same = (left, right) => canonical(left) === canonical(right)
const jsonl = text => text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
const key = record => `${record.voice}:${record.id}`
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

export function audioReviewManifest(plan, originals, deliveries) {
  const expected = new Map(plan.items.flatMap(item => plan.voices.map(voice => [`${voice.voice}:${item.id}`, { item, voice }])))
  if (originals.length !== expected.size || deliveries.length !== expected.size ||
      new Set(originals.map(key)).size !== expected.size || new Set(deliveries.map(key)).size !== expected.size) throw new Error('Incomplete or duplicate audio matrix.')
  const source = new Map(originals.map(record => [key(record), record]))
  const clips = deliveries.map(delivery => {
    const original = source.get(key(delivery)), entry = expected.get(key(delivery))
    if (!original || !entry) throw new Error('Unknown word or voice in audio matrix.')
    const { item, voice } = entry
    if (original.text !== item.text || original.voiceId !== voice.id || original.voiceName !== voice.name || original.model !== plan.model ||
        Object.entries(item).some(([field, value]) => !same(original[field], value)) ||
        original.request?.text !== item.text || original.request?.language_code !== 'es' || original.request?.model_id !== plan.model ||
        original.request?.voice_settings?.stability !== plan.voiceSettings.stability || original.request?.voice_settings?.similarity_boost !== plan.voiceSettings.similarity_boost ||
        original.planIdentity !== hash(JSON.stringify(plan)) || original.file !== `originals/${voice.voice}/${item.id}.mp3`) throw new Error('Original request identity changed.')
    const allowedReasons = ['maximum_gain', 'true_peak_headroom', 'encoded_loudness_resolution']
    const limited = delivery.targetLimited === true && delivery.after?.integratedLufs < -22.25 &&
      Array.isArray(delivery.limitingReasons) && delivery.limitingReasons.length > 0 && delivery.limitingReasons.every(reason => allowedReasons.includes(reason))
    if (delivery.originalFile !== original.file || delivery.originalSha256 !== original.sha256 || delivery.text !== item.text ||
        delivery.voiceId !== voice.id || delivery.file !== `${voice.voice}/${item.id}.mp3` ||
        !same(delivery.profile, PROFILE) || delivery.sourceRecordSha256 !== hash(canonical(original)) ||
        Object.entries(original).some(([field, value]) => field !== 'file' && !same(delivery[field], value)) ||
        typeof delivery.targetLimited !== 'boolean' || (delivery.targetLimited && !limited) || !Number.isFinite(delivery.gainDb) || delivery.gainDb > 9 ||
        !Number.isSafeInteger(delivery.decodedFrames) || delivery.decodedFrames <= 0 ||
        !Number.isFinite(delivery.after?.truePeakDbtp) || delivery.after.truePeakDbtp > -2 || !Number.isFinite(delivery.after?.integratedLufs) ||
        (Math.abs(delivery.after.integratedLufs + 22) > 0.25 && !limited)) throw new Error('Delivery identity or playback profile changed.')
    return { ...item, voice: voice.voice, voiceName: voice.name, region: voice.region, locale: voice.locale,
      file: `audio/${delivery.file}`, voiceId: voice.id, request: original.request, requestId: original.requestId,
      originalFile: original.file, originalSha256: original.sha256, originalBytes: original.bytes,
      deliverySha256: delivery.deliverySha256, deliveryBytes: delivery.deliveryBytes, decodedFrames: delivery.decodedFrames,
      after: delivery.after, gainDb: delivery.gainDb, targetLimited: delivery.targetLimited, limitingReasons: delivery.limitingReasons ?? [] }
  })
  return { issue: 155, pack: 'es-419-travel-1', language: plan.language, provider: plan.provider, model: plan.model,
    status: 'generated-awaiting-owner-listening', expectedClips: expected.size, characters: plan.characters,
    planIdentity: hash(JSON.stringify(plan)), voices: plan.voices, items: plan.items,
    processing: 'Provider originals retained separately. Review MP3s use verified constant-gain matching, without trimming or timing changes.', clips }
}

export function spanishAudioReviewHtml(manifest) {
  const regions = [...new Set(manifest.voices.map(v => v.region))]
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spanish travel · complete audio review</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f8f4fc;color:#302148;font:17px/1.5 system-ui,sans-serif}header,main,footer{max-width:1080px;margin:auto;padding:24px}h1{font-size:clamp(26px,5vw,38px);line-height:1.2}h2{margin:0;font-size:24px}.filters{display:flex;gap:12px;flex-wrap:wrap}label{display:grid;gap:4px;flex:1;min-width:180px}input,select,button{font:inherit;padding:9px 12px;border:1px solid #d6c8e6;border-radius:10px;color:inherit;background:white;max-width:100%}button{cursor:pointer;background:#634098;color:white;margin-top:12px}button:disabled{opacity:.6}article{background:white;border:1px solid #e2d5ef;border-radius:18px;padding:22px;margin-bottom:20px}.meaning{margin:0 0 14px;color:#715a83}.clips{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.clip{background:#faf7fd;padding:14px;border-radius:12px;min-width:0}.clip strong{display:block}.region{font-size:14px;color:#715a83}audio{width:100%;margin-top:8px}.limited{font-size:13px;color:#835c13}#status{min-height:1.5em}.clip:focus-within{outline:2px solid #ad89d0}a{color:#634098}[hidden]{display:none!important}@media(max-width:650px){.clips{grid-template-columns:1fr}header,main,footer{padding:16px}article{padding:16px}label{min-width:100%}}</style>
<style>label{grid-template-columns:minmax(0,1fr)}input,select{min-width:0;width:100%}</style>
<header><h1>Spanish travel · listen to the full pack</h1><p>36 words · 8 voices · 4 regional pairs · 288 recordings. Cesar is excluded.</p><p>AI-generated audio, matched to the same playback profile. Listen for pronunciation, natural endings and consistent volume. Regional labels follow the selected voice descriptions. Final listening approval is pending.</p>
<div class="filters"><label>Word or meaning<input id="search" type="search" placeholder="Search Spanish or English"></label><label>Region<select id="region"><option value="">All regions</option>${regions.map(region => `<option>${escape(region)}</option>`).join('')}</select></label><label>Voice<select id="voice"><option value="">All voices</option>${manifest.voices.map(v => `<option value="${v.voice}">${escape(v.name)} · ${escape(v.region)}</option>`).join('')}</select></label></div>
<button id="sequence">Play visible clips</button> <button id="stop" disabled>Stop</button><p id="count"></p><p id="status" role="status" aria-live="polite"></p></header>
<main>${manifest.items.map((item, index) => `<article data-search="${escape(`${item.text} ${item.meaning}`)}"><h2 lang="es-419">${index + 1}. ${escape(item.text)}</h2><p class="meaning">${escape(item.meaning)}</p><div class="clips">${manifest.voices.map(voice => {
    const clip = manifest.clips.find(c => c.id === item.id && c.voice === voice.voice)
    return `<div class="clip" data-voice="${voice.voice}" data-region="${escape(voice.region)}"><strong>${escape(voice.name)}</strong><span class="region">${escape(voice.region)}</span><audio controls preload="none" aria-label="${escape(`${item.text} — ${voice.name}, ${voice.region}`)}" src="${escape(clip.file)}"></audio>${clip.targetLimited ? '<p class="limited">Kept quieter to meet the processing limits; please check this clip.</p>' : ''}</div>`
  }).join('')}</div></article>`).join('\n')}</main>
<footer><p>Review only; these recordings have not been activated in practice. Provider originals and exact requests are preserved.</p><p><a href="manifest.json">Full recording provenance</a> · <a href="normalization-summary.json">Playback-level measurements</a></p></footer>
<script>
const search=document.querySelector('#search'),region=document.querySelector('#region'),voice=document.querySelector('#voice'),status=document.querySelector('#status'),start=document.querySelector('#sequence'),stop=document.querySelector('#stop');
const fold=value=>value.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
let queue=[],position=0,sequence=false,current=null;
function halt(){sequence=false;queue=[];current?.pause();start.disabled=false;stop.disabled=true;status.textContent=''}
function filter(){halt();let words=0,clips=0;for(const article of document.querySelectorAll('article')){const matches=fold(article.dataset.search).includes(fold(search.value));let visible=0;for(const clip of article.querySelectorAll('.clip')){clip.hidden=!matches||(region.value&&clip.dataset.region!==region.value)||(voice.value&&clip.dataset.voice!==voice.value);if(!clip.hidden)visible++}article.hidden=!visible;if(visible){words++;clips+=visible}}document.querySelector('#count').textContent=words+' words · '+clips+' recordings';start.disabled=clips===0}
async function next(){if(!sequence)return;if(position>=queue.length){halt();status.textContent='Finished the selected recordings.';return}current=queue[position++];current.currentTime=0;status.textContent=current.getAttribute('aria-label')+' ('+position+'/'+queue.length+')';try{await current.play()}catch{halt();status.textContent='Playback was blocked. Use the individual play control to continue.'}}
start.addEventListener('click',()=>{halt();queue=[...document.querySelectorAll('article:not([hidden]) .clip:not([hidden]) audio')];position=0;sequence=true;start.disabled=true;stop.disabled=false;next()});stop.addEventListener('click',halt);
for(const audio of document.querySelectorAll('audio')){audio.addEventListener('play',()=>{if(sequence&&audio!==current)halt();document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause()});current=audio});audio.addEventListener('ended',()=>{if(sequence&&audio===current)next()});audio.addEventListener('error',()=>{halt();status.textContent='This recording could not be loaded. Try its individual play control again.'})}
for(const control of [search,region,voice])control.addEventListener('input',filter);filter();
</script></html>`
}

export async function buildSpanishAudioReview({ root = process.cwd(), input, delivery, output }) {
  const { plan, approval } = await loadSpanishTravelPlan(root)
  if (![input, delivery, output].every(value => typeof value === 'string' && value.trim())) throw new Error('Choose input, delivery and output directories.')
  const sourceRoot = resolve(root, input), deliveryRoot = resolve(root, delivery), destination = resolve(root, output)
  const [originals, deliveries, savedApproval, summary] = await Promise.all([
    readFile(join(sourceRoot, 'originals.jsonl'), 'utf8').then(jsonl), readFile(join(deliveryRoot, 'deliveries.jsonl'), 'utf8').then(jsonl),
    readFile(join(sourceRoot, 'approval.json'), 'utf8').then(JSON.parse), readFile(join(sourceRoot, 'summary.json'), 'utf8').then(JSON.parse),
  ])
  if (JSON.stringify(savedApproval) !== JSON.stringify(approval) || summary.status !== 'generated' || summary.completed !== plan.expectedClips) throw new Error('Generation or approval is incomplete.')
  const manifest = audioReviewManifest(plan, originals, deliveries)
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
  await writeFile(join(destination, 'index.html'), spanishAudioReviewHtml(manifest))
  return manifest
}

async function main() {
  const { values } = parseArgs({ options: { input: { type: 'string' }, delivery: { type: 'string' }, output: { type: 'string' } } })
  const manifest = await buildSpanishAudioReview(values)
  console.log(JSON.stringify({ clips: manifest.clips.length, voices: manifest.voices.length, output: values.output }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
