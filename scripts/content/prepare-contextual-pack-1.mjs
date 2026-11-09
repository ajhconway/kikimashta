import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contextualSummary, validateContextualBank } from '../../src/content/contextual.ts'
import { loadContextualPractice, projectRoot } from './validate-contextual.mjs'
import { renderContextualMarkdown, renderContextualReview } from './build-contextual-review.mjs'

export const sourceFiles = ['counters', 'nouns', 'actions'].map(name => `content/contextual/pack-1/${name}.json`)
export const draftPath = 'content/contextual/ja-wanikani-1-draft.json'
export const contextualOnlyWords = ['下さい', '力いっぱい', '大した']
export const wordFirstWords = ['一', '二', '三', '七', '八', '九', '十', 'ふじ山']
export const retainedWords = ['上', '下', '大きい']
const extraGrammar = [
  { id: 'counting', label: 'Counting objects', genkiLesson: 5 },
  { id: 'counting-people', label: 'Counting people', genkiLesson: 7 },
  { id: 'requests', label: 'Requests with noun をください', genkiLesson: 2 },
  { id: 'quoted-speech', label: 'Quoted and reported speech with と言う', genkiLesson: 8 },
  { id: 'polite-past', label: 'Polite past tense', genkiLesson: 4 },
  { id: 'copula-negative', label: 'Negative noun predicates', genkiLesson: 2 },
]
const read = (root, path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 12)
const kana = value => value.normalize('NFKC').replace(/[ァ-ヶ]/gu, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const union = values => [...new Map(values.map(value => [value.id, value])).values()]

export function pack1Scope(vocabulary) {
  return vocabulary.filter(word => word.sourceLevel === 1 && !word.removalReason && !wordFirstWords.includes(word.text))
}

/** Compile authored text only. Catalogue membership here grants no runtime eligibility. */
export function compilePack1(root = projectRoot) {
  const { banks, vocabulary } = loadContextualPractice(root)
  const scope = pack1Scope(vocabulary)
  const fresh = scope.filter(word => !retainedWords.includes(word.text))
  const byText = new Map(vocabulary.filter(word => !word.removalReason).map(word => [word.text, word]))
  const pictureIds = new Set(read(root, 'content/practice-pool.json').itemIds)
  const authored = sourceFiles.flatMap(file => read(root, file).targets)
  assert.deepEqual(authored.map(target => target.text).sort(), fresh.map(word => word.text).sort(), 'Draft must cover each of the 26 new targets once')
  const support = new Map()
  const wordReference = tuple => {
    assert.equal(tuple.length, 3, 'Vocabulary requires text, reading and meaning')
    const [text, reading, meaning] = tuple
    const id = `wk1-sup-${hash(`${text}\n${reading}`)}`
    if (!support.has(id)) support.set(id, { id, text, reading, meaning })
    return id
  }
  const prompt = (tuple, grammarTags, words) => {
    assert.equal(tuple.length, 3, 'Prompts require text, reading and English meaning')
    const [text, reading, meaning] = tuple
    // Keep the authored context's conservative requirements: dictionary-form
    // substring matching would lose verbs such as 買う when the clip says 買います.
    return { text, reading, meaning, grammarTags: [...new Set(grammarTags)],
      supportingVocabularyIds: [...new Set(words.map(wordReference))] }
  }
  const contexts = authored.flatMap(authoredTarget => {
    const target = byText.get(authoredTarget.text)
    assert.match(authoredTarget.slug, /^[a-z]+(?:-[a-z]+)*$/)
    assert.equal(authoredTarget.contexts.length, 4, `${target.text}: expected four contexts`)
    assert.deepEqual(authoredTarget.contexts.map(c => `${c.stage}-${c.variant}`).sort(), ['contrastive-1', 'contrastive-2', 'simple-1', 'simple-2'])
    return authoredTarget.contexts.map(context => {
      const id = `ja-ctx-wk1-${context.stage}-${authoredTarget.slug}-${String(context.variant).padStart(2, '0')}`
      const words = [...context.vocabulary, ...context.questions.flatMap(question => question.options)]
      words.forEach(wordReference)
      assert.deepEqual(context.questions.map(question => question.kind).sort(), ['detail', 'target'])
      const questions = context.questions.map(question => {
        assert.equal(question.options.length, 4, `${id}: every question requires four choices`)
        assert.ok(Number.isInteger(question.correct) && question.correct >= 0 && question.correct < 4, `${id}: invalid answer index`)
        if (question.pictureOptions) assert.equal(question.pictureOptions.length, 4)
        const options = question.options.map((tuple, index) => {
          const word = byText.get(tuple[0])
          const vocabularyItemId = question.kind === 'target' && index === question.correct ? target.id :
            word && kana(word.reading) === kana(tuple[1]) ? word.id : undefined
          const option = { id: `answer-${hash(`${tuple[0]}\n${tuple[1]}`)}`, ...prompt(tuple, context.grammarTags, [tuple]),
            ...(vocabularyItemId ? { vocabularyItemId } : {}) }
          if (question.pictureOptions) {
            const picture = byText.get(question.pictureOptions[index])
            assert.ok(picture && pictureIds.has(picture.id), `${id}: picture must come from approved practice pool: ${question.pictureOptions[index]}`)
            option.imageItemId = picture.id
          }
          return option
        })
        return { id: `${id}-${question.kind}`, revision: 1, kind: question.kind,
          prompt: prompt(question.prompt, [...context.grammarTags, 'questions', 'question-words'], words),
          formats: question.pictureOptions ? ['picture', 'text'] : ['text'], options,
          correctOptionId: options[question.correct].id, explanation: question.explanation }
      })
      return { id, revision: 1, stage: context.stage,
        ...(context.stage === 'simple' ? { comparisonContextId: id.replace('-simple-', '-contrastive-') } : {}),
        targetItemId: target.id, targetOccurrence: { surface: context.occurrence[0], reading: context.occurrence[1] },
        sentence: prompt(context.sentence, context.grammarTags, words), questions,
        recordings: [], review: { text: 'pending', audio: 'not-generated' }, reviewNotes: context.reviewNotes }
    })
  })
  contexts.sort((a, b) => scope.findIndex(word => word.id === a.targetItemId) - scope.findIndex(word => word.id === b.targetItemId) ||
    (a.stage === b.stage ? a.id.localeCompare(b.id) : a.stage === 'simple' ? -1 : 1))
  const bank = { schemaVersion: 1, id: 'ja-contextual-wanikani-1-draft-v1', language: 'ja-JP',
    grammarProfile: 'genki-1', grammarReference: banks[0].grammarReference,
    grammarPoints: union([...banks.flatMap(bank => bank.grammarPoints), ...extraGrammar]),
    supportingVocabulary: [...support.values()].sort((a, b) => a.id.localeCompare(b.id)), contexts }
  validateContextualBank(bank, { vocabulary, eligibleTargetIds: new Set(scope.map(word => word.id)),
    imageExists: src => existsSync(resolve(root, 'public', src)), audioExists: () => false })
  return { bank, banks, vocabulary, scope }
}

/** Verify checked-in expanded content is reproducible and stays pending and inactive. */
export function validatePack1(root = projectRoot) {
  const compiled = compilePack1(root)
  assert.deepEqual(read(root, draftPath), compiled.bank, 'Expanded draft differs from its authored sources; rebuild it')
  return compiled
}

export function combinedPack1({ bank, banks, vocabulary, scope }) {
  const retainedIds = new Set(scope.filter(word => retainedWords.includes(word.text)).map(word => word.id))
  const retained = banks.flatMap(bank => bank.contexts).filter(context => retainedIds.has(context.targetItemId))
  assert.equal(retained.length, 12, 'Retain all approved variants for the three existing targets')
  const combined = { ...bank, id: 'ja-contextual-wanikani-1-review-v1',
    grammarPoints: union([...banks.flatMap(bank => bank.grammarPoints), ...bank.grammarPoints]),
    supportingVocabulary: union([...banks.flatMap(bank => bank.supportingVocabulary), ...bank.supportingVocabulary]),
    contexts: [...retained, ...bank.contexts].sort((a, b) =>
      scope.findIndex(word => word.id === a.targetItemId) - scope.findIndex(word => word.id === b.targetItemId) ||
      ((a.stage ?? 'contrastive') === (b.stage ?? 'contrastive') ? a.id.localeCompare(b.id) : (a.stage ?? 'contrastive') === 'simple' ? -1 : 1)) }
  const knownImages = new Set(vocabulary.map(word => word.image.src))
  validateContextualBank(combined, { vocabulary, eligibleTargetIds: new Set(scope.map(word => word.id)),
    imageExists: src => knownImages.has(src), audioExists: () => false })
  for (const word of scope) {
    const contexts = combined.contexts.filter(context => context.targetItemId === word.id)
    for (const stage of ['simple', 'contrastive']) assert.equal(contexts.filter(c => (c.stage ?? 'contrastive') === stage).length, 2, `${word.text}: incomplete stage coverage`)
  }
  return combined
}

export const filterScript = `
const form = document.querySelector('#filters');
const cards = [...document.querySelectorAll('article[data-target]')];
const status = document.querySelector('#visible-count');
const params = new URLSearchParams(location.search);
for (const control of form.elements) if (control.name && params.has(control.name)) control.value = params.get(control.name);
function update() {
  let count = 0;
  for (const card of cards) {
    const match = [...form.elements].every(control => !control.name || !control.value || card.dataset[control.name] === control.value);
    card.hidden = !match;
    if (match) count++;
  }
  status.textContent = count + ' sentence contexts · ' + count * 2 + ' questions shown';
  const url = new URL(location.href);
  for (const control of form.elements) if (control.name) {
    if (control.value) url.searchParams.set(control.name, control.value); else url.searchParams.delete(control.name);
  }
  history.replaceState(null, '', url);
}
form.addEventListener('change', update);
update();
`

export function renderPack1Review(loaded) {
  const { vocabulary, scope } = loaded
  const bank = combinedPack1(loaded)
  const original = renderContextualReview(bank, vocabulary)
  const head = original.slice(0, original.indexOf('</head>')).replace('Contextual quiz pilot — text review', 'WaniKani level 1 — contextual text review')
  const byId = new Map(bank.contexts.map(context => [context.id, context]))
  const targets = new Map(vocabulary.map(word => [word.id, word]))
  let articles = original.slice(original.indexOf('</header>') + '</header>'.length, original.indexOf('</body>'))
  articles = articles.replace(/<article id="([^"]+)">/g, (_, id) => {
    const context = byId.get(id)
    const stage = context.stage ?? 'contrastive'
    const state = context.review.text === 'pending' ? 'pending' : 'retained'
    const only = contextualOnlyWords.includes(targets.get(context.targetItemId).text)
    return `<article id="${escape(id)}" data-target="${escape(context.targetItemId)}" data-stage="${stage}" data-state="${state}"><p class="badge">${stage === 'simple' ? 'Simple' : 'Contrastive'}${only ? ' · Contextual only' : ''}</p>`
  }).replace(/<p class="badge">Text: approved · Audio: [^<]+<\/p>/g, '<p class="badge">Existing approved text · Existing media preserved</p>')
  const options = scope.map(word => `<option value="${escape(word.id)}">${escape(word.text)} · ${escape(word.meaning)}</option>`).join('')
  return `${head}<style>[hidden]{display:none!important}#filters{display:flex;flex-wrap:wrap;gap:16px;margin:20px 0}label{display:grid;gap:6px}select{font:inherit;padding:10px;border:1px solid #b6a7c7;border-radius:10px;background:white;max-width:100%}header{position:relative}article{scroll-margin-top:16px}</style></head><body><header>
<h1>Pack 1 · Contextual questions</h1>
<p>29 words · 116 sentences · 232 questions · Four choices each</p>
<p class="notice">208 new questions await text approval; 24 approved questions are included for reference. Audio follows text approval.</p>
<form id="filters"><div><label for="target-filter">Word</label><select id="target-filter" name="target"><option value="">All words</option>${options}</select></div><div><label for="stage-filter">Stage</label><select id="stage-filter" name="stage"><option value="">Both stages</option><option value="simple">Simple</option><option value="contrastive">Contrastive</option></select></div><div><label for="state-filter">Text status</label><select id="state-filter" name="state"><option value="">All text</option><option value="pending">New · pending approval</option><option value="retained">Existing · approved</option></select></div></form>
<p id="visible-count" role="status" aria-live="polite">116 sentence contexts · 232 questions shown</p><p>Please refer to the sentence/question IDs when suggesting edits. <a href="review.md">Readable Markdown</a> · <a href="${escape(bank.grammarReference)}">Genki I scope</a> · <a href="https://github.com/ajhconway/kikimashta/issues/183">Issue #183</a></p>
<details><summary>Coverage and progression notes</summary><p>WaniKani level 1: two simple and two contrastive variants per word, each with a target-answer and an other-detail question. Review Japanese, readings, English, correct answers and distractors. Pictures are proposed only where all four choices have suitable approved artwork. The 104 new contexts remain pending; twelve existing contexts retain their approved identities and answers.</p><p><strong>Contextual only:</strong> 下さい・力いっぱい・大した. These need direct entry into simple contextual practice in a later integration. 人工・人口 retain word cards, with homophones excluded as standalone distractors. The seven bare numerals and ふじ山 remain word-first. This text review does not generate audio, activate cards or save progress.</p></details>
</header>${articles}<script src="filters.js"></script></body></html>\n`
}

