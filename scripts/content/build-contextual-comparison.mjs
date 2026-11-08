/** Local text/audio comparison for #133 and #136. Never generates speech. */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUDIO_CONTEXT_IDS, AUDIO_VOICES, contextualTextDigest, validateContextualTextApproval } from './contextual-audio-plan.mjs'
import { loadContextualPilot, projectRoot } from './validate-contextual.mjs'

export const SIMPLE_BANK_PATH = 'content/contextual/ja-simple-pilot.json'
export const REVIEW_DIRECTORY = 'artifacts/contextual-audio-review/first-sample'
export const SIMPLE_AUDIO_DIRECTORY = 'simple-audio'
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const hash = value => createHash('sha256').update(value).digest('hex')
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const samePrompt = (a, b) => ['text', 'reading', 'meaning'].every(key => a?.[key] === b?.[key])
const correct = question => question.options.find(option => option.id === question.correctOptionId)

function validateAudioProvenance(bank, provenance, description) {
  assert(provenance.bankId === bank.id && provenance.approval?.bankId === bank.id &&
    provenance.approval?.language === bank.language && provenance.approval?.textSha256 === contextualTextDigest(bank),
  description + ' audio text approval differs')
  assert(provenance.samples?.length === 12, 'Expected twelve ' + description.toLowerCase() + ' audio samples')
  assert(provenance.voices?.length === AUDIO_VOICES.length && AUDIO_VOICES.every(voice =>
    provenance.voices.filter(entry => entry.voice === voice && entry.name === ({ otani: 'Otani', morioki: 'Morioki' })[voice]).length === 1),
  description + ' audio voices differ')
}

function comparisonSamples(provenance, context, question) {
  return AUDIO_VOICES.map(voice => {
    const matches = provenance.samples.filter(sample => sample.contextId === context.id && sample.question?.id === question.id && sample.voice === voice)
    assert(matches.length === 1, 'Missing or repeated comparison sample: ' + question.id + '/' + voice)
    const sample = matches[0]
    assert(sample.contextRevision === context.revision && sample.targetItemId === context.targetItemId &&
      sample.question.revision === question.revision && sample.question.kind === question.kind &&
      sample.voiceName === provenance.voices.find(entry => entry.voice === voice).name &&
      samePrompt(sample.sentence, context.sentence) && samePrompt(sample.question, question.prompt) &&
      sample.question.correctAnswer === correct(question).text && sample.question.correctMeaning === correct(question).meaning,
    'Comparison sample text or revision differs: ' + sample.src)
    assert(/^samples\/[a-z0-9-]+\.wav$/.test(sample.src) && /^[a-f0-9]{64}$/.test(sample.sha256) &&
      Number.isSafeInteger(sample.bytes) && sample.bytes > 0, 'Unsafe comparison audio path, size or hash')
    return sample
  })
}

/** Verify every referenced recording before writing the page or copying pictures. */
export function verifyComparisonAudio(directory, provenance) {
  for (const sample of provenance.samples) {
    const bytes = readFileSync(resolve(directory, sample.src))
    assert(bytes.length === sample.bytes && hash(bytes) === sample.sha256, 'Comparison audio integrity differs: ' + sample.src)
  }
}

