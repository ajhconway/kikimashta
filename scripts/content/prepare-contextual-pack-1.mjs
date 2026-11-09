import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contextualSummary, validateContextualBank } from '../../src/content/contextual.ts'
import { loadContextualPractice, projectRoot } from './validate-contextual.mjs'
import { renderContextualMarkdown, renderContextualReview } from './build-contextual-review.mjs'
import { contextualTextDigest } from './contextual-audio-plan.mjs'

export const sourceFiles = ['counters', 'nouns', 'actions', 'relations'].map(name => `content/contextual/pack-1/${name}.json`)
export const draftPath = 'content/contextual/ja-wanikani-1-draft.json'
export const contextualOnlyWords = ['下さい', '力いっぱい', '大した']
export const wordFirstWords = ['一', '二', '三', '七', '八', '九', '十', 'ふじ山']
export const previouslyRecordedWords = ['上', '下', '大きい']
const extraGrammar = [
  { id: 'counting', label: 'Counting objects', genkiLesson: 5 },
  { id: 'counting-people', label: 'Counting people', genkiLesson: 7 },
  { id: 'requests', label: 'Requests with noun をください', genkiLesson: 2 },
  { id: 'quoted-speech', label: 'Quoted and reported speech with と言う', genkiLesson: 8 },
  { id: 'polite-past', label: 'Polite past tense', genkiLesson: 4 },
  { id: 'copula-negative', label: 'Negative noun predicates', genkiLesson: 2 },
  { id: 'comparisons', label: 'Comparing two items with より and の方が', genkiLesson: 10 },
  { id: 'desires', label: 'Expressing a desired action with たい', genkiLesson: 11 },
  { id: 'te-requests', label: 'Requests with verb てください', genkiLesson: 6 },
]
const read = (root, path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 12)
const kana = value => value.normalize('NFKC').replace(/[ァ-ヶ]/gu, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const union = values => [...new Map(values.map(value => [value.id, value])).values()]
const operations = new Set(['quantity-meaning', 'paraphrase', 'result-state', 'intent', 'relationship', 'comparison'])
const spoken = value => kana(value).replace(/[\s\p{P}\p{S}]/gu, '')

/** This catches a narrow copying shortcut, not Japanese comprehension quality. */
export function uniqueAnswerEcho(sentence, question) {
  const text = spoken(sentence[1])
  const readings = question.options.map(option => spoken(option[1]))
  // A shorter competing actor such as 兄 must still count when the correct
  // actor is 妹. Only the copied correct answer needs the minimum length.
  const occurrences = readings.map(reading => reading.length >= 2 && text.includes(reading))
  return readings[question.correct].length >= 3 && occurrences[question.correct] && occurrences.filter(Boolean).length === 1
}

export function validateComprehension(sentence, question) {
  const audit = question.comprehension
  assert.ok(audit && operations.has(audit.operation), 'Every question needs an explicit comprehension operation')
  for (const field of ['evidence', 'noEcho']) assert.ok(typeof audit[field] === 'string' && audit[field].trim().length > 20, `Missing substantive comprehension ${field}`)
  assert.ok(!uniqueAnswerEcho(sentence, question), 'Only the correct answer is copied from the sentence: rewrite the question or choices')
}

/** Construct, rather than trust authored text for, the target-only contrast.
 * Structural checks cannot establish the Japanese entailment of either key. */
export function targetCounterfactual(context, question) {
  const proof = question.targetDependency
  assert.ok(proof && Array.isArray(proof.foil) && proof.foil.length === 2, 'Every question needs a target-dependence counterfactual')
  const [surface, reading] = context.occurrence
  const [foilText, foilReading] = proof.foil
  assert.ok(typeof foilText === 'string' && foilText.trim() && foilText !== surface, 'Foil must replace the target expression')
  assert.ok(typeof foilReading === 'string' && foilReading.trim() && spoken(foilReading) !== spoken(reading) && !/\p{Script=Han}/u.test(foilReading), 'Foil needs a different kana reading')
  assert.ok(context.sentence[0].includes(surface) && context.sentence[1].includes(reading), 'Target expression must occur in sentence text and reading')
  assert.ok(Number.isInteger(proof.correct) && proof.correct >= 0 && proof.correct < question.options.length && proof.correct !== question.correct,
    'Changing only the target must change the correct answer')
  for (const field of ['evidence', 'whyNeeded']) assert.ok(typeof proof[field] === 'string' && proof[field].trim().length > 25, `Missing substantive target-dependence ${field}`)
  return { target: { text: surface, reading }, foil: { text: foilText, reading: foilReading },
    sentence: { text: context.sentence[0].replaceAll(surface, foilText), reading: context.sentence[1].replaceAll(reading, foilReading) },
    originalCorrect: question.correct, alternateCorrect: proof.correct,
    originalAnswer: question.options[question.correct][0], alternateAnswer: question.options[proof.correct][0],
    whyNeeded: proof.whyNeeded, evidence: proof.evidence }
}

export function pack1Scope(vocabulary) {
  return vocabulary.filter(word => word.sourceLevel === 1 && !word.removalReason && !wordFirstWords.includes(word.text))
}

/** Compile authored text only. Catalogue membership here grants no runtime eligibility. */
export function compilePack1(root = projectRoot) {
  const { banks, vocabulary } = loadContextualPractice(root)
  const scope = pack1Scope(vocabulary)
  const byText = new Map(vocabulary.filter(word => !word.removalReason).map(word => [word.text, word]))
  const pictureIds = new Set(read(root, 'content/practice-pool.json').itemIds)
  const authored = sourceFiles.flatMap(file => read(root, file).targets)
  assert.deepEqual(authored.map(target => target.text).sort(), scope.map(word => word.text).sort(), 'Draft must cover each of the 29 targets once')
  const previous = read(root, 'content/contextual/pack-1/target-dependence-baseline.json')
  assert.equal(previous.questions.length, 232, 'Keep the complete original review for comparison')
  const audits = []
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
        try { validateComprehension(context.sentence, question) } catch (error) { throw new Error(`${id}-${question.kind}: ${error.message}`, { cause: error }) }
        let targetDependency
        try { targetDependency = targetCounterfactual(context, question) } catch (error) { throw new Error(`${id}-${question.kind}: ${error.message}`, { cause: error }) }
        assert.equal(question.options.length, 4, `${id}: every question requires four choices`)
        assert.ok(Number.isInteger(question.correct) && question.correct >= 0 && question.correct < 4, `${id}: invalid answer index`)
        if (question.pictureOptions) assert.equal(question.pictureOptions.length, 4)
        const options = question.options.map((tuple, index) => {
          const word = byText.get(tuple[0])
          const vocabularyItemId = word && kana(word.reading) === kana(tuple[1]) ? word.id : undefined
          const option = { id: `answer-${hash(`${tuple[0]}\n${tuple[1]}`)}`, ...prompt(tuple, context.grammarTags, [tuple]),
            ...(vocabularyItemId ? { vocabularyItemId } : {}) }
          if (question.pictureOptions) {
            const picture = byText.get(question.pictureOptions[index])
            assert.ok(picture && pictureIds.has(picture.id), `${id}: picture must come from approved practice pool: ${question.pictureOptions[index]}`)
            option.imageItemId = picture.id
          }
          return option
        })
        const questionId = `${id}-${question.kind}`
        const before = previous.questions.find(old => old.targetItemId === target.id && old.stage === context.stage && old.variant === context.variant && old.focus === question.kind)
        assert.ok(before, `${questionId}: missing original question audit`)
        const changed = ['text', 'reading', 'meaning'].some((field, index) => before.sentence[field] !== context.sentence[index] || before.prompt[field] !== question.prompt[index]) ||
          JSON.stringify(before.options.map(option => [option.text, option.reading, option.meaning])) !== JSON.stringify(question.options) ||
          before.options.find(option => option.id === before.correctOptionId).text !== question.options[question.correct][0]
        audits.push({ questionId, contextId: id, targetItemId: target.id, focus: question.kind,
          previousQuestionId: before.id, decision: changed ? 'rewritten' : 'retained-after-review', ...question.comprehension, targetDependency })
        // Authoring focus and literal answer concept are independent. A result
        // of 上げる can be 上 without falsely identifying those two vocabulary IDs.
        const kind = options[question.correct].vocabularyItemId === target.id ? 'target' : 'detail'
        return { id: questionId, revision: before.questionRevision + (changed ? 1 : 0), kind,
          prompt: prompt(question.prompt, [...context.grammarTags, 'questions', 'question-words'], words),
          formats: question.pictureOptions ? ['picture', 'text'] : ['text'], options,
          correctOptionId: options[question.correct].id, explanation: question.explanation }
      })
      const beforeContext = previous.questions.find(old => old.targetItemId === target.id && old.stage === context.stage && old.variant === context.variant)
      const changedContext = audits.some(audit => audit.contextId === id && audit.decision === 'rewritten') ||
        JSON.stringify(beforeContext.targetOccurrence) !== JSON.stringify({ surface: context.occurrence[0], reading: context.occurrence[1] })
      return { id, revision: beforeContext.contextRevision + (changedContext ? 1 : 0), stage: context.stage,
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
  return { bank, banks, vocabulary, scope, audits, previous }
}

