/** Build the authored Basic Spanish level 1 review (#191). No generation or activation. */
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
export function validateBasicDraft(draft) {
  if (draft.issue !== 191 || draft.id !== 'es-419-basic-1' || draft.language !== 'es-419' || draft.items.length !== 24 ||
      new Set(draft.items.map(i => i.id)).size !== 24 || new Set(draft.items.map(i => i.text)).size !== 24) throw Error('Expected the 24 unique Basic Spanish entries.')
  const contextual = draft.items.filter(i => i.practice.kind === 'contextual')
  if (contextual.length !== 9 || draft.contexts.length !== 9 || new Set(draft.contexts.map(c => c.id)).size !== 9 ||
      new Set(draft.contexts.map(c => c.targetItemId)).size !== 9) throw Error('Expected nine distinct foundation contexts.')
  for (const item of draft.items) {
    if (item.id !== 'es-419-basic-' + item.slug || !/^[a-z0-9-]+$/.test(item.slug) || !item.text || !item.meaning ||
        !['picture','contextual'].includes(item.practice.kind) || !item.artwork.concept) throw Error('Invalid Basic Spanish entry.')
  }
  for (const c of draft.contexts) {
    if (!contextual.some(i => i.id === c.targetItemId) || c.stage !== 'foundation' || !c.sentence.text || !c.sentence.meaning ||
        !c.question.text || !c.question.meaning || c.options.length !== 4 || new Set(c.options.map(o => o.id)).size !== 4 ||
        c.options.filter(o => o.id === c.correctOptionId).length !== 1) throw Error('Invalid four-choice foundation context.')
    for (const o of c.options) if (!o.text || !o.meaning || !/^es-419-travel-[a-z0-9-]+$/.test(o.vocabularyItemId) ||
      !/^images\/approved\/[a-z0-9-]+\.(png|jpg)$/.test(o.image.src)) throw Error('Invalid contextual answer reference.')
  }
  return draft
}
export function basicReviewHtml(draft) {
  validateBasicDraft(draft)
  const entries = draft.items.map(i => {
    const c = draft.contexts.find(c => c.targetItemId === i.id)
    return `<article data-kind="${i.practice.kind}"><h2 lang="es-419">${escape(i.text)}</h2><p>${escape(i.meaning)} · ${escape(i.group)} · ${i.practice.kind === 'picture' ? 'Picture card' : 'Short contextual question'}</p>${i.variants ? `<p>Also: <span lang="es-419">${i.variants.map(v => escape(v.text)).join(', ')}</span></p>` : ''}${i.usageFrame ? `<p lang="es-419">${escape(i.usageFrame)}</p>` : ''}${c ? `<blockquote lang="es-419">${escape(c.sentence.text)}</blockquote><p>${escape(c.sentence.meaning)}</p><h3 lang="es-419">${escape(c.question.text)}</h3><p>${escape(c.question.meaning)}</p><div class="choices">${c.options.map(o => `<figure><img src="../../public/${escape(o.image.src)}" width="100" height="100" alt="${escape(o.image.alt)}"><figcaption lang="es-419">${escape(o.text)}</figcaption><small>${escape(o.meaning)}</small></figure>`).join('')}</div><details><summary>Answer and explanation</summary><p lang="es-419">${escape(c.options.find(o => o.id === c.correctOptionId).text)}</p><p>${escape(c.explanation)}</p></details>` : `<p><strong>Picture concept</strong>: ${escape(i.artwork.concept)}</p>${i.artwork.reuseCandidate ? `<p>Approved artwork reuse candidate: ${escape(i.artwork.reuseCandidate.sourceId)}</p><img class="reuse" width="145" height="145" src="../../${escape(i.artwork.reuseCandidate.path)}" alt="${escape(i.meaning)} reuse candidate">` : ''}`}<p class="note">${i.reviewNotes.map(escape).join(' ')}</p></article>`
  }).join('\n')
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Basic Spanish level 1 · review</title><style>*{box-sizing:border-box}body{margin:0;background:#faf6fd;color:#302148;font:17px/1.5 system-ui,sans-serif}header,main{max-width:1000px;margin:auto;padding:24px}h1{line-height:1.2}article{background:white;border:1px solid #e4d7f0;border-radius:18px;padding:22px;margin:0 0 20px}h2{margin:0}blockquote{margin:18px 0;padding:14px;background:#f2eafa;border-radius:12px;font-size:21px}input,select{font:inherit;padding:12px;border:1px solid #b49acb;border-radius:10px;max-width:100%;color:inherit;background:white}label{display:block;margin:12px 0}a{color:#634098}.choices{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}figure{margin:0;text-align:center;padding:10px;border:1px solid #e4d7f0;border-radius:12px}img{object-fit:contain;max-width:100%}small,.note{color:#715c85}details{margin-top:14px}summary{cursor:pointer;min-height:44px;padding:10px 0}[hidden]{display:none!important}@media(max-width:600px){header,main{padding:16px}.choices{grid-template-columns:repeat(2,minmax(0,1fr))}article{padding:16px}}</style><header><h1>Basic Spanish level 1</h1><p>24 entries · 15 picture concepts · 9 short contextual questions · Latin American Spanish</p><p>Text and picture concepts for review. New artwork and audio have not been generated. This pack is not active.</p><p>Abstract words enter through a meaning/example introduction and a foundation question, without requiring a picture-card unlock. Context answers reuse Travel level 1 pictures and support text choices too.</p><p><a href="README.md">Pack notes</a> · <a href="draft.json">Structured draft</a></p><label>Find a word or sentence <input id="search" type="search"></label><label>Practice format <select id="kind"><option value="all">All entries</option><option value="picture">Picture cards</option><option value="contextual">Contextual questions</option></select></label><p id="count" role="status" aria-live="polite">24 entries</p></header><main>${entries}</main><script>const entries=[...document.querySelectorAll('article')],search=document.querySelector('#search'),kind=document.querySelector('#kind');const normalized=s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();function filter(){let n=0;for(const el of entries){el.hidden=!(kind.value==='all'||el.dataset.kind===kind.value)||!normalized(el.textContent).includes(normalized(search.value));if(!el.hidden)n++}document.querySelector('#count').textContent=n+' entries'}search.addEventListener('input',filter);kind.addEventListener('change',filter)</script></html>`
}
export async function buildBasicReview(root = process.cwd()) {
  const folder = join(root, 'content/spanish-basic-1')
  const draft = validateBasicDraft(JSON.parse(await readFile(join(folder, 'draft.json'), 'utf8')))
  const travel = JSON.parse(await readFile(join(root, 'content/es-419.json'), 'utf8'))
  for (const c of draft.contexts) for (const o of c.options) {
    const item = travel.items.find(i => i.id === o.vocabularyItemId)
    if (!item || item.text !== o.text || item.label !== o.meaning || item.image.src !== o.image.src || item.image.alt !== o.image.alt) throw Error('Answer differs from approved Travel level 1.')
    await readFile(join(root, 'public', o.image.src))
  }
  await writeFile(join(folder, 'review.html'), basicReviewHtml(draft))
  return { entries: draft.items.length, pictureConcepts: 15, contexts: draft.contexts.length }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) buildBasicReview().then(console.log).catch(e => { console.error(e.message); process.exitCode = 1 })