/** Cross-bank links and audio identity are checked before the page is written. */
export function validateComparison(simple, contrastive, provenance, simpleProvenance) {
  assert(simple.language === contrastive.language, 'Comparison languages differ')
  assert(simple.contexts.length === AUDIO_CONTEXT_IDS.length, 'Expected three simple contexts')
  assert(new Set(simple.contexts.map(context => context.comparisonContextId)).size === AUDIO_CONTEXT_IDS.length,
    'Each simple context needs a distinct comparison context')
  validateAudioProvenance(contrastive, provenance, 'Contrastive')
  if (simpleProvenance) validateAudioProvenance(simple, simpleProvenance, 'Simple')
  const pairs = AUDIO_CONTEXT_IDS.map(id => {
    const original = contrastive.contexts.find(context => context.id === id)
    const draft = simple.contexts.find(context => context.comparisonContextId === id)
    assert(original && draft && draft.stage === 'simple' && original.stage !== 'simple', 'Missing simple/contrastive comparison: ' + id)
    assert(draft.targetItemId === original.targetItemId, 'Comparison target differs: ' + id)
    assert(['pending', 'approved'].includes(draft.review.text) && ['not-generated', 'pending'].includes(draft.review.audio) && draft.recordings.length === 0,
      'Simple review must have pending or approved text, unapproved audio, and no production recordings: ' + draft.id)
    assert(!simpleProvenance || draft.review.text === 'approved', 'Simple audio requires approved text: ' + draft.id)
    for (const context of [original, draft]) {
      assert(context.questions.length === 2 && new Set(context.questions.map(question => question.kind)).size === 2,
        'Expected one target and one detail question: ' + context.id)
    }
    const questions = ['target', 'detail'].map(kind => {
      const simpleQuestion = draft.questions.find(question => question.kind === kind)
      const originalQuestion = original.questions.find(question => question.kind === kind)
      assert(correct(simpleQuestion).vocabularyItemId === correct(originalQuestion).vocabularyItemId,
        'Compared questions must keep the same correct concept: ' + simpleQuestion.id)
      const samples = comparisonSamples(provenance, original, originalQuestion)
      const simpleSamples = simpleProvenance ? comparisonSamples(simpleProvenance, draft, simpleQuestion) : []
      return { simple: simpleQuestion, contrastive: originalQuestion, samples, simpleSamples }
    })
    return { simple: draft, contrastive: original, questions }
  })
  return pairs
}

