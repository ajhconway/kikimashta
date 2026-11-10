/** Exact text-approval gate and bounded audio selection for #124. No paid calls. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generationPlan } from './generate-elevenlabs-cards.mjs'
import { loadContextualPilot, projectRoot } from './validate-contextual.mjs'
import { validateContextualBank } from '../../src/content/contextual.ts'
import { withAnswerVocabulary } from '../../src/content/contextual-answers.ts'
import { loadShortContextAudition } from './short-context-audio-plan.mjs'

export const AUDIO_CONTEXT_IDS = ['ja-ctx-ue-01', 'ja-ctx-mizu-01', 'ja-ctx-hashiru-01']
export const AUDIO_VOICES = ['otani', 'morioki']
export const GAP_MS = 650
/** The remaining reviewed counterparts, excluding every already-recorded sample context. */
export const EXPANSION_CONTEXT_IDS = [
  'ja-ctx-ue-02', 'ja-ctx-shita-01', 'ja-ctx-shita-02',
  'ja-ctx-ookii-01', 'ja-ctx-ookii-02', 'ja-ctx-chiisai-01', 'ja-ctx-chiisai-02',
  'ja-ctx-hon-01', 'ja-ctx-hon-02', 'ja-ctx-mizu-02',
  'ja-ctx-koohii-01', 'ja-ctx-koohii-02', 'ja-ctx-kuruma-01', 'ja-ctx-kuruma-02',
  'ja-ctx-sensei-01', 'ja-ctx-sensei-02', 'ja-ctx-hashiru-02',
]
export function auditionProfile(stage = 'contrastive', batch = 'sample') {
  if (batch === 'pack1') return {
    bankPath: 'content/contextual/ja-wanikani-1-draft.json', bankId: 'ja-contextual-wanikani-1-draft-v1',
    approvalPath: 'content/contextual/pack-1/text-approval.json', issue: 197,
    evidenceUrl: 'https://github.com/ajhconway/kikimashta/pull/186#issuecomment-6732303270',
    expectedContexts: 116,
  }
  if (batch !== 'sample' && batch !== 'expansion') throw new Error('Choose contextual batch sample or expansion.')
  if (stage === 'simple' && batch === 'expansion') return {
    bankPath: 'content/contextual/ja-simple-expansion.json', bankId: 'ja-contextual-simple-expansion-v1',
    approvalPath: 'content/contextual/expansion-text-approval.json', issue: 139,
    contextIds: EXPANSION_CONTEXT_IDS.map(id => id.replace('ja-ctx-', 'ja-ctx-simple-')),
    evidenceUrl: 'https://github.com/ajhconway/kikimashta/issues/139#issuecomment-6725981021',
  }
  if (stage === 'contrastive') return {
    bankPath: 'content/contextual/ja-pilot.json', bankId: 'ja-contextual-pilot-v1',
    approvalPath: 'content/contextual/text-approval.json',
    contextIds: batch === 'sample' ? AUDIO_CONTEXT_IDS : EXPANSION_CONTEXT_IDS,
    issue: batch === 'sample' ? 124 : 139,
    evidenceUrl: 'https://github.com/ajhconway/kikimashta/issues/119#issuecomment-6723994903',
  }
  if (stage === 'simple') return {
    bankPath: 'content/contextual/ja-simple-pilot.json', bankId: 'ja-contextual-simple-pilot-v1',
    approvalPath: 'content/contextual/simple-text-approval.json', issue: 136,
    contextIds: ['ja-ctx-simple-ue-01', 'ja-ctx-simple-mizu-01', 'ja-ctx-simple-hashiru-01'],
    evidenceUrl: 'https://github.com/ajhconway/kikimashta/issues/133#issuecomment-6725544228',
  }
  throw new Error('Choose contextual stage simple or contrastive.')
}
const hash = value => createHash('sha256').update(value).digest('hex')

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}

/** Review/audio state and generated recordings can change without changing approved text. */
export function contextualTextDigest(bank) {
  const authored = { ...bank, contexts: bank.contexts.map(context => Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== 'review' && key !== 'recordings'),
  )) }
  return hash(JSON.stringify(canonical(authored)))
}

export function validateContextualTextApproval(bank, approval, { stage = 'contrastive', batch = 'sample' } = {}) {
  const profile = auditionProfile(stage, batch)
  if (approval?.schemaVersion !== 1 || bank.id !== profile.bankId || approval.bankId !== bank.id || approval.language !== bank.language ||
      !/^[a-f0-9]{40}$/.test(approval.sourceCommit ?? '') || !/^[a-f0-9]{64}$/.test(approval.sourceFileSha256 ?? '') ||
      approval.textSha256 !== contextualTextDigest(bank) || !Number.isFinite(Date.parse(approval.recordedAt)) ||
      approval.evidenceUrl !== profile.evidenceUrl ||
      bank.contexts.some(context => batch === 'pack1' ? context.review.text === 'rejected' : context.review.text !== 'approved') ||
      (batch === 'pack1' && (bank.contexts.length !== profile.expectedContexts ||
        approval.evidence?.kind !== 'owner-conversation' || !approval.evidence.quote?.trim()))) {
    throw new Error('Actual pilot text approval is missing or differs from the reviewed text. Stop before generation.')
  }
  return approval
}

