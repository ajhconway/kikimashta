const preferences = ['A', 'B', 'tie', 'neither', 'uncertain'];
const escapeHtml = value => String(value).replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const jsonForScript = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/gu, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** Saved answers belong to exactly one frozen inventory and assigned-voice protocol. */
export function validSpanishResponses(saved, report) {
  const trials = [...report.semanticTrials.map(trial => ({ ...trial, kind: 'semantic' })),
    ...report.pronunciationTrials.map(trial => ({ ...trial, kind: 'pronunciation' }))];
  return saved?.schemaVersion === 1 && saved.experimentId === report.experimentId && saved.inputDigest === report.inputDigest &&
    typeof saved.semanticViewed === 'boolean' && (report.pronunciationTrials.length > 0 || saved.semanticViewed) &&
    typeof saved.wordsViewed === 'boolean' &&
    Array.isArray(saved.responses) && saved.responses.length === trials.length &&
    saved.wordsViewed === (saved.semanticViewed || saved.responses.some(response => response?.kind === 'pronunciation' && response.revealed === true)) &&
    saved.responses.every((response, index) => response?.trialId === trials[index].id && response.kind === trials[index].kind &&
      response.voice === (trials[index].kind === 'semantic' ? null : trials[index].defaultVoice) &&
      [null, 'A', 'B', 'tie', 'neither', 'uncertain'].includes(response.preference) &&
      typeof response.notes === 'string' && response.notes.length <= 4000 && typeof response.revealed === 'boolean' &&
      typeof response.semanticExposure === 'boolean' && (!response.semanticExposure || saved.semanticViewed) &&
      typeof response.priorWordExposure === 'boolean' && (!response.priorWordExposure || saved.wordsViewed) &&
      (trials[index].kind !== 'semantic' || (response.revealed === true && response.semanticExposure === false && response.priorWordExposure === false)));
}

function mediaPath(src, directory) {
  return typeof src === 'string' && new RegExp(`^/${directory}/[a-zA-Z0-9_./-]+$`, 'u').test(src) &&
    !src.includes('//') && !src.split('/').some(part => part === '.' || part === '..');
}

function validateReport(report) {
  if (report?.schemaVersion !== 1 || report.experimentId !== 'spanish-neighbors-222' || typeof report.inputDigest !== 'string' || !report.inputDigest ||
      !Array.isArray(report.voices) || !Array.isArray(report.semanticTrials) || !Array.isArray(report.pronunciationTrials)) throw new Error('Invalid Spanish review.');
  if (report.voices.some(voice => !voice?.id || typeof voice.name !== 'string' || typeof voice.region !== 'string') ||
      new Set(report.voices.map(voice => voice.id)).size !== report.voices.length) throw new Error('Invalid Spanish review voices.');
  const all = [...report.semanticTrials, ...report.pronunciationTrials];
  if (!all.length || all.some(trial => !trial?.id) || new Set(all.map(trial => trial.id)).size !== all.length) throw new Error('Invalid Spanish trial inventory.');
  for (const trial of all) {
    if (!Array.isArray(trial.sides?.A) || trial.sides.A.length !== 3 || !Array.isArray(trial.sides?.B) || trial.sides.B.length !== 3) throw new Error('Invalid Spanish trial sides.');
    for (const item of [trial.target, ...trial.sides.A, ...trial.sides.B]) {
      if (!item?.id || typeof item.text !== 'string' || typeof item.label !== 'string' || !mediaPath(item.image?.src, 'images') ||
          typeof item.image.alt !== 'string' || !Array.isArray(item.audio) ||
          item.audio.some(clip => typeof clip?.voice !== 'string' || !mediaPath(clip.src, 'audio')) ||
          new Set(item.audio.map(clip => clip.voice)).size !== item.audio.length) throw new Error('Invalid Spanish item/media.');
    }
  }
  for (const trial of report.pronunciationTrials) {
    if (!report.voices.some(voice => voice.id === trial.defaultVoice) ||
        [trial.target, ...trial.sides.A, ...trial.sides.B].some(item => !item.audio.some(clip => clip.voice === trial.defaultVoice))) throw new Error('Missing assigned Spanish voice.');
  }
}

