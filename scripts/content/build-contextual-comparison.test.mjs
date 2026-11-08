import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { approvedContextualQuestions, contextualSummary } from '../../src/content/contextual.ts'
import { contextualTextDigest } from './contextual-audio-plan.mjs'
import { REVIEW_DIRECTORY, SIMPLE_BANK_PATH, renderContextualComparison, validateComparison } from './build-contextual-comparison.mjs'
import { loadContextualPilot, projectRoot } from './validate-contextual.mjs'

function fixture() {
  const { bank: contrastive, vocabulary } = loadContextualPilot()
  const { bank: simple } = loadContextualPilot(projectRoot, SIMPLE_BANK_PATH)
  const provenance = JSON.parse(readFileSync(resolve(projectRoot, REVIEW_DIRECTORY, 'review-provenance.json'), 'utf8'))
  return { simple, contrastive, provenance, vocabulary }
}

test('simple pilot covers both question kinds with no practice-ready questions and preserves the approved original', () => {
  const { simple, contrastive, provenance } = fixture()
  const pairs = validateComparison(simple, contrastive, provenance)
  assert.equal(pairs.length, 3)
  assert.deepEqual(contextualSummary(simple), { targets: 3, contexts: 3, questions: 6, targetQuestions: 3, detailQuestions: 3,
    pictureQuestions: 3, textQuestions: 6, readyPictureQuestions: 0, readyTextQuestions: 0 })
  assert.deepEqual(approvedContextualQuestions(simple, 'text'), [])
  assert.deepEqual(approvedContextualQuestions(simple, 'picture'), [])
  assert.equal(contextualTextDigest(contrastive), '8e0d47de0694204b9186cec88ced293b182b2c0e8634b5ab5a21073161173ac3')
  assert.deepEqual(pairs.flatMap(pair => pair.questions.flatMap(question => question.samples)).map(sample => sample.src).sort(),
    provenance.samples.map(sample => sample.src).sort())
})

for (const [name, mutate, error] of [
  ['different language', fixture => { fixture.simple.language = 'fr-FR' }, /languages differ/],
  ['duplicate link', fixture => { fixture.simple.contexts[1].comparisonContextId = fixture.simple.contexts[0].comparisonContextId }, /distinct comparison/],
  ['wrong target', fixture => { fixture.simple.contexts[0].targetItemId = fixture.simple.contexts[1].targetItemId }, /target differs/],
  ['changed correct concept', fixture => { fixture.simple.contexts[0].questions[0].correctOptionId = 'below' }, /same correct concept/],
  ['premature approval', fixture => { fixture.simple.contexts[0].review.text = 'approved' }, /remain pending/],
  ['new recording', fixture => { fixture.simple.contexts[0].recordings = [{ id: 'new' }] }, /without recordings/],
  ['repeated audio', fixture => { fixture.provenance.samples[1] = fixture.provenance.samples[0] }, /Missing or repeated/],
  ['wrong audio text', fixture => { fixture.provenance.samples[0].question.text = '違います。' }, /text or revision differs/],
  ['unsafe audio path', fixture => { fixture.provenance.samples[0].src = '../a.wav' }, /Unsafe comparison/],
]) {
  test('comparison rejects ' + name, () => {
    const data = fixture()
    mutate(data)
    assert.throws(() => validateComparison(data.simple, data.contrastive, data.provenance), error)
  })
}

test('comparison renders all authored choices and only existing contrastive audio, escaping authored HTML', () => {
  const { simple, contrastive, provenance, vocabulary } = fixture()
  const pairs = validateComparison(simple, contrastive, provenance)
  pairs[0].simple.sentence.text = '<script>bad()</script>'
  const imageUrls = new Map(vocabulary.map(item => [item.image.src, 'comparison-images/example.jpg']))
  const html = renderContextualComparison({ pairs, vocabulary, imageUrls })
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'))
  assert.ok(!html.includes('<script>'))
  assert.equal((html.match(/<audio /g) ?? []).length, 12)
  assert.equal((html.match(/data-stage="simple"/g) ?? []).length, 6)
  assert.equal((html.match(/Correct answer<\/p>/g) ?? []).length, 12)
  assert.equal((html.match(/Text awaiting approval · audio not generated/g) ?? []).length, 3)
  for (const pair of pairs) {
    for (const questionPair of pair.questions) {
      assert.ok(html.includes(questionPair.simple.id))
      assert.ok(html.includes(questionPair.simple.prompt.text))
    }
  }
  for (const section of html.matchAll(/<section class="simple" data-stage="simple">([\s\S]*?)<\/section>/g)) {
    assert.ok(!section[1].includes('<audio'))
  }
})