/** A rebuild cannot silently replace the owner's approved text snapshot. */
export function validateFrozenPack1(bank, bytes, approval) {
  assert.ok(approval?.schemaVersion === 1 && approval.bankId === bank.id && approval.language === bank.language,
    'Pack 1 text approval is missing or identifies a different bank')
  assert.equal(createHash('sha256').update(bytes).digest('hex'), approval.sourceFileSha256,
    'Pack 1 source differs from the approved frozen snapshot; obtain fresh text approval')
  assert.equal(contextualTextDigest(bank), approval.textSha256,
    'Pack 1 text differs from the approved digest; obtain fresh text approval')
}

/** Verify checked-in expanded content is reproducible and stays pending and inactive. */
export function validatePack1(root = projectRoot) {
  const compiled = compilePack1(root)
  const bytes = readFileSync(resolve(root, draftPath))
  validateFrozenPack1(compiled.bank, bytes, read(root, 'content/contextual/pack-1/text-approval.json'))
  assert.deepEqual(read(root, draftPath), compiled.bank, 'Expanded draft differs from its authored sources; rebuild it')
  assert.deepEqual(read(root, 'content/contextual/pack-1/comprehension-audit.json').questions, compiled.audits, 'Comprehension review differs from the authored questions; rebuild it')
  const artifacts = {
    'review.html': renderPack1Review(compiled),
    'filters.js': filterScript.trim() + '\n',
    'review.md': renderPack1Markdown(compiled),
    'comprehension-audit.md': renderComprehensionAudit(compiled),
  }
  for (const [name, expected] of Object.entries(artifacts)) assert.equal(readFileSync(resolve(root, 'artifacts/contextual-pack-1', name), 'utf8'), expected, `${name} differs from authored content; rebuild it`)
  return compiled
}

