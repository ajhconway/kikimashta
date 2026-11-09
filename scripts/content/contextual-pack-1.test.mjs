import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { approvedContextualQuestions } from '../../src/content/contextual.ts'
import { projectRoot } from './validate-contextual.mjs'
import { combinedPack1, contextualOnlyWords, draftPath, filterScript, renderPack1Review, targetCounterfactual, validateComprehension, validateFrozenPack1, validatePack1, wordFirstWords } from './prepare-contextual-pack-1.mjs'

test('rebuilding approved content cannot carry stale approval across text or source-byte changes', () => {
  const bytes = readFileSync(resolve(projectRoot, draftPath))
  const bank = JSON.parse(bytes)
  const approval = JSON.parse(readFileSync(resolve(projectRoot, 'content/contextual/pack-1/text-approval.json')))
  assert.doesNotThrow(() => validateFrozenPack1(bank, bytes, approval))
  const changed = structuredClone(bank)
  changed.contexts[0].sentence.meaning += ' Changed after review.'
  const rebuilt = JSON.stringify(changed, null, 2) + '\n'
  assert.throws(() => validateFrozenPack1(changed, rebuilt, approval), /approved frozen snapshot/)
  const updatedSourceHash = { ...approval, sourceFileSha256: createHash('sha256').update(rebuilt).digest('hex') }
  assert.throws(() => validateFrozenPack1(changed, rebuilt, updatedSourceHash), /approved digest/)
  assert.throws(() => validateFrozenPack1(bank, Buffer.concat([bytes, Buffer.from('\n')]), approval), /approved frozen snapshot/)
})

test('pack 1 has full two-stage coverage and four choices while every new question remains inactive', () => {
  const loaded = validatePack1()
  assert.equal(loaded.scope.length, 29)
  assert.equal(new Set(loaded.bank.contexts.map(context => context.targetItemId)).size, 29)
  assert.equal(loaded.bank.contexts.length, 116)
  assert.equal(loaded.audits.length, 232)
  assert.equal(new Set(loaded.audits.map(audit => audit.previousQuestionId)).size, 232, 'Every previous question receives a review')
  for (const audit of loaded.audits) {
    const proof = audit.targetDependency
    assert.notEqual(proof.originalCorrect, proof.alternateCorrect, `${audit.questionId}: target must affect the answer`)
    assert.notEqual(proof.originalAnswer, proof.alternateAnswer)
    assert.ok(proof.whyNeeded.length > 25)
  }
  for (const context of loaded.bank.contexts) {
    assert.deepEqual(context.review, { text: 'pending', audio: 'not-generated' })
    assert.deepEqual(context.recordings, [])
    assert.equal(context.questions.length, 2)
    for (const question of context.questions) {
      assert.equal(question.options.length, 4)
      assert.ok(question.formats.includes('text'))
      assert.equal(question.options.filter(option => option.id === question.correctOptionId).length, 1)
    }
  }
  assert.deepEqual(approvedContextualQuestions(loaded.bank, 'text'), [])
  assert.deepEqual(approvedContextualQuestions(loaded.bank, 'picture'), [])
  assert.ok(wordFirstWords.every(text => !loaded.scope.some(word => word.text === text)))
  assert.ok(contextualOnlyWords.every(text => loaded.scope.some(word => word.text === text)))
  assert.ok(['人工', '人口'].every(text => loaded.scope.some(word => word.text === text)))
  const combined = combinedPack1(loaded)
  assert.equal(combined.contexts.length, 116)
  const approvedIds = new Set(loaded.banks.flatMap(bank => bank.contexts).map(context => context.id))
  assert.ok(combined.contexts.every(context => !approvedIds.has(context.id)), 'Pending pilot replacements cannot impersonate approved contexts')
  assert.deepEqual(JSON.parse(readFileSync(resolve(projectRoot, draftPath), 'utf8')), loaded.bank)
  assert.equal(readFileSync(resolve(projectRoot, 'artifacts/contextual-pack-1/review.html'), 'utf8'), renderPack1Review(loaded), 'Checked-in review must show current authored text')
  assert.equal(readFileSync(resolve(projectRoot, 'artifacts/contextual-pack-1/filters.js'), 'utf8'), filterScript.trim() + '\n')
})