export function renderContextualComparison({ pairs, vocabulary, imageUrls }) {
  const byId = new Map(vocabulary.map(item => [item.id, item]))
  const promptHtml = prompt => `<p class="japanese" lang="ja">${escapeHtml(prompt.text)}</p><p class="reading" lang="ja">${escapeHtml(prompt.reading)}</p><p>${escapeHtml(prompt.meaning)}</p>`
  const questionHtml = question => `<p class="identifier">${escapeHtml(question.id)}</p>${promptHtml(question.prompt)}<p class="formats">Answer format: ${question.formats.includes('picture') ? 'pictures or Japanese writing' : 'Japanese writing'}</p><ul class="options">${question.options.map(option => {
    const image = question.formats.includes('picture') ? byId.get(option.imageItemId)?.image : undefined
    return `<li class="option${option.id === question.correctOptionId ? ' correct' : ''}">${image ? `<img src="${escapeHtml(imageUrls.get(image.src))}" alt="${escapeHtml(image.alt)}" loading="lazy">` : ''}<p lang="ja" class="answer">${escapeHtml(option.text)}</p><p lang="ja">${escapeHtml(option.reading)}</p><p>${escapeHtml(option.meaning)}</p><p class="answer-label">${option.id === question.correctOptionId ? 'Correct answer' : 'Distractor'}</p></li>`
  }).join('')}</ul><p class="explanation">${escapeHtml(question.explanation)}</p>`
  const recordingsHtml = (samples, question, prefix = '') => `<div class="recordings">${samples.map(sample => `<label>${escapeHtml(sample.voiceName)} · sentence + question<audio controls preload="metadata" aria-label="${escapeHtml(sample.voiceName + ': ' + question.id)}" src="${escapeHtml(prefix + sample.src)}"></audio></label>`).join('')}</div>`
  const hasSimpleAudio = pairs.every(pair => pair.questions.every(question => question.simpleSamples.length > 0))
  const articles = pairs.map((pair, index) => {
    const target = byId.get(pair.simple.targetItemId)
    const status = hasSimpleAudio ? 'Text approved · listening approval pending' : pair.simple.review.text === 'approved' ? 'Text approved · audio not available' : 'Text awaiting approval · audio not generated'
    const pendingAudio = pair.simple.review.text === 'approved' ? 'Simple audio is not yet available.' : 'Simple audio will follow text approval.'
    return `<article id="${escapeHtml(pair.simple.id)}"><h2>${index + 1}. <span lang="ja">${escapeHtml(target.text)}</span> <span class="translation">${escapeHtml(target.meaning)}</span></h2>
<div class="pair sentences"><section class="simple"><h3>Simple</h3><p class="status">${status}</p>${promptHtml(pair.simple.sentence)}<p class="identifier">${escapeHtml(pair.simple.id)} · revision ${pair.simple.revision}</p></section><section class="contrastive"><h3>Contrastive</h3><p class="status">Previously approved text · existing audio</p>${promptHtml(pair.contrastive.sentence)}<p class="identifier">${escapeHtml(pair.contrastive.id)} · revision ${pair.contrastive.revision}</p></section></div>
${pair.questions.map(questionPair => `<h3 class="question-title">${questionPair.simple.kind === 'target' ? 'Question 1 · Answer is the target word' : 'Question 2 · Answer is another detail'}</h3><div class="pair questions"><section class="simple" data-stage="simple"><h4>Simple question</h4>${questionPair.simpleSamples.length ? recordingsHtml(questionPair.simpleSamples, questionPair.simple, SIMPLE_AUDIO_DIRECTORY + '/') : `<p class="pending-audio">${pendingAudio}</p>`}${questionHtml(questionPair.simple)}</section><section class="contrastive" data-stage="contrastive"><h4>Contrastive question</h4>${recordingsHtml(questionPair.samples, questionPair.contrastive)}${questionHtml(questionPair.contrastive)}</section></div>`).join('')}
<details class="notes"><summary>Content review notes</summary><p><strong>Simple:</strong> ${escapeHtml(pair.simple.reviewNotes)}</p><p><strong>Contrastive:</strong> ${escapeHtml(pair.contrastive.reviewNotes)}</p></details></article>`
  }).join('\n')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Simple and contrastive contextual quizzes</title><style>
:root{color-scheme:light;font-family:system-ui,sans-serif;line-height:1.55;color:#292337;background:#f3eff7}*{box-sizing:border-box}body{max-width:1240px;margin:0 auto;padding:24px}header,article{background:white;border:1px solid #d8cfe1;border-radius:16px;padding:24px;margin-bottom:24px}h1,h2,h3,h4{line-height:1.3}h1{font-size:1.9rem}h2{font-size:1.7rem}.translation{font-size:1rem;font-weight:400;color:#665b70}.pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}.pair>section{min-width:0;padding:18px;border-radius:12px}.simple{background:#f1f7f2;border:1px solid #bdd1c0}.contrastive{background:#f6f2fa;border:1px solid #d9cce5}.japanese{font-size:1.4rem;line-height:1.8}.reading{color:#605568}.identifier{font-size:.75rem;overflow-wrap:anywhere;color:#665b70}.status,.formats,.pending-audio{font-size:.85rem}.status{font-weight:650}.question-title{margin-top:28px}.options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;list-style:none;padding:0}.option{min-width:0;background:#fff;border:1px solid #ddd3e6;border-radius:10px;padding:12px}.option p{margin:5px 0}.option .answer{font-size:1.25rem}.option img{display:block;width:100%;height:125px;object-fit:contain;border-radius:6px}.correct{border:2px solid #53795b}.answer-label{font-size:.75rem;font-weight:650;color:#53715a}.explanation{font-size:.9rem}.recordings{display:grid;gap:16px}.recordings label{font-size:.85rem;font-weight:600}audio{display:block;width:100%;max-width:100%;margin-top:7px}.notes{margin-top:20px;font-size:.9rem}nav{display:flex;gap:16px;flex-wrap:wrap}a{color:#63387e}a:focus-visible,summary:focus-visible{outline:3px solid #80579b;outline-offset:4px}@media(max-width:700px){body{padding:12px}header,article{padding:16px}.pair{grid-template-columns:minmax(0,1fr);gap:12px}.pair>section{padding:14px}.japanese{font-size:1.25rem}.option{padding:9px}.option img{height:105px}h1{font-size:1.6rem}}
</style></head><body><header><h1>Simple → contrastive</h1><p>${hasSimpleAudio ? 'Three simple contexts, six questions, and Otani and Morioki recordings for both stages.' : 'Three simple contexts, six questions, and the existing Otani and Morioki recordings for comparison.'}</p><p>Each AI-generated audio preview plays the sentence, a 650 ms pause, then the question.${hasSimpleAudio ? ' New simple audio awaits listening approval.' : ''}</p><p>The simple tier uses one short event or fact. The contrastive tier asks learners to keep multiple facts straight. Both include a target-word question and a question about another detail.</p><p>This author review shows the text, meanings, choices and correct answers. Learners will hear Japanese first, with Japanese text and English revealed after answering.</p><p>Stage progression will use a correct first answer in a scheduled review with an FSRS next interval strictly greater than seven days. Each stage and answer format keeps its own schedule.</p><nav aria-label="Examples">${pairs.map(pair => `<a href="#${escapeHtml(pair.simple.id)}" lang="ja">${escapeHtml(byId.get(pair.simple.targetItemId).text)}</a>`).join('')}<a href="index.html">Original audio gallery</a></nav></header>${articles}</body></html>\n`
}

export function buildContextualComparison({ root = projectRoot } = {}) {
  const { bank: contrastive, vocabulary } = loadContextualPilot(root)
  const { bank: simple } = loadContextualPilot(root, SIMPLE_BANK_PATH)
  validateContextualTextApproval(contrastive, JSON.parse(readFileSync(resolve(root, 'content/contextual/text-approval.json'), 'utf8')))
  if (simple.contexts.some(context => context.review.text === 'approved')) {
    validateContextualTextApproval(simple, JSON.parse(readFileSync(resolve(root, 'content/contextual/simple-text-approval.json'), 'utf8')), { stage: 'simple' })
  }
  const directory = resolve(root, REVIEW_DIRECTORY)
  const provenance = JSON.parse(readFileSync(resolve(directory, 'review-provenance.json'), 'utf8'))
  const simpleDirectory = resolve(directory, SIMPLE_AUDIO_DIRECTORY)
  const simpleProvenancePath = resolve(simpleDirectory, 'review-provenance.json')
  const simpleProvenance = existsSync(simpleProvenancePath) ? JSON.parse(readFileSync(simpleProvenancePath, 'utf8')) : undefined
  if (simpleProvenance) {
    validateContextualTextApproval(simple, simpleProvenance.approval, { stage: 'simple' })
  }
  const pairs = validateComparison(simple, contrastive, provenance, simpleProvenance)
  verifyComparisonAudio(directory, provenance)
  if (simpleProvenance) verifyComparisonAudio(simpleDirectory, simpleProvenance)
  const imageUrls = new Map()
  const byId = new Map(vocabulary.map(item => [item.id, item]))
  for (const pair of pairs) {
    for (const context of [pair.simple, pair.contrastive]) {
      for (const question of context.questions.filter(question => question.formats.includes('picture'))) {
        for (const option of question.options) {
          const { src } = byId.get(option.imageItemId).image
          if (!imageUrls.has(src)) imageUrls.set(src, `comparison-images/${basename(src)}`)
        }
      }
    }
  }
  assert(new Set(imageUrls.values()).size === imageUrls.size, 'Comparison image filenames collide')
  const html = renderContextualComparison({ pairs, vocabulary, imageUrls })
  for (const [src, destination] of imageUrls) {
    mkdirSync(dirname(resolve(directory, destination)), { recursive: true })
    copyFileSync(resolve(root, 'public', src), resolve(directory, destination))
  }
  const output = resolve(directory, 'simple-comparison.html')
  writeFileSync(output, html)
  return { output, simpleContexts: pairs.length, simpleQuestions: pairs.length * 2, simpleAudio: simpleProvenance?.samples.length ?? 0, contrastiveAudio: provenance.samples.length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: node scripts/content/build-contextual-comparison.mjs')
    console.log(JSON.stringify(buildContextualComparison(), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
