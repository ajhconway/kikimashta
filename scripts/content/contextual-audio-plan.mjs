/** Exact text-approval gate and bounded audio selection for #124. No paid calls. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generationPlan } from './generate-elevenlabs-cards.mjs'
import { loadContextualPilot, projectRoot } from './validate-contextual.mjs'

export const AUDIO_CONTEXT_IDS = ['ja-ctx-ue-01', 'ja-ctx-mizu-01', 'ja-ctx-hashiru-01']
export const AUDIO_VOICES = ['otani', 'morioki']
export const GAP_MS = 650
export function auditionProfile(stage = 'contrastive') {
  if (stage === 'contrastive') return {
    bankPath: 'content/contextual/ja-pilot.json', bankId: 'ja-contextual-pilot-v1',
    approvalPath: 'content/contextual/text-approval.json', contextIds: AUDIO_CONTEXT_IDS, issue: 124,
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

export function validateContextualTextApproval(bank, approval, { stage = 'contrastive' } = {}) {
  const profile = auditionProfile(stage)
  if (approval?.schemaVersion !== 1 || bank.id !== profile.bankId || approval.bankId !== bank.id || approval.language !== bank.language ||
      !/^[a-f0-9]{40}$/.test(approval.sourceCommit ?? '') || !/^[a-f0-9]{64}$/.test(approval.sourceFileSha256 ?? '') ||
      approval.textSha256 !== contextualTextDigest(bank) || !Number.isFinite(Date.parse(approval.recordedAt)) ||
      approval.evidenceUrl !== profile.evidenceUrl ||
      bank.contexts.some(context => context.review.text !== 'approved')) {
    throw new Error('Actual pilot text approval is missing or differs from the reviewed text. Stop before generation.')
  }
  return approval
}

export function contextualAuditionPlan({ bank, approval, config, stage = 'contrastive' }) {
  const profile = auditionProfile(stage)
  validateContextualTextApproval(bank, approval, { stage })
  const voices = AUDIO_VOICES.map(name => {
    const voice = config.voices.find(voice => voice.voice === name)
    if (!voice) throw new Error('Missing approved audition voice: ' + name)
    return voice
  })
  const items = []
  const contexts = profile.contextIds.map(id => {
    const context = bank.contexts.find(context => context.id === id)
    if (!context || context.questions.length !== 2) throw new Error('Expected a reviewed sentence and its two questions: ' + id)
    const sentenceItemId = `${context.id}-sentence`
    const metadata = { contextId: context.id, contextRevision: context.revision, textApprovalSha256: approval.textSha256 }
    items.push({ id: sentenceItemId, text: context.sentence.text, spelling: context.sentence.text,
      meaning: context.sentence.meaning, ...metadata, kind: 'sentence' })
    const questions = context.questions.map(question => {
      items.push({ id: question.id, text: question.prompt.text, spelling: question.prompt.text,
        meaning: question.prompt.meaning, ...metadata, kind: 'question', questionRevision: question.revision })
      const correct = question.options.find(option => option.id === question.correctOptionId)
      return { id: question.id, revision: question.revision, kind: question.kind,
        correctAnswer: correct.text, correctMeaning: correct.meaning }
    })
    return { id: context.id, revision: context.revision, targetItemId: context.targetItemId, sentenceItemId, questions }
  })
  return { schemaVersion: 1, issue: profile.issue, bankId: bank.id, approval, gapMs: GAP_MS, contexts,
    generation: generationPlan(items, { ...config, voices, issue: profile.issue }) }
}

export function loadContextualAudition(root = projectRoot, { stage = 'contrastive' } = {}) {
  const profile = auditionProfile(stage)
  const { bank } = loadContextualPilot(root, profile.bankPath)
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
  const approval = read(profile.approvalPath)
  const config = read('content/elevenlabs-voices.json')
  return { bank, plan: contextualAuditionPlan({ bank, approval, config, stage }) }
}