/** Standalone blind review; only whitelisted presentation fields enter the HTML. */
export function renderSpanishReview(report) {
  validateReport(report);
  const itemData = item => ({ id: item.id, text: item.text, label: item.label, image: { src: item.image.src, alt: item.image.alt },
    audio: item.audio.map(({ voice, src }) => ({ voice, src })) });
  const trialData = (trial, pronunciation) => ({ id: trial.id, target: itemData(trial.target),
    sides: { A: trial.sides.A.map(itemData), B: trial.sides.B.map(itemData) }, ...(pronunciation ? { defaultVoice: trial.defaultVoice } : {}) });
  const data = { schemaVersion: 1, experimentId: report.experimentId, inputDigest: report.inputDigest,
    voices: report.voices.map(({ id, name, region }) => ({ id, name, region })),
    semanticTrials: report.semanticTrials.map(trial => trialData(trial, false)), pronunciationTrials: report.pronunciationTrials.map(trial => trialData(trial, true)) };
  const initialKind = data.pronunciationTrials.length ? 'pronunciation' : 'semantic';
  const picture = item => `<div class="word-card"><img data-src="${escapeHtml(item.image.src)}" alt="${escapeHtml(item.image.alt)}" loading="lazy"><p lang="es">${escapeHtml(item.text)}</p><p class="meaning">${escapeHtml(item.label)}</p></div>`;
  const audioCard = (item, label, voice) => `<div class="clip"><span>${label}</span><audio controls preload="none" aria-label="${label}" src="${escapeHtml(item.audio.find(clip => clip.voice === voice).src)}"></audio><div class="reveal-content" hidden>${picture(item)}</div></div>`;
  const names = { semantic: 'Semantic relatedness', pronunciation: 'Pronunciation' };
  const panels = ['semantic', 'pronunciation'].map(kind => {
    const list = kind === 'semantic' ? data.semanticTrials : data.pronunciationTrials;
    const trials = list.map((trial, index) => {
      const voice = data.voices.find(entry => entry.id === trial.defaultVoice);
      const prompt = kind === 'semantic' ? 'Which group is more closely related in meaning to the target?' : 'Which group sounds more similar to the target, while remaining distinguishable?';
      return `<section class="trial" data-kind="${kind}" data-index="${index}" aria-labelledby="${kind}-trial-${index}"${index ? ' hidden' : ''}>
<h2 id="${kind}-trial-${index}">${names[kind]} trial ${index + 1} of ${list.length}</h2>
${kind === 'pronunciation' ? `<p>Assigned voice: <strong>${escapeHtml(voice.name)}</strong> · ${escapeHtml(voice.region)}</p><p class="notice">Listen to the target and both groups. Rate the sounds before revealing words. All seven clips use the same assigned voice.</p>` : '<p>Compare the meanings of the words. Spanish text, English meanings and approved pictures are visible.</p>'}
<h3>Target</h3><div class="target">${kind === 'semantic' ? picture(trial.target) : audioCard(trial.target, 'Target recording', trial.defaultVoice)}</div>
<div class="groups">${['A', 'B'].map(side => `<div class="group"><h3>Group ${side}</h3><div class="candidates">${trial.sides[side].map((item, position) => kind === 'semantic' ? picture(item) : audioCard(item, `Group ${side}, candidate ${position + 1}`, trial.defaultVoice)).join('')}</div></div>`).join('')}</div>
<fieldset><legend>${prompt}</legend>${preferences.map(value => `<label class="choice"><input type="radio" name="${kind}-preference-${index}" value="${value}"> ${({ A: 'Group A', B: 'Group B', tie: 'Tie', neither: 'Neither group is useful', uncertain: 'Uncertain / cannot judge' })[value]}</label>`).join('')}</fieldset>
${kind === 'pronunciation' ? '<button class="reveal" type="button" disabled aria-expanded="false">Reveal words and pictures after rating</button><p class="notice">Revealing words is recorded. Later changes to the answer are marked as revealed.</p>' : ''}
<label class="notes-label">Notes <textarea class="notes" maxlength="4000" rows="3"></textarea></label>
</section>`;
    }).join('\n');
    return `<div id="panel-${kind}" role="tabpanel" aria-labelledby="tab-${kind}"${kind === initialKind ? '' : ' hidden'}>${trials || '<p>No paired trials are available in this section.</p>'}</div>`;
  }).join('\n');
  const tabs = ['semantic', 'pronunciation'].map(kind => {
    const available = kind === 'semantic' ? data.semanticTrials.length : data.pronunciationTrials.length;
    return `<button id="tab-${kind}" type="button" role="tab" aria-selected="${kind === initialKind}" aria-controls="panel-${kind}" tabindex="${kind === initialKind ? '0' : '-1'}"${available ? '' : ' disabled'}>${names[kind]}</button>`;
  }).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blind Spanish neighbor review</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f6f2;color:#202b27;font:17px/1.5 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:20px}h1{font-size:1.7rem;line-height:1.2}h2{font-size:1.35rem}h3{margin:.7rem 0}.trial,.group{border:1px solid #b7c6be;border-radius:12px;padding:16px;background:white}.groups{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}.candidates{display:grid;gap:12px}.word-card{min-width:0;text-align:center}.word-card img{display:block;width:140px;height:140px;object-fit:contain;max-width:100%;margin:auto}.word-card p{overflow-wrap:anywhere;margin:4px 0}.word-card p[lang]{font-weight:650}.meaning{font-size:.95rem;color:#41554a}.target>.word-card{max-width:240px;margin:auto}.clip{min-width:0;margin:8px 0}.clip>span{display:block;font-size:.95rem}audio{display:block;width:100%;max-width:100%;margin:6px 0}button,textarea{font:inherit;max-width:100%}button{padding:10px;border:1px solid #718b7e;border-radius:7px;background:#fff;color:inherit}button:disabled{opacity:.45}button[aria-selected="true"]{background:#d6e9dc;border-color:#35694d}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #176cb5;outline-offset:3px}fieldset{margin:18px 0;border:1px solid #aabeb3;border-radius:8px}.choice{display:block;padding:8px 0}.choice input{width:20px;height:20px;vertical-align:middle}.notes-label{display:block;margin-top:12px}textarea{display:block;width:100%;border:1px solid #718b7e;border-radius:6px;padding:8px}.toolbar,[role="tablist"]{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}.notice{font-size:.95rem;color:#41554a}[hidden]{display:none!important}@media(min-width:900px){[data-kind="semantic"] .candidates{grid-template-columns:repeat(3,minmax(0,1fr))}.word-card img{height:120px}}@media(max-width:600px){main{padding:12px}.groups{grid-template-columns:1fr}.trial,.group{padding:12px}h1{font-size:1.45rem}.word-card img{width:130px;height:130px}}
</style></head><body><main><h1>Blind Spanish neighbor review</h1>
<p>Compare the two groups without knowing which method produced them. Complete Pronunciation before Semantic relatedness to keep the listening words concealed. Targets repeat across voices: revealing any words or opening the semantic section is recorded, and later listening judgments are marked as exposed. You can export partial responses.</p>
<p class="notice">Responses save only in this browser under this experiment revision. This review does not write practice history or account progress.</p>
<p id="status" role="status">Human review pending — 0 of ${data.semanticTrials.length + data.pronunciationTrials.length} trials answered.</p><p id="storage-status" class="notice"></p>
<div role="tablist" aria-label="Review type">${tabs}</div>${panels}
<nav class="toolbar" aria-label="Trial navigation"><button id="previous" type="button" disabled>Previous trial</button><button id="next" type="button">Next trial</button><button id="export" type="button">Export responses</button></nav>
<p class="notice">Export a JSON file to share actual judgments. Unanswered trials remain empty in the export; no preference is inferred.</p>
</main><script>
const report = ${jsonForScript(data)};
const validSpanishResponses = ${validSpanishResponses.toString()};
${clientScript}
</script></body></html>\n`;
}

const clientScript = String.raw`
const inventory = [...report.semanticTrials.map(trial => ({ ...trial, kind: 'semantic' })), ...report.pronunciationTrials.map(trial => ({ ...trial, kind: 'pronunciation' }))];
const storageKey = report.experimentId + ':responses:' + report.inputDigest;
let currentKind = report.pronunciationTrials.length ? 'pronunciation' : 'semantic';
let semanticViewed = currentKind === 'semantic';
let wordsViewed = semanticViewed;
const positions = { semantic: 0, pronunciation: 0 };
let responses = inventory.map(trial => ({ trialId: trial.id, kind: trial.kind, voice: trial.kind === 'semantic' ? null : trial.defaultVoice, preference: null, notes: '', revealed: trial.kind === 'semantic', semanticExposure: false, priorWordExposure: false }));
const sections = [...document.querySelectorAll('.trial')];
const storageStatus = document.querySelector('#storage-status');
try {
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    const saved = JSON.parse(raw);
    if (validSpanishResponses(saved, report)) {
      semanticViewed = saved.semanticViewed;
      wordsViewed = saved.wordsViewed;
      responses = saved.responses.map(({ trialId, kind, voice, preference, notes, revealed, semanticExposure, priorWordExposure }) => ({ trialId, kind, voice, preference, notes, revealed, semanticExposure, priorWordExposure }));
    }
    else storageStatus.textContent = 'Saved responses did not match this review and were ignored.';
  }
} catch { storageStatus.textContent = 'Local saving is unavailable. Keep this page open and export your responses.'; }
function payload() { return { schemaVersion: 1, experimentId: report.experimentId, inputDigest: report.inputDigest, semanticViewed, wordsViewed, responses }; }
function updateStatus() {
  const answered = responses.filter(response => response.preference !== null).length;
  document.querySelector('#status').textContent = (answered === inventory.length ? 'Local review complete' : 'Human review pending') + ' — ' + answered + ' of ' + inventory.length + ' trials answered.';
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(payload())); }
  catch { storageStatus.textContent = 'Local saving is unavailable. Keep this page open and export your responses.'; }
  updateStatus();
}
function pauseAll() { document.querySelectorAll('audio').forEach(audio => audio.pause()); }
function loadVisibleImages() {
  document.querySelectorAll('img[data-src]').forEach(image => {
    if (!image.closest('[hidden]') && !image.hasAttribute('src')) image.src = image.dataset.src;
  });
}
function updateTrial(index) {
  const section = sections[index], response = responses[index];
  section.querySelectorAll('input[type="radio"]').forEach(input => { input.checked = input.value === response.preference; });
  section.querySelector('.notes').value = response.notes;
  if (response.kind === 'pronunciation') {
    section.querySelectorAll('.reveal-content').forEach(word => { word.hidden = !response.revealed; });
    const reveal = section.querySelector('.reveal');
    reveal.hidden = response.revealed; reveal.disabled = response.preference === null;
    reveal.setAttribute('aria-expanded', String(response.revealed));
  }
}
sections.forEach((section, index) => {
  updateTrial(index);
  section.querySelectorAll('input[type="radio"]').forEach(input => input.addEventListener('change', () => {
    responses[index].preference = input.value;
    if (responses[index].kind === 'pronunciation') {
      responses[index].semanticExposure ||= semanticViewed;
      responses[index].priorWordExposure ||= wordsViewed;
    }
    updateTrial(index); save();
  }));
  section.querySelector('.notes').addEventListener('input', event => { responses[index].notes = event.target.value; save(); });
  section.querySelector('.reveal')?.addEventListener('click', () => { responses[index].revealed = true; wordsViewed = true; updateTrial(index); loadVisibleImages(); save(); });
});
document.addEventListener('play', event => {
  if (event.target.tagName === 'AUDIO') document.querySelectorAll('audio').forEach(audio => { if (audio !== event.target) audio.pause(); });
}, true);
function visibleSections() { return sections.filter(section => section.dataset.kind === currentKind); }
function updateNavigation() {
  document.querySelector('#previous').disabled = positions[currentKind] === 0;
  document.querySelector('#next').disabled = positions[currentKind] === visibleSections().length - 1;
}
function switchKind(kind) {
  const list = kind === 'semantic' ? report.semanticTrials : report.pronunciationTrials;
  if (!list.length) return;
  pauseAll(); currentKind = kind;
  ['semantic', 'pronunciation'].forEach(value => {
    const selected = value === currentKind;
    document.querySelector('#panel-' + value).hidden = !selected;
    const tab = document.querySelector('#tab-' + value);
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
  });
  if (kind === 'semantic') { semanticViewed = true; wordsViewed = true; save(); }
  updateNavigation(); loadVisibleImages();
}
['semantic', 'pronunciation'].forEach(kind => document.querySelector('#tab-' + kind).addEventListener('click', () => switchKind(kind)));
document.querySelector('[role="tablist"]').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter(tab => !tab.disabled);
  const focused = Math.max(0, tabs.indexOf(document.activeElement));
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (focused + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[index].click(); tabs[index].focus();
});
function navigate(step) {
  const list = visibleSections(), next = positions[currentKind] + step;
  if (next < 0 || next >= list.length) return;
  pauseAll(); list[positions[currentKind]].hidden = true; positions[currentKind] = next; list[next].hidden = false;
  updateNavigation(); loadVisibleImages(); const heading = list[next].querySelector('h2'); heading.tabIndex = -1; heading.focus();
}
document.querySelector('#previous').addEventListener('click', () => navigate(-1));
document.querySelector('#next').addEventListener('click', () => navigate(1));
document.querySelector('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(payload(), null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = report.experimentId + '-responses.json';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
updateNavigation(); updateStatus(); loadVisibleImages();
`;
