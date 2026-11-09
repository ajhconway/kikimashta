/** Complete filtered listening gallery for the frozen pack 1 text. No speech or acceptance. (#197) */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { buildContextualAudioReview } from './build-contextual-audio-review.mjs'
import { projectRoot } from './validate-contextual.mjs'

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function renderPack1AudioReview(review, vocabulary) {
  const words = new Map(vocabulary.map(word => [word.id, word]))
  const contexts = new Map(review.contexts.map(context => [context.id, context]))
  const targets = [...new Set(review.contexts.map(context => context.targetItemId))].map(id => words.get(id))
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pack 1 · contextual audio review</title><style>
:root{font-family:system-ui,sans-serif;color:#30233d;background:#faf7ff;line-height:1.5}body{max-width:68rem;margin:auto;padding:1.2rem}h1{font-size:1.7rem;margin-bottom:.3rem}h2{font-size:1.15rem}p{margin:.7rem 0}.filters{position:sticky;top:0;z-index:1;padding:.8rem;background:#faf7fff5;border-bottom:1px solid #d5c6e3;display:flex;gap:.7rem;flex-wrap:wrap;align-items:end}.filters label{display:grid;font-size:.9rem;gap:.25rem}select,button{font:inherit;border:1px solid #b9a2ce;border-radius:.6rem;background:white;padding:.55rem}.queue{width:100%;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}.queue audio{max-width:28rem;flex:1;min-width:14rem}.sample{padding:1rem;margin:1rem 0;border:1px solid #d8cde3;border-radius:1rem;background:white}.sample audio{display:block;width:100%;margin:.8rem 0}.sample p[lang=ja]{font-size:1.25rem}.meta{font-size:.85rem;color:#68596f;overflow-wrap:anywhere}.quieter{color:#775a25}summary{cursor:pointer}a{color:#64458b}button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #9870bc;outline-offset:3px}[hidden]{display:none!important}@media(max-width:500px){body{padding:.7rem}.filters{gap:.5rem}.filters label{flex:1;min-width:8rem}h1{font-size:1.45rem}}
</style></head><body><header><h1>Pack 1 · contextual audio</h1><p>${targets.length} words · ${review.contexts.length} contexts · ${review.samples.length} listening pairs · Otani and Morioki</p><p>Listen to the sentence, a ${review.gapMs} ms pause, then the question. These recordings await your listening approval.</p></header>
<div class="filters"><label>Word<select id="target"><option value="">All words</option>${targets.map(word => `<option value="${escape(word.id)}">${escape(word.text)} · ${escape(word.meaning)}</option>`).join('')}</select></label><label>Stage<select id="stage"><option value="">Both stages</option><option value="simple">Simple</option><option value="contrastive">Contrastive</option></select></label><label>Voice<select id="voice"><option value="">Both voices</option>${review.voices.map(voice => `<option value="${escape(voice.voice)}">${escape(voice.name)}</option>`).join('')}</select></label><label>Question<select id="question"><option value="">Both questions</option><option value="target">First question</option><option value="detail">Second question</option></select></label>
<div class="queue"><button id="play" type="button">Play visible pairs</button><button id="stop" type="button">Stop</button><audio id="queue" controls preload="none" aria-label="Filtered listening playlist"></audio><span id="status" role="status"></span></div><span id="count"></span></div>
<main>${review.samples.map(sample => {
    const context = contexts.get(sample.contextId), target = words.get(context.targetItemId)
    const question = sample.question.id.endsWith('-target') ? 'target' : 'detail'
    const limited = sample.sentence.targetLimited || sample.question.targetLimited
    const title = `${target.text} · ${context.stage === 'simple' ? 'Simple' : 'Contrastive'} · ${sample.voiceName} · ${question === 'target' ? 'Question 1' : 'Question 2'}`
    return `<article class="sample" data-target="${escape(target.id)}" data-stage="${escape(context.stage)}" data-voice="${escape(sample.voice)}" data-question="${question}" data-title="${escape(title)}"><h2>${escape(title)}</h2><audio controls preload="none" aria-label="${escape(title)}" src="${escape(sample.src)}"></audio>${limited ? '<p class="quieter">This pair includes a safely quieter clip. Check its volume while listening.</p>' : ''}<details><summary>Show sentence, question and answer</summary><p lang="ja">${escape(sample.sentence.text)}</p><p class="meta" lang="ja">${escape(sample.sentence.reading)}</p><p>${escape(sample.sentence.meaning)}</p><p lang="ja">${escape(sample.question.text)}</p><p class="meta" lang="ja">${escape(sample.question.reading)}</p><p>${escape(sample.question.meaning)}</p><p><strong>Answer:</strong> <span lang="ja">${escape(sample.question.correctAnswer)}</span> · ${escape(sample.question.correctMeaning)}</p></details><p class="meta">${escape(sample.question.id)}</p></article>`
  }).join('\n')}</main><p><a href="review-provenance.json">Recording and preview provenance</a></p>
<script>
const filters=['target','stage','voice','question'].map(id=>document.getElementById(id));
const samples=[...document.querySelectorAll('.sample')],queue=document.getElementById('queue'),status=document.getElementById('status');
let entries=[],position=0,playing=false;
function stop(){playing=false;queue.pause();status.textContent='';}
function update(){stop();for(const sample of samples)sample.hidden=filters.some(filter=>filter.value&&sample.dataset[filter.id]!==filter.value);document.getElementById('count').textContent=samples.filter(sample=>!sample.hidden).length+' visible pairs';}
async function next(){if(!playing)return;if(position>=entries.length){stop();status.textContent='Finished';return;}const sample=entries[position++];queue.src=sample.querySelector('audio').getAttribute('src');status.textContent=position+'/'+entries.length+' · '+sample.dataset.title;try{await queue.play();}catch{playing=false;status.textContent='Playback paused. Use the audio control to continue.';}}
document.getElementById('play').addEventListener('click',()=>{entries=samples.filter(sample=>!sample.hidden);position=0;playing=true;next();});
document.getElementById('stop').addEventListener('click',stop);queue.addEventListener('ended',next);
for(const filter of filters)filter.addEventListener('change',update);
document.addEventListener('play',event=>{if(event.target.tagName!=='AUDIO')return;for(const audio of document.querySelectorAll('audio'))if(audio!==event.target)audio.pause();if(event.target!==queue){playing=false;status.textContent='';}},true);
update();
</script></body></html>\n`
}

export async function buildPack1AudioReview({ root = projectRoot, ...options } = {}) {
  const vocabulary = JSON.parse(readFileSync(resolve(root, 'content/catalog/ja.json'))).items
  return buildContextualAudioReview({ ...options, root, batch: 'pack1', render: review => renderPack1AudioReview(review, vocabulary) })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { input: { type: 'string' }, delivery: { type: 'string' }, output: { type: 'string' }, ffmpeg: { type: 'string' } } })
  buildPack1AudioReview(values).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error.message); process.exitCode = 1
  })
}