export function contextualAuditionPlan({ bank, approval, config, stage = 'contrastive', batch = 'sample' }) {
  const profile = auditionProfile(stage, batch)
  validateContextualTextApproval(bank, approval, { stage, batch })
  const voices = AUDIO_VOICES.map(name => {
    const voice = config.voices.find(voice => voice.voice === name)
    if (!voice) throw new Error('Missing approved audition voice: ' + name)
    return voice
  })
  const items = []
  const contexts = (profile.contextIds ?? bank.contexts.map(context => context.id)).map(id => {
    const context = bank.contexts.find(context => context.id === id)
    if (!context || context.questions.length !== 2) throw new Error('Expected a reviewed sentence and its two questions: ' + id)
    const sentenceItemId = `${context.id}-sentence`
    const metadata = { contextId: context.id, contextRevision: context.revision, textApprovalSha256: approval.textSha256 }
    items.push({ id: sentenceItemId, text: context.sentence.text, spelling: context.sentence.text,
      meaning: context.sentence.meaning, ...metadata, kind: 'sentence',
      ...(batch === 'pack1' ? { reading: context.sentence.reading } : {}) })
    const questions = context.questions.map(question => {
      items.push({ id: question.id, text: question.prompt.text, spelling: question.prompt.text,
        meaning: question.prompt.meaning, ...metadata, kind: 'question', questionRevision: question.revision,
        ...(batch === 'pack1' ? { reading: question.prompt.reading } : {}) })
      const correct = question.options.find(option => option.id === question.correctOptionId)
      return { id: question.id, revision: question.revision, kind: question.kind,
        correctAnswer: correct.text, correctMeaning: correct.meaning }
    })
    return { id: context.id, revision: context.revision, targetItemId: context.targetItemId, sentenceItemId, questions,
      ...(batch === 'pack1' ? { stage: context.stage } : {}) }
  })
  if (batch === 'pack1') {
    // Record every logical utterance explicitly; reuse only byte-identical
    // request text with the same approved reading under this fixed voice plan.
    const canonical = new Map()
    const aliases = items.map(item => {
      const key = JSON.stringify([item.text, item.reading])
      if (!canonical.has(key)) canonical.set(key, item)
      return { id: item.id, itemId: canonical.get(key).id, contextId: item.contextId,
        kind: item.kind, text: item.text, reading: item.reading }
    })
    const byId = new Map(aliases.map(alias => [alias.id, alias.itemId]))
    const paired = contexts.map(context => ({ ...context,
      authoredSentenceItemId: context.sentenceItemId, sentenceItemId: byId.get(context.sentenceItemId),
      questions: context.questions.map(question => ({ ...question, itemId: byId.get(question.id) })) }))
    return { schemaVersion: 1, issue: profile.issue, bankId: bank.id, approval, gapMs: GAP_MS,
      contexts: paired, aliases, logicalRecordings: items.length * voices.length,
      generation: generationPlan([...canonical.values()], { ...config, voices, issue: profile.issue }) }
  }
  return { schemaVersion: 1, issue: profile.issue, bankId: bank.id, approval, gapMs: GAP_MS, contexts,
    generation: generationPlan(items, { ...config, voices, issue: profile.issue }) }
}

export function loadContextualAudition(root = projectRoot, { stage = 'contrastive', batch = 'sample' } = {}) {
  if (batch === 'short-demo-250') return loadShortContextAudition(root)
  const profile = auditionProfile(stage, batch)
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
  const approval = read(profile.approvalPath)
  const config = read('content/elevenlabs-voices.json')
  if (batch === 'pack1') {
    const bytes = readFileSync(resolve(root, profile.bankPath))
    if (hash(bytes) !== approval.sourceFileSha256) throw new Error('Frozen pack 1 source hash differs from text approval. Stop before generation.')
    const bank = JSON.parse(bytes)
    validateContextualTextApproval(bank, approval, { stage, batch })
    const overrides = read('content/catalog/review-overrides.json')
    const extra = read('content/contextual/answer-vocabulary.json')
    if (extra.schemaVersion !== 1 || extra.language !== bank.language) throw new Error('Invalid contextual answer vocabulary.')
    const vocabulary = withAnswerVocabulary(read('content/catalog/ja.json').items.map(item => ({ ...item, ...overrides[item.id] })), extra.items)
    // Authoring validation permits the explicitly approved draft targets;
    // this does not change ordinary practice admission or media acceptance.
    validateContextualBank(bank, { vocabulary,
      eligibleTargetIds: new Set(bank.contexts.map(context => context.targetItemId)),
      imageExists: src => existsSync(resolve(root, 'public', src)),
      audioExists: src => existsSync(resolve(root, 'public', src)) })
    return { bank, plan: contextualAuditionPlan({ bank, approval, config, stage, batch }) }
  }
  const { bank } = loadContextualPilot(root, profile.bankPath)
  return { bank, plan: contextualAuditionPlan({ bank, approval, config, stage, batch }) }
}
