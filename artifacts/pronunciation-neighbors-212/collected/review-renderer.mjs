const preferences = ['A', 'B', 'tie', 'neither', 'uncertain'];
const escapeHtml = value => String(value).replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const jsonForScript = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/gu, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** Accept only this exact experiment, input revision and complete trial inventory. */
export function validListeningResponses(saved, report) {
  return saved?.schemaVersion === 1 && saved.experimentId === report.experimentId && saved.inputDigest === report.inputDigest &&
    Array.isArray(saved.responses) && saved.responses.length === report.trials.length &&
    saved.responses.every((response, index) => response?.trialId === report.trials[index].id &&
      response.voice === report.trials[index].defaultVoice &&
      [null, 'A', 'B', 'tie', 'neither', 'uncertain'].includes(response.preference) && typeof response.notes === 'string' &&
      response.notes.length <= 4000 && typeof response.revealed === 'boolean');
}

function validateReport(report) {
  if (report?.schemaVersion !== 1 || report.experimentId !== 'pronunciation-neighbors-212' || !report.inputDigest ||
      !Array.isArray(report.voices) || !report.voices.length || !Array.isArray(report.trials) || !report.trials.length ||
      new Set(report.voices.map(voice => voice.id)).size !== report.voices.length ||
      new Set(report.trials.map(trial => trial.id)).size !== report.trials.length) throw new Error('Invalid listening report.');
  for (const trial of report.trials) {
    if (!trial.id || !report.voices.some(voice => voice.id === trial.defaultVoice) ||
        !Array.isArray(trial.sides?.A) || trial.sides.A.length !== 3 || !Array.isArray(trial.sides?.B) || trial.sides.B.length !== 3) throw new Error('Invalid listening trial.');
    for (const item of [trial.target, ...trial.sides.A, ...trial.sides.B]) {
      if (!item?.id || typeof item.text !== 'string' || typeof item.reading !== 'string' || typeof item.label !== 'string' ||
          !Array.isArray(item.audio) || !report.voices.every(voice => item.audio.some(clip => clip.voice === voice.id)) ||
          item.audio.some(clip => typeof clip.src !== 'string' || !/^\/audio\/[a-zA-Z0-9_./-]+$/u.test(clip.src) || clip.src.split('/').includes('..'))) throw new Error('Invalid listening item/audio.');
    }
  }
}