export function combinedPack1({ bank, vocabulary, scope }) {
  const combined = bank
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
    const origin = previouslyRecordedWords.includes(targets.get(context.targetItemId).text) ? 'pilot' : 'expansion'
    const only = contextualOnlyWords.includes(targets.get(context.targetItemId).text)
    return `<article id="${escape(id)}" data-target="${escape(context.targetItemId)}" data-stage="${stage}" data-origin="${origin}"><p class="badge">${stage === 'simple' ? 'Simple' : 'Contrastive'}${only ? ' · Contextual only' : ''}</p>`
  })
  const audits = new Map(loaded.audits.map(audit => [audit.questionId, audit]))
  const previous = new Map(loaded.previous.questions.map(question => [question.id, question]))
  articles = articles.replace(/<section class="question">[\s\S]*?<\/section>/g, section => {
    const questionId = section.match(/<p class="identifier">([^ ]+)/)[1]
    const audit = audits.get(questionId)
    const before = previous.get(audit.previousQuestionId)
    const oldChoices = before.options.map(option => `${option.text}${option.id === before.correctOptionId ? ' ✓' : ''}`).join(' / ')
    const dependency = audit.targetDependency
    const target = targets.get(audit.targetItemId)
    const targetCheck = `<details class="metadata target-dependency"><summary>Target-word check · ${escape(target.text)}</summary><p><strong>Why the target is necessary:</strong> ${escape(dependency.whyNeeded)}</p><p>Change only <span lang="ja">${escape(dependency.target.text)} → ${escape(dependency.foil.text)}</span>:</p><p class="japanese" lang="ja">${escape(dependency.sentence.text)}</p><p lang="ja">${escape(dependency.sentence.reading)}</p><p><strong>Original answer:</strong> <span lang="ja">${escape(dependency.originalAnswer)}</span></p><p><strong>Answer with changed target:</strong> <span lang="ja">${escape(dependency.alternateAnswer)}</span></p><p>${escape(dependency.evidence)}</p></details>`
    const details = `<details class="metadata"><summary>Comprehension check · ${escape(audit.operation)}</summary><p><strong>Meaning required:</strong> ${escape(audit.evidence)}</p><p><strong>Copying check:</strong> ${escape(audit.noEcho)}</p><details><summary>Previous question</summary><p lang="ja">${escape(before.sentence.text)}</p><p lang="ja">${escape(before.prompt.text)}</p><p lang="ja">${escape(oldChoices)}</p><p class="identifier">${escape(before.id)} · ${escape(audit.decision)}</p></details></details>`
    return section.replace(/<h3>[^<]+<\/h3>/, `<h3>${audit.focus === 'target' ? 'Target meaning' : 'Target in context'}</h3>`).replace('</section>', `${targetCheck}${details}</section>`)
  })
  const options = scope.map(word => `<option value="${escape(word.id)}">${escape(word.text)} · ${escape(word.meaning)}</option>`).join('')
  return `${head}<style>[hidden]{display:none!important}#filters{display:flex;flex-wrap:wrap;gap:16px;margin:20px 0}label{display:grid;gap:6px}select{font:inherit;padding:10px;border:1px solid #b6a7c7;border-radius:10px;background:white;max-width:100%}header{position:relative}article{scroll-margin-top:16px}</style></head><body><header>
<h1>Pack 1 · Contextual questions</h1>
<p>29 words · 116 sentences · 232 questions · Four choices each</p>
<p class="notice">Every question must require the target word. Expand “Target-word check” to see how changing only that expression changes the correct answer. Revised text awaits approval before audio.</p>
<form id="filters"><div><label for="target-filter">Word</label><select id="target-filter" name="target"><option value="">All words</option>${options}</select></div><div><label for="stage-filter">Stage</label><select id="stage-filter" name="stage"><option value="">Both stages</option><option value="simple">Simple</option><option value="contrastive">Contrastive</option></select></div><div><label for="origin-filter">Original source</label><select id="origin-filter" name="origin"><option value="">All questions</option><option value="expansion">Pack 1 expansion</option><option value="pilot">Replaces pilot text</option></select></div></form>
<p id="visible-count" role="status" aria-live="polite">116 sentence contexts · 232 questions shown</p><p>Please refer to the sentence/question IDs when suggesting edits. <a href="comprehension-audit.md">Full comprehension audit</a> · <a href="review.md">Readable text</a> · <a href="${escape(bank.grammarReference)}">Genki I scope</a></p>
<details><summary>Coverage and progression notes</summary><p>Two simple and two contrastive variants per word, each with two questions requiring the target meaning. A question about another detail must still depend on the target. The correct answer need not be the literal target word. All 116 contexts remain pending. Existing approved banks, speech and progress retain their original identities.</p><p><strong>Contextual only:</strong> 下さい・力いっぱい・大した. These need direct entry into simple contextual practice in a later integration. 人工・人口 retain word cards, with homophones excluded as standalone distractors. The seven bare numerals and ふじ山 remain word-first. This text review does not generate audio, activate cards or save progress.</p></details>
</header>${articles}<script src="filters.js"></script></body></html>\n`
}

