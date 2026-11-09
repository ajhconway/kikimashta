import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bankDigest, evaluateNeighbors, rankedNeighbors } from './semantic-neighbor-utils.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const directory = resolve(root, 'artifacts/semantic-neighbors-198');
const readJson = name => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const bank = readJson('bank.json');
const byId = new Map(bank.map(item => [item.id, item]));
const benchmark = readJson('benchmark.json');
const results = Object.fromEntries(['fasttext', 'e5'].map(name => [name, readJson(`${name}-results.json`)]));
const metrics = Object.fromEntries(Object.entries(results).map(([name, result]) => [name, evaluateNeighbors(result, bank, benchmark)]));
writeFileSync(resolve(directory, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
const staged = JSON.parse(readFileSync(resolve(root, 'content/card-regeneration/semantic-exclusions.json'), 'utf8'));
const stagedPair = (target, candidate) => staged.groups.some(group => group.rule === 'never-compete' &&
  group.cardIds.includes(target) && group.cardIds.includes(candidate));
const rows = bank.map(target => ({ id: target.id, text: target.text, label: target.label,
  formats: Object.fromEntries(['audio-picture', 'audio-text'].map(format => [format,
    Object.fromEntries(Object.entries(results).map(([name, result]) => [name,
      rankedNeighbors(bank, result.cosineSimilarities, target.id, format).slice(0, 8).map(neighbor => ({
        ...neighbor, text: byId.get(neighbor.id).text, label: byId.get(neighbor.id).label,
        stagedWarning: format === 'audio-picture' && stagedPair(target.id, neighbor.id),
      })),
    ])),
  ])),
}));
const summary = { issue: 198, bankSha256: bankDigest(bank), words: bank.length,
  models: Object.fromEntries(Object.entries(results).map(([name, result]) => [name, {
    ...result.model, repeatMaxAbsoluteDifference: result.repeatMaxAbsoluteDifference,
    executionSecondsIncludingLoadAndRepeat: result.executionSecondsIncludingLoadAndRepeat,
    coverage: Object.values(result.coverage).reduce((counts, value) => {
      const key = value.method ?? 'text'; counts[key] = (counts[key] ?? 0) + 1; return counts;
    }, {}),
    ...metrics[name].querySummary['audio-picture'],
    passedTriplets: metrics[name].triplets.passed,
    totalTriplets: metrics[name].triplets.total,
    macroGroupAccuracy: metrics[name].triplets.macroGroupAccuracy,
  }])),
};
writeFileSync(resolve(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const data = JSON.stringify({ summary, rows }).replaceAll('<', '\\u003c');
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Japanese semantic neighbor comparison · #198</title>
<style>
:root{font:16px system-ui,sans-serif;color:#241a3a;background:#f7f4fc}body{max-width:1200px;margin:28px auto;padding:0 16px}h1{font-size:1.8rem}p{line-height:1.5}.controls{position:sticky;top:0;background:#f7f4fc;padding:12px 0;display:flex;gap:12px;flex-wrap:wrap}input,select{font:inherit;padding:10px;border:1px solid #9c8eb0;border-radius:8px}input{flex:1}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;vertical-align:top;padding:14px;border-bottom:1px solid #ded6eb}th{background:#e8dff6}small{color:#675874}.warning{color:#924300;font-size:.8rem}li{margin:6px 0}.metrics{display:flex;gap:20px;flex-wrap:wrap}.metric{background:white;border:1px solid #ded6eb;border-radius:12px;padding:16px;flex:1}ol{padding-left:22px;margin:0}@media(max-width:650px){th,td{padding:8px;font-size:.85rem}h1{font-size:1.4rem}}
</style>
<h1>Japanese semantic neighbor comparison</h1>
<p>166 approved Japanese words. Both models use the same exact cosine ranking and current answer-validity filters. The text model receives the existing English card meaning as sense information. These scores compare two complete approaches; they do not isolate model architecture from input choice.</p>
<div class="metrics" id="metrics"></div>
<p>The benchmark was authored before viewing outputs: 32 triplets and 8 incomplete positive-neighbor sets. Recall does not penalize other useful neighbors. This small content sanity check does not measure learning effectiveness or establish statistical superiority.</p>
<p>Orange flags identify pairs in the separately staged #79 picture policy. They remain visible here as diagnostics; that deferred policy is not activated by this experiment. Existing homophone, duplicate-image/text and explicit picture exclusions are applied.</p>
<div class="controls"><input id="search" aria-label="Search words or meanings" placeholder="Search Japanese or English meaning"><select id="format" aria-label="Answer format"><option value="audio-picture">Picture choices</option><option value="audio-text">Writing choices</option></select></div>
<p id="count" aria-live="polite"></p><table><thead><tr><th>Target</th><th>fastText · Japanese spelling</th><th>E5 · Japanese + intended meaning</th></tr></thead><tbody id="rows"></tbody></table>
<script type="application/json" id="data">${data}</script>
<script>
const data=JSON.parse(document.getElementById('data').textContent);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.getElementById('metrics').innerHTML=Object.entries(data.summary.models).map(([name,m])=>'<div class="metric"><strong>'+escape(name)+'</strong><p>'+m.passedTriplets+'/'+m.totalTriplets+' triplets<br>'+Math.round(100*m.meanRecallAt5)+'% mean known-positive recall @5<br>'+Object.entries(m.coverage).map(([k,v])=>escape(k)+': '+v).join(', ')+'<br>Repeated vector difference: '+m.repeatMaxAbsoluteDifference+'</p><small>'+escape(m.inputTemplate)+'</small></div>').join('');
function render(){const query=document.getElementById('search').value.toLowerCase();const format=document.getElementById('format').value;const rows=data.rows.filter(r=>(r.text+' '+r.label+' '+r.id).toLowerCase().includes(query));document.getElementById('count').textContent=rows.length+' words';document.getElementById('rows').innerHTML=rows.map(r=>'<tr><td><strong lang="ja">'+escape(r.text)+'</strong><br>'+escape(r.label)+'</td>'+['fasttext','e5'].map(name=>'<td><ol>'+r.formats[format][name].map(n=>'<li><span lang="ja">'+escape(n.text)+'</span> · '+escape(n.label)+' <small>'+n.score.toFixed(3)+'</small>'+(n.stagedWarning?'<br><span class="warning">Staged picture ambiguity flag (#79)</span>':'')+'</li>').join('')+'</ol></td>').join('')+'</tr>').join('');}
document.getElementById('search').addEventListener('input',render);document.getElementById('format').addEventListener('change',render);render();
</script></html>`;
writeFileSync(resolve(directory, 'review.html'), html);
console.log(JSON.stringify(summary, null, 2));