/** Standalone blind listening page. Input deliberately contains no method key or scores. */
export function renderListeningReview(report) {
  validateReport(report);
  const itemData = item => ({ id: item.id, text: item.text, reading: item.reading, label: item.label, audio: item.audio.map(({ voice, src }) => ({ voice, src })) });
  const data = { schemaVersion: 1, experimentId: report.experimentId, inputDigest: report.inputDigest,
    voices: report.voices.map(({ id, name }) => ({ id, name })),
    trials: report.trials.map(trial => ({ id: trial.id, target: itemData(trial.target),
      sides: { A: trial.sides.A.map(itemData), B: trial.sides.B.map(itemData) }, defaultVoice: trial.defaultVoice })) };
  const audioCard = (item, label, voice) => `<div class="clip"><span>${label}</span><audio controls preload="none" aria-label="${label}" src="${escapeHtml(item.audio.find(clip => clip.voice === voice).src)}"></audio><p class="word" hidden><span lang="ja">${escapeHtml(item.text)} (${escapeHtml(item.reading)})</span> — ${escapeHtml(item.label)}</p></div>`;
  const trials = data.trials.map((trial, index) => `<section class="trial" data-index="${index}" aria-labelledby="trial-${index}"${index ? ' hidden' : ''}>
    <h2 id="trial-${index}">Trial ${index + 1} of ${data.trials.length}</h2>
    <p>Assigned voice: <strong>${escapeHtml(data.voices.find(voice => voice.id === trial.defaultVoice).name)}</strong></p>
    <h3>Target</h3>${audioCard(trial.target, 'Target recording', trial.defaultVoice)}
    <div class="groups">${['A', 'B'].map(side => `<div class="group"><h3>Group ${side}</h3>${trial.sides[side].map((item, position) => audioCard(item, `Group ${side}, candidate ${position + 1}`, trial.defaultVoice)).join('')}</div>`).join('')}</div>
    <button class="reveal" type="button" aria-expanded="false">Reveal words for this trial</button>
    <fieldset><legend>Which group contains alternatives that sound more similar to the target, while remaining distinguishable?</legend>${preferences.map(value => `<label class="choice"><input type="radio" name="preference-${index}" value="${value}"> ${({ A: 'Group A', B: 'Group B', tie: 'Tie', neither: 'Neither group is a useful contrast', uncertain: 'Uncertain / cannot judge' })[value]}</label>`).join('')}</fieldset>
    <label class="notes-label">Notes <textarea class="notes" maxlength="4000" rows="3"></textarea></label>
  </section>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blind pronunciation listening review</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f6f2;color:#202b27;font:17px/1.5 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:20px}h1{font-size:1.7rem;line-height:1.2}h2{font-size:1.35rem}h3{margin:.7rem 0}.trial,.group{border:1px solid #b7c6be;border-radius:12px;padding:16px;background:white}.groups{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}.clip{margin:12px 0}.clip>span{display:block;font-size:.95rem}audio{display:block;width:100%;max-width:100%;margin:6px 0}.word{overflow-wrap:anywhere;margin:4px 0;font-size:.95rem}select,button,textarea{font:inherit;max-width:100%}button,select{padding:10px;border:1px solid #718b7e;border-radius:7px;background:#fff;color:inherit}button:disabled{opacity:.45}button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #176cb5;outline-offset:3px}fieldset{margin:18px 0;border:1px solid #aabeb3;border-radius:8px}.choice{display:block;padding:8px 0}.choice input{width:20px;height:20px;vertical-align:middle}.notes-label{display:block}textarea{display:block;width:100%;border:1px solid #718b7e;border-radius:6px;padding:8px}.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}.notice{font-size:.95rem;color:#41554a}[hidden]{display:none!important}@media(max-width:600px){main{padding:12px}.groups{grid-template-columns:1fr}.trial,.group{padding:12px}h1{font-size:1.45rem}}
</style></head><body><main><h1>Blind pronunciation listening review</h1>
<p>Listen to the target and both groups using the same voice. Choose the group whose alternatives sound more similar to the target while remaining distinguishable. Use Tie when they are equally close, Neither when both groups seem unsuitable, or Uncertain when you cannot judge. Compare sounds rather than meanings.</p>
<p class="notice">Method identities are hidden. Words are hidden initially; revealing them is recorded. Each trial has an assigned voice; both groups use that same voice. This review saves no practice history.</p>
<p id="status" role="status">Human review pending — 0 of ${data.trials.length} trials answered.</p><p id="storage-status" class="notice"></p>
${trials}<nav class="toolbar" aria-label="Trial navigation"><button id="previous" type="button" disabled>Previous trial</button><button id="next" type="button">Next trial</button><button id="export" type="button">Export responses</button></nav>
<p class="notice">Responses stay in this browser until exported. Export a JSON file to share the actual listening judgments; incomplete exports retain unanswered trials.</p>
</main><script>
const report = ${jsonForScript(data)};
const validListeningResponses = ${validListeningResponses.toString()};
${clientScript}
</script></body></html>\n`;
}

const clientScript = String.raw`
const storageKey = report.experimentId + ':responses:' + report.inputDigest;
let current = 0;
let responses = report.trials.map(trial => ({ trialId: trial.id, voice: trial.defaultVoice, preference: null, notes: '', revealed: false }));
const sections = [...document.querySelectorAll('.trial')];
const storageStatus = document.querySelector('#storage-status');
try {
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    const saved = JSON.parse(raw);
    if (validListeningResponses(saved, report)) responses = saved.responses;
    else storageStatus.textContent = 'Saved responses did not match this review and were ignored.';
  }
} catch { storageStatus.textContent = 'Local saving is unavailable. Keep this page open and export your responses.'; }
function payload() { return { schemaVersion: 1, experimentId: report.experimentId, inputDigest: report.inputDigest, responses }; }
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(payload())); }
  catch { storageStatus.textContent = 'Local saving is unavailable. Keep this page open and export your responses.'; }
  updateStatus();
}
function updateStatus() {
  const answered = responses.filter(response => response.preference !== null).length;
  document.querySelector('#status').textContent = (answered === report.trials.length ? 'Local review complete' : 'Human review pending') + ' — ' + answered + ' of ' + report.trials.length + ' trials answered.';
}
function pauseAll() { document.querySelectorAll('audio').forEach(audio => audio.pause()); }
function updateTrial(index) {
  const trial = report.trials[index], response = responses[index], section = sections[index];
  const items = [trial.target, ...trial.sides.A, ...trial.sides.B];
  section.querySelectorAll('audio').forEach((audio, position) => {
    const src = items[position].audio.find(clip => clip.voice === response.voice).src;
    if (audio.getAttribute('src') !== src) { audio.src = src; audio.load(); }
  });
  section.querySelectorAll('input[type="radio"]').forEach(input => { input.checked = input.value === response.preference; });
  section.querySelector('.notes').value = response.notes;
  section.querySelectorAll('.word').forEach(word => { word.hidden = !response.revealed; });
  section.querySelector('.reveal').hidden = response.revealed;
  section.querySelector('.reveal').disabled = response.preference === null;
  section.querySelector('.reveal').setAttribute('aria-expanded', String(response.revealed));
}
sections.forEach((section, index) => {
  updateTrial(index);
  section.querySelectorAll('input[type="radio"]').forEach(input => input.addEventListener('change', () => {
    responses[index].preference = input.value; updateTrial(index); save();
  }));
  section.querySelector('.notes').addEventListener('input', event => { responses[index].notes = event.target.value; save(); });
  section.querySelector('.reveal').addEventListener('click', () => { responses[index].revealed = true; updateTrial(index); save(); });
});
document.addEventListener('play', event => {
  if (event.target.tagName === 'AUDIO') document.querySelectorAll('audio').forEach(audio => { if (audio !== event.target) audio.pause(); });
}, true);
function navigate(step) {
  pauseAll(); sections[current].hidden = true; current += step; sections[current].hidden = false;
  document.querySelector('#previous').disabled = current === 0;
  document.querySelector('#next').disabled = current === sections.length - 1;
  sections[current].querySelector('h2').setAttribute('tabindex', '-1');
  sections[current].querySelector('h2').focus();
}
document.querySelector('#previous').addEventListener('click', () => navigate(-1));
document.querySelector('#next').disabled = sections.length === 1;
document.querySelector('#next').addEventListener('click', () => navigate(1));
document.querySelector('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(payload(), null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = report.experimentId + '-responses.json';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
updateStatus();
`;