export function buildPack1({ root = projectRoot, write = true } = {}) {
  const loaded = compilePack1(root)
  const bank = combinedPack1(loaded)
  if (write) {
    const put = (path, text) => { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), text) }
    put(draftPath, JSON.stringify(loaded.bank, null, 2) + '\n')
    put('artifacts/contextual-pack-1/review.html', renderPack1Review(loaded))
    put('artifacts/contextual-pack-1/filters.js', filterScript.trim() + '\n')
    put('artifacts/contextual-pack-1/review.md', '# WaniKani level 1 contextual text review\n\nIssue #183. New text remains pending; no speech generation or runtime activation. 下さい・力いっぱい・大した are contextual-only.\n\n' +
      renderContextualMarkdown(bank, loaded.vocabulary).replace('Pilot text review:', 'Pack 1 text review:').replaceAll('codex/contextual-pilot-119/public/', 'codex/contextual-pack1-183/public/'))
  }
  return { ...contextualSummary(bank), newContexts: loaded.bank.contexts.length, newQuestions: loaded.bank.contexts.flatMap(context => context.questions).length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--validate'), 'Usage: node scripts/content/prepare-contextual-pack-1.mjs [--validate]')
    if (process.argv[2] === '--validate') validatePack1()
    console.log(JSON.stringify(buildPack1({ write: process.argv[2] !== '--validate' }), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