test('the review filters actual authored content by word, stage and original source, without losing any choices', () => {
  const loaded = validatePack1()
  const target = loaded.scope.find(word => word.text === '力いっぱい')
  const dom = new JSDOM(renderPack1Review(loaded), {
    url: `http://127.0.0.1/review.html?target=${target.id}&stage=simple&origin=expansion`, runScripts: 'outside-only',
  })
  try {
    dom.window.eval(filterScript)
    const document = dom.window.document
    const visible = () => [...document.querySelectorAll('article')].filter(article => !article.hidden)
    assert.equal(visible().length, 2)
    assert.match(document.querySelector('#visible-count').textContent, /2 sentence contexts · 4 questions shown/)
    for (const article of visible()) {
      assert.equal(article.dataset.target, target.id)
      assert.equal(article.dataset.stage, 'simple')
      assert.match(article.textContent, /Contextual only/)
      assert.equal(article.querySelectorAll('.question').length, 2)
      assert.equal(article.querySelectorAll('.option').length, 8)
      assert.equal(article.querySelectorAll('.option.correct').length, 2)
    }
    document.querySelector('[name=origin]').value = 'pilot'
    document.querySelector('#filters').dispatchEvent(new dom.window.Event('change'))
    assert.equal(visible().length, 0)
    assert.match(document.querySelector('#visible-count').textContent, /0 sentence contexts/)
    for (const select of document.querySelectorAll('select')) select.value = ''
    document.querySelector('#filters').dispatchEvent(new dom.window.Event('change'))
    assert.equal(visible().length, 116)
    assert.equal(document.querySelectorAll('.question').length, 232)
    assert.equal(document.querySelectorAll('.option').length, 928)
    assert.equal(dom.window.location.search, '')
  } finally { dom.window.close() }
})

test('requirements retain dictionary-form verbs, contrasted quantities and phrase-answer grammar', () => {
  const { bank } = validatePack1()
  const requirements = prompt => prompt.supportingVocabularyIds.map(id => bank.supportingVocabulary.find(word => word.id === id).text)
  const meal = bank.contexts.find(context => context.id === 'ja-ctx-wk1-simple-hitotsu-02')
  assert.ok(requirements(meal.sentence).includes('食べる'), 'Inflection must not drop the dictionary-form verb requirement')
  const contrast = bank.contexts.find(context => context.id === 'ja-ctx-wk1-contrastive-hitotsu-01')
  assert.ok(requirements(contrast.questions[0].prompt).includes('三つ'), 'The contrasted spoken quantity remains a declared requirement')
  const phrase = bank.contexts.flatMap(context => context.questions).find(question => question.options.some(option => option.text.length > 12))
  const answer = phrase.options.find(option => option.id === phrase.correctOptionId)
  assert.ok(answer.grammarTags.length > 0, 'Phrase answers carry conservative authored grammar requirements')
})

test('a self-described comprehension label cannot admit uniquely repeated answer copying', () => {
  const question = { correct: 0, options: [['一つ', 'ひとつ', 'one'], ['二つ', 'ふたつ', 'two'], ['三つ', 'みっつ', 'three'], ['四つ', 'よっつ', 'four']],
    comprehension: { operation: 'quantity-meaning', evidence: 'A plausible description is not a substitute for a semantic check.', noEcho: 'This label cannot excuse a uniquely copied spoken answer.' } }
  assert.throws(() => validateComprehension(['りんごが一つあります。', 'りんごがひとつあります。', 'There is one apple.'], question), /Only the correct answer is copied/)
  question.options = [['１個', 'いっこ', 'one item'], ['２個', 'にこ', 'two items'], ['３個', 'さんこ', 'three items'], ['４個', 'よんこ', 'four items']]
  assert.doesNotThrow(() => validateComprehension(['りんごが一つあります。', 'りんごがひとつあります。', 'There is one apple.'], question))
  question.options = [['妹', 'いもうと', 'younger sister'], ['兄', 'あに', 'older brother'], ['父', 'ちち', 'father'], ['母', 'はは', 'mother']]
  assert.doesNotThrow(() => validateComprehension(['兄は強く、妹は弱く押しました。', 'あにはつよく、いもうとはよわくおしました。', 'My brother pushed strongly; my sister pushed weakly.'], question), 'A shorter competing actor also prevents unique-answer echo')
})

