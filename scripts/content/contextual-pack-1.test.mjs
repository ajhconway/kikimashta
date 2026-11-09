import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { approvedContextualQuestions } from '../../src/content/contextual.ts'
import { projectRoot } from './validate-contextual.mjs'
import { combinedPack1, contextualOnlyWords, draftPath, filterScript, renderPack1Review, validatePack1, wordFirstWords } from './prepare-contextual-pack-1.mjs'

test('pack 1 has full two-stage coverage and four choices while every new question remains inactive', () => {
  const loaded = validatePack1()
  assert.equal(loaded.scope.length, 29)
  assert.equal(new Set(loaded.bank.contexts.map(context => context.targetItemId)).size, 26)
  assert.equal(loaded.bank.contexts.length, 104)
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
  for (const context of combined.contexts.filter(context => context.review.text === 'approved')) {
    assert.deepEqual(context, loaded.banks.flatMap(bank => bank.contexts).find(original => original.id === context.id), 'Retained contexts preserve exact approved IDs, text and answer revisions')
  }
  assert.deepEqual(JSON.parse(readFileSync(resolve(projectRoot, draftPath), 'utf8')), loaded.bank)
  assert.equal(readFileSync(resolve(projectRoot, 'artifacts/contextual-pack-1/review.html'), 'utf8'), renderPack1Review(loaded), 'Checked-in review must show current authored text')
  assert.equal(readFileSync(resolve(projectRoot, 'artifacts/contextual-pack-1/filters.js'), 'utf8'), filterScript.trim() + '\n')
})

test('the review filters actual authored content by word, stage and approval status, without losing any choices', () => {
  const loaded = validatePack1()
  const target = loaded.scope.find(word => word.text === '力いっぱい')
  const dom = new JSDOM(renderPack1Review(loaded), {
    url: `http://127.0.0.1/review.html?target=${target.id}&stage=simple&state=pending`, runScripts: 'outside-only',
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
    document.querySelector('[name=state]').value = 'retained'
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
  const purchase = bank.contexts.find(context => context.sentence.text === '母は卵を一つ、父は卵を三つ買いました。')
  assert.ok(requirements(purchase.sentence).includes('買う'), 'Inflection must not drop the dictionary-form verb requirement')
  assert.ok(requirements(purchase.questions[0].prompt).includes('三つ'), 'The contrasted quantity remains a declared requirement')
  const alone = bank.contexts.find(context => context.stage === 'simple' && context.sentence.text === '兄は一人で映画を見ます。')
  const targetQuestion = alone.questions.find(question => question.kind === 'target')
  const answer = targetQuestion.options.find(option => option.id === targetQuestion.correctOptionId)
  assert.equal(answer.text, '一人で')
  assert.ok(answer.grammarTags.length > 0, 'Phrase answers carry conservative authored grammar requirements')
})

test('the text review escapes authored notes and contains no audio, generation or progress controls', () => {
  const loaded = validatePack1()
  loaded.bank.contexts[0].reviewNotes = '<img src=x onerror="alert(1)">'
  const html = renderPack1Review(loaded)
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/)
  assert.doesNotMatch(html, /<img src=x|<audio\b|localStorage|indexedDB|ELEVENLABS_API_KEY/)
  assert.match(html, /208 new questions await text approval/)
  assert.match(html, /Existing approved text · Existing media preserved/)
})
