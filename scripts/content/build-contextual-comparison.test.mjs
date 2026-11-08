import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { approvedContextualQuestions, contextualSummary } from '../../src/content/contextual.ts'
import { contextualTextDigest } from './contextual-audio-plan.mjs'
import { REVIEW_DIRECTORY, SIMPLE_BANK_PATH, renderContextualComparison, validateComparison, verifyComparisonAudio } from './build-contextual-comparison.mjs'
import { loadContextualPilot, projectRoot } from './validate-contextual.mjs'

function fixture() {
  const { bank: contrastive, vocabulary } = loadContextualPilot()
  const { bank: simple } = loadContextualPilot(projectRoot, SIMPLE_BANK_PATH)
  // This fixture intentionally exercises the draft-only gallery even after the
  // checked-in simple bank has received its text approval.
  for (const context of simple.contexts) context.review = { text: 'pending', audio: 'not-generated' }
  const provenance = JSON.parse(readFileSync(resolve(projectRoot, REVIEW_DIRECTORY, 'review-provenance.json'), 'utf8'))
  return { simple, contrastive, provenance, vocabulary }
}

function audioFixture() {
  const data = fixture()
  for (const context of data.simple.contexts) context.review = { text: 'approved', audio: 'pending' }
  const simpleProvenance = structuredClone(data.provenance)
  simpleProvenance.bankId = data.simple.id
  simpleProvenance.approval = { ...simpleProvenance.approval, bankId: data.simple.id,
    language: data.simple.language, textSha256: contextualTextDigest(data.simple) }
  simpleProvenance.samples = data.simple.contexts.flatMap(context => context.questions.flatMap(question =>
    data.provenance.voices.map(voice => {
      const answer = question.options.find(option => option.id === question.correctOptionId)
      const original = data.provenance.samples.find(sample => sample.contextId === context.comparisonContextId &&
        sample.question.kind === question.kind && sample.voice === voice.voice)
      return { ...structuredClone(original), src: `samples/${voice.voice}-${question.id}.wav`, contextId: context.id,
        contextRevision: context.revision, targetItemId: context.targetItemId,
        sentence: { ...context.sentence }, question: { ...question.prompt, id: question.id, revision: question.revision,
          kind: question.kind, correctAnswer: answer.text, correctMeaning: answer.meaning } }
    })))
  return { ...data, simpleProvenance }
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
  ['rejected text', fixture => { fixture.simple.contexts[0].review.text = 'rejected' }, /pending or approved text/],
  ['premature audio approval', fixture => { fixture.simple.contexts[0].review.audio = 'approved' }, /unapproved audio/],
  ['new production recording', fixture => { fixture.simple.contexts[0].recordings = [{ id: 'new' }] }, /no production recordings/],
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

test('approved text can be reviewed while simple audio is unavailable', () => {
  const { simple, contrastive, provenance, vocabulary } = audioFixture()
  const pairs = validateComparison(simple, contrastive, provenance)
  const html = renderContextualComparison({ pairs, vocabulary, imageUrls: new Map() })
  assert.equal((html.match(/<audio /g) ?? []).length, 12)
  assert.equal((html.match(/Text approved · audio not available/g) ?? []).length, 3)
  assert.ok(!html.includes('Text awaiting approval'))
})

for (const [name, mutate, error] of [
  ['pending text', data => { data.simple.contexts[0].review.text = 'pending' }, /requires approved text/],
  ['changed approval digest', data => { data.simpleProvenance.approval.textSha256 = '0'.repeat(64) }, /text approval differs/],
  ['wrong bank', data => { data.simpleProvenance.bankId = 'other-bank' }, /text approval differs/],
  ['wrong sentence', data => { data.simpleProvenance.samples[0].sentence.text += '違います。' }, /text or revision differs/],
  ['wrong question', data => { data.simpleProvenance.samples[0].question.id = 'different-question' }, /Missing or repeated/],
  ['wrong question reading', data => { data.simpleProvenance.samples[0].question.reading += 'ちがいます' }, /text or revision differs/],
  ['wrong target', data => { data.simpleProvenance.samples[0].targetItemId = 'wrong-target' }, /text or revision differs/],
  ['wrong revision', data => { data.simpleProvenance.samples[0].contextRevision += 1 }, /text or revision differs/],
  ['wrong answer', data => { data.simpleProvenance.samples[0].question.correctAnswer = '違う' }, /text or revision differs/],
  ['wrong voice', data => { data.simpleProvenance.samples[0].voice = 'unapproved' }, /Missing or repeated/],
  ['wrong voice label', data => { data.simpleProvenance.samples[0].voiceName = 'Other voice' }, /text or revision differs/],
  ['wrong voice metadata', data => { data.simpleProvenance.voices[0].name = 'Other voice' }, /voices differ/],
]) {
  test('simple audio comparison rejects ' + name, () => {
    const data = audioFixture()
    mutate(data)
    assert.throws(() => validateComparison(data.simple, data.contrastive, data.provenance, data.simpleProvenance), error)
  })
}

test('approved simple audio renders both stages with independent recordings and escaped labels', () => {
  const { simple, contrastive, provenance, simpleProvenance, vocabulary } = audioFixture()
  const pairs = validateComparison(simple, contrastive, provenance, simpleProvenance)
  const html = renderContextualComparison({ pairs, vocabulary, imageUrls: new Map() })
  assert.equal((html.match(/<audio /g) ?? []).length, 24)
  assert.equal((html.match(/src="simple-audio\/samples\//g) ?? []).length, 12)
  assert.equal((html.match(/Text approved · listening approval pending/g) ?? []).length, 3)
  assert.ok(!html.includes('audio not generated'))
  assert.ok(!html.includes('Simple audio will follow'))
  for (const section of html.matchAll(/<section class="simple" data-stage="simple">([\s\S]*?)<\/section>/g)) {
    assert.equal((section[1].match(/<audio /g) ?? []).length, 2)
    assert.ok(section[1].includes('simple-audio/samples/'))
  }
  pairs[0].questions[0].simpleSamples[0].voiceName = '<script>voice()</script>'
  const escaped = renderContextualComparison({ pairs, vocabulary, imageUrls: new Map() })
  assert.ok(escaped.includes('&lt;script&gt;voice()&lt;/script&gt;'))
  assert.ok(!escaped.includes('<script>'))
})

test('comparison audio integrity rejects changed bytes and sizes before publication', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'kikimashta-comparison-audio-'))
  try {
    mkdirSync(resolve(directory, 'samples'))
    const bytes = Buffer.from('small deterministic audio fixture')
    const sample = { src: 'samples/example.wav', bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') }
    writeFileSync(resolve(directory, sample.src), bytes)
    verifyComparisonAudio(directory, { samples: [sample] })
    writeFileSync(resolve(directory, sample.src), Buffer.alloc(bytes.length))
    assert.throws(() => verifyComparisonAudio(directory, { samples: [sample] }), /integrity differs/)
    writeFileSync(resolve(directory, sample.src), bytes.subarray(1))
    assert.throws(() => verifyComparisonAudio(directory, { samples: [sample] }), /integrity differs/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