test('target focus can test a consequence without assigning the target vocabulary ID to a different answer', () => {
  const { bank, audits } = validatePack1()
  const context = bank.contexts.find(context => context.id === 'ja-ctx-wk1-simple-ageru-01')
  const question = context.questions.find(question => question.id.endsWith('-target'))
  const correct = question.options.find(option => option.id === question.correctOptionId)
  assert.notEqual(correct.vocabularyItemId, context.targetItemId)
  assert.equal(question.kind, 'detail', 'Runtime kind continues to describe the actual answer concept')
  assert.equal(audits.find(audit => audit.questionId === question.id).focus, 'target', 'The authoring focus still tests the target meaning')
})

test('target-only contrasts preserve the rest of the sentence and reject the invariant sleeping example', () => {
  const context = { occurrence: ['上', 'うえ'], sentence: ['猫は箱の上で眠っています。', 'ねこははこのうえでねむっています。', 'The cat is asleep above the box.'] }
  const question = { options: [['上', 'うえ', 'above'], ['下', 'した', 'below'], ['左', 'ひだり', 'left'], ['右', 'みぎ', 'right']], correct: 1,
    targetDependency: { foil: ['下', 'した'], correct: 0, evidence: 'Reversing the location reverses the answer to the inverse-position question.', whyNeeded: 'The objects alone cannot determine which vertical relation holds without the target.' } }
  const original = structuredClone({ context, question })
  const proof = targetCounterfactual(context, question)
  assert.equal(proof.sentence.text, '猫は箱の下で眠っています。')
  assert.equal(proof.sentence.reading, 'ねこははこのしたでねむっています。')
  assert.deepEqual({ context, question }, original, 'The question, choices and source are not rewritten by the proof builder')
  // For the old sleeping question, an honest answer key stays unchanged when
  // 上 becomes 下. A comprehension rationale cannot turn that into dependency.
  const sleepingQuestion = { prompt: ['今、猫はどうしていますか。', 'いま、ねこはどうしていますか。', 'What is the cat doing now?'],
    correct: 2, options: [['起きて遊んでいます', 'おきてあそんでいます', 'awake and playing'], ['起きて食べています', 'おきてたべています', 'awake and eating'], ['今は起きていません', 'いまはおきていません', 'not awake now'], ['起きて走っています', 'おきてはしっています', 'awake and running']],
    targetDependency: { ...question.targetDependency, correct: 2 } }
  assert.throws(() => targetCounterfactual(context, sleepingQuestion), /must change the correct answer/)
  delete sleepingQuestion.targetDependency
  assert.throws(() => targetCounterfactual(context, sleepingQuestion), /target-dependence counterfactual/)
})

test('the text review escapes authored notes and contains no audio, generation or progress controls', () => {
  const loaded = validatePack1()
  loaded.bank.contexts[0].reviewNotes = '<img src=x onerror="alert(1)">'
  const html = renderPack1Review(loaded)
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/)
  assert.doesNotMatch(html, /<img src=x|<audio\b|localStorage|indexedDB|ELEVENLABS_API_KEY/)
  assert.match(html, /Every question must require the target word/)
  assert.match(html, /Target-word check/)
  assert.match(html, /Answer with changed target/)
  assert.match(html, /Comprehension check/)
  assert.match(html, /Previous question/)
  assert.match(html, /Target meaning/)
})
