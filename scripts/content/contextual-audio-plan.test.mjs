import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contextualAuditionPlan, contextualTextDigest, loadContextualAudition, validateContextualTextApproval } from './contextual-audio-plan.mjs'
import { projectRoot } from './validate-contextual.mjs'

function fixture() {
  const { bank } = loadContextualAudition()
  const read = path => JSON.parse(readFileSync(resolve(projectRoot, path), 'utf8'))
  return { bank: structuredClone(bank), approval: read('content/contextual/text-approval.json'), config: read('content/elevenlabs-voices.json') }
}

test('the approved sample is bounded to three contexts, two named voices and eighteen exact Japanese requests', () => {
  const { plan } = loadContextualAudition()
  assert.equal(plan.issue, 124)
  assert.equal(plan.contexts.length, 3)
  assert.equal(plan.generation.items.length, 9)
  assert.equal(plan.generation.expectedClips, 18)
  assert.equal(plan.generation.issue, 124)
  assert.deepEqual(plan.generation.voices.map(voice => voice.name), ['Otani', 'Morioki'])
  assert.equal(plan.gapMs, 650)
  for (const item of plan.generation.items) {
    assert.equal(item.textApprovalSha256, plan.approval.textSha256)
    assert.ok(plan.contexts.some(context => context.id === item.contextId))
    assert.match(item.text, /[。？?]$/u)
  }
  for (const context of plan.contexts) {
    assert.ok(plan.generation.items.some(item => item.id === context.sentenceItemId && item.kind === 'sentence'))
    assert.deepEqual(context.questions.map(question => question.kind), ['target', 'detail'])
  }
})

test('changing sentence, question, choice, grammar or revision invalidates text approval', () => {
  const edits = [
    bank => { bank.contexts[0].sentence.text += '変更'; },
    bank => { bank.contexts[0].questions[0].prompt.reading += 'へんこう'; },
    bank => { bank.contexts[0].questions[0].correctOptionId = bank.contexts[0].questions[0].options[1].id; },
    bank => { bank.contexts[0].questions[0].options[0].meaning = 'A different answer'; },
    bank => { bank.grammarPoints[0].genkiLesson = 12; },
    bank => { bank.contexts[0].revision += 1; },
  ]
  for (const edit of edits) {
    const { bank, approval } = fixture()
    edit(bank)
    assert.throws(() => validateContextualTextApproval(bank, approval), /approval/)
  }
})

test('review state is separate from the text digest and pending text still blocks generation', () => {
  const { bank, approval, config } = fixture()
  const digest = contextualTextDigest(bank)
  bank.contexts[0].review.text = 'pending'
  assert.equal(contextualTextDigest(bank), digest)
  assert.throws(() => contextualAuditionPlan({ bank, approval, config }), /approval/)
  bank.contexts[0].review.text = 'approved'
  bank.contexts[0].recordings = [{ id: 'later-recording' }]
  assert.equal(contextualTextDigest(bank), digest)
})

test('missing approval, a different bank, or a missing approved voice fails before a plan is offered', () => {
  const { bank, approval, config } = fixture()
  assert.throws(() => contextualAuditionPlan({ bank, approval: null, config }), /approval/)
  assert.throws(() => contextualAuditionPlan({ bank, approval: { ...approval, bankId: 'different-bank' }, config }), /approval/)
  assert.throws(() => contextualAuditionPlan({ bank, approval, config: { ...config, voices: config.voices.filter(voice => voice.voice !== 'otani') } }), /Missing approved audition voice/)
})
