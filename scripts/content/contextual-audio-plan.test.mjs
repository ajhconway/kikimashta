import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AUDIO_CONTEXT_IDS, EXPANSION_CONTEXT_IDS, auditionProfile, contextualAuditionPlan, contextualTextDigest, loadContextualAudition, validateContextualTextApproval } from './contextual-audio-plan.mjs'
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
  assert.equal(createHash('sha256').update(JSON.stringify(plan.generation)).digest('hex'),
    '37b0958502d32d36d2968b02fe512633c7a6703f8d5189163222472abf7fcd1a')
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

test('simple sample uses its own approved text and bounded identities while stages cannot share approval', () => {
  const { bank, plan } = loadContextualAudition(projectRoot, { stage: 'simple' })
  const original = loadContextualAudition()
  assert.equal(plan.issue, 136)
  assert.equal(plan.generation.issue, 136)
  assert.equal(plan.bankId, 'ja-contextual-simple-pilot-v1')
  assert.equal(plan.generation.expectedClips, 18)
  assert.equal(plan.generation.characters, 214)
  assert.equal(plan.generation.items.length, 9)
  assert.equal(plan.contexts.length, 3)
  assert.equal(createHash('sha256').update(JSON.stringify(plan.generation)).digest('hex'),
    'dfc85cfe8abbb7f489520bd9acd81f6a3008f00343274bb6a667caaa0ea4dd83')
  assert.deepEqual(plan.generation.voices.map(voice => voice.name), ['Otani', 'Morioki'])
  assert.ok(plan.contexts.every(context => context.id.startsWith('ja-ctx-simple-')))
  assert.ok(plan.generation.items.every(item => item.textApprovalSha256 === plan.approval.textSha256))
  assert.throws(() => validateContextualTextApproval(bank, plan.approval), /approval/)
  assert.throws(() => validateContextualTextApproval(original.bank, original.plan.approval, { stage: 'simple' }), /approval/)
  bank.contexts[0].questions[0].prompt.text += '変更'
  assert.throws(() => validateContextualTextApproval(bank, plan.approval, { stage: 'simple' }), /approval/)
  assert.throws(() => loadContextualAudition(projectRoot, { stage: 'unknown' }), /stage/)
})

for (const stage of ['simple', 'contrastive']) {
  test(stage + ' expansion selects only its seventeen remaining contexts and preserves exact request metadata', () => {
    const { bank, plan } = loadContextualAudition(projectRoot, { stage, batch: 'expansion' })
    const sample = loadContextualAudition(projectRoot, { stage }).plan
    const sampleIds = new Set(sample.contexts.map(context => context.id))
    const expectedIds = EXPANSION_CONTEXT_IDS.map(id => stage === 'simple' ? id.replace('ja-ctx-', 'ja-ctx-simple-') : id)
    assert.deepEqual(plan.contexts.map(context => context.id), expectedIds)
    assert.equal(plan.contexts.length, 17)
    assert.equal(new Set(plan.contexts.map(context => context.id)).size, 17)
    assert.ok(plan.contexts.every(context => !sampleIds.has(context.id)))
    assert.equal(plan.issue, 139)
    assert.equal(plan.generation.issue, 139)
    assert.equal(plan.generation.expectedClips, 102)
    assert.equal(plan.generation.items.length, 51)
    assert.equal(plan.generation.characters, stage === 'simple' ? 1324 : 1672)
    assert.deepEqual(plan.generation.voices.map(voice => voice.name), ['Otani', 'Morioki'])
    assert.equal(plan.gapMs, 650)
    for (const context of plan.contexts) {
      const authored = bank.contexts.find(entry => entry.id === context.id)
      assert.deepEqual(context.questions.map(question => question.kind), ['target', 'detail'])
      const sentence = plan.generation.items.find(item => item.id === context.sentenceItemId)
      assert.equal(sentence.text, authored.sentence.text)
      assert.equal(sentence.contextRevision, authored.revision)
      for (const question of context.questions) {
        const request = plan.generation.items.find(item => item.id === question.id)
        assert.equal(request.contextId, context.id)
        assert.equal(request.questionRevision, question.revision)
        assert.equal(request.textApprovalSha256, plan.approval.textSha256)
        assert.equal(request.text, authored.questions.find(entry => entry.id === question.id).prompt.text)
      }
    }
    assert.ok(AUDIO_CONTEXT_IDS.every(id => !EXPANSION_CONTEXT_IDS.includes(id)))
  })
}

test('the simple expansion requires its own actual text approval rather than a sample or another stage approval', () => {
  const expansion = loadContextualAudition(projectRoot, { stage: 'simple', batch: 'expansion' })
  const sample = loadContextualAudition(projectRoot, { stage: 'simple' })
  const contrastive = loadContextualAudition(projectRoot, { stage: 'contrastive', batch: 'expansion' })
  const options = { stage: 'simple', batch: 'expansion' }
  assert.equal(validateContextualTextApproval(expansion.bank, expansion.plan.approval, options), expansion.plan.approval)
  assert.throws(() => validateContextualTextApproval(expansion.bank, sample.plan.approval, options), /approval/)
  assert.throws(() => validateContextualTextApproval(sample.bank, sample.plan.approval, options), /approval/)
  assert.throws(() => validateContextualTextApproval(expansion.bank, expansion.plan.approval, { stage: 'simple' }), /approval/)
  assert.throws(() => validateContextualTextApproval(expansion.bank, contrastive.plan.approval, options), /approval/)
  assert.throws(() => validateContextualTextApproval(contrastive.bank, expansion.plan.approval, { stage: 'contrastive', batch: 'expansion' }), /approval/)
  expansion.bank.contexts[0].questions[0].prompt.text += '変更'
  assert.throws(() => validateContextualTextApproval(expansion.bank, expansion.plan.approval, options), /approval/)
  assert.throws(() => auditionProfile('simple', 'all'), /batch/)
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