export function buildPack1({ root = projectRoot, write = true } = {}) {
  const loaded = compilePack1(root)
  const bank = combinedPack1(loaded)
  const bytes = JSON.stringify(loaded.bank, null, 2) + '\n'
  validateFrozenPack1(loaded.bank, bytes, read(root, 'content/contextual/pack-1/text-approval.json'))
  if (write) {
    const put = (path, text) => { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), text) }
    put(draftPath, bytes)
    put('artifacts/contextual-pack-1/review.html', renderPack1Review(loaded))
    put('artifacts/contextual-pack-1/filters.js', filterScript.trim() + '\n')
    put('artifacts/contextual-pack-1/review.md', renderPack1Markdown(loaded))
    put('artifacts/contextual-pack-1/comprehension-audit.md', renderComprehensionAudit(loaded))
    put('content/contextual/pack-1/comprehension-audit.json', JSON.stringify({ schemaVersion: 1, baselineRevision: loaded.previous.sourceRevision, questions: loaded.audits }, null, 2) + '\n')
  }
  return { ...contextualSummary(bank), auditedQuestions: loaded.audits.length,
    rewrittenQuestions: loaded.audits.filter(audit => audit.decision === 'rewritten').length,
    targetDependenceChecks: loaded.audits.filter(audit => audit.targetDependency).length }
}

export function renderPack1Markdown(loaded) {
  let markdown = renderContextualMarkdown(loaded.bank, loaded.vocabulary).replace('Pilot text review:', 'Pack 1 text review:').replaceAll('codex/contextual-pilot-119/public/', 'codex/contextual-pack1-183/public/')
  for (const audit of loaded.audits) markdown = markdown.replace(new RegExp(`(\\*\\*${audit.questionId}\\*\\* · )(target answer|other detail)`), `$1${audit.focus === 'target' ? 'target meaning' : 'situation meaning'}`)
  return '# WaniKani level 1 contextual text review\n\nIssue #183. All revised text remains pending; no speech generation or runtime activation. [Comprehension audit](comprehension-audit.md). 下さい・力いっぱい・大した are contextual-only.\n\n' + markdown
}

export function renderComprehensionAudit(loaded) {
  const byId = new Map(loaded.vocabulary.map(word => [word.id, word]))
  const previous = new Map(loaded.previous.questions.map(question => [question.id, question]))
  const questions = new Map(loaded.bank.contexts.flatMap(context => context.questions.map(question => [question.id, { context, question }])))
  const lines = ['# Pack 1 comprehension review', '',
    'All 232 questions were checked for target-word dependence. Masking the target must make the answer indeterminate. Each target-only counterfactual keeps the question, choices and other facts fixed and has a different entailed answer. Both target-focus and contextual-detail questions must meet this rule.', '',
    'Structural checks verify the replacement and different key, not Japanese entailment. Original and counterfactual answer keys require independent semantic review. The existing non-copying and beginner-language requirements still apply. All revised text remains pending; original accepted media and progress are preserved.', '']
  for (const audit of loaded.audits) {
    const { context, question } = questions.get(audit.questionId)
    const before = previous.get(audit.previousQuestionId)
    const dependency = audit.targetDependency
    lines.push(`## ${byId.get(audit.targetItemId).text} · ${context.stage} · ${audit.questionId}`, '',
      `**Decision:** ${audit.decision}. **Focus:** ${audit.focus}. **Operation:** ${audit.operation}.`, '',
      `**Before:** ${before.sentence.text} → ${before.prompt.text}`, '',
      `**After:** ${context.sentence.text} → ${question.prompt.text}`, '',
      `**Choices:** ${question.options.map(option => `${option.text}${option.id === question.correctOptionId ? ' ✓' : ''}`).join(' / ')}`, '',
      `**Meaning required:** ${audit.evidence}`, '', `**Copying check:** ${audit.noEcho}`, '',
      `**Target required:** ${dependency.whyNeeded}`, '',
      `**Change only:** ${dependency.target.text} → ${dependency.foil.text}`, '',
      `**Counterfactual sentence:** ${dependency.sentence.text}`, '',
      `**Answer changes:** ${dependency.originalAnswer} → ${dependency.alternateAnswer}`, '',
      `**Counterfactual evidence:** ${dependency.evidence}`, '')
  }
  return lines.join('\n')
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
