/** Frozen owner-requested demo text (#250), using the shared contextual engine. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generationPlan } from './generate-elevenlabs-cards.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
export const SHORT_CONTEXT_SOURCE = 'demos/short-context-250/source/questions.json'
export const SHORT_CONTEXT_APPROVAL = 'demos/short-context-250/audio-text-approval.json'

export function loadShortContextAudition(root) {
  const bytes = readFileSync(resolve(root, SHORT_CONTEXT_SOURCE))
  const drafts = JSON.parse(bytes)
  const approval = JSON.parse(readFileSync(resolve(root, SHORT_CONTEXT_APPROVAL), 'utf8'))
  if (approval.schemaVersion !== 1 || approval.issue !== 250 || approval.source !== SHORT_CONTEXT_SOURCE ||
      approval.sourceFileSha256 !== hash(bytes) || approval.textSha256 !== hash(JSON.stringify(drafts)) ||
      !/^[a-f0-9]{40}$/.test(approval.sourceCommit ?? '') || !Number.isFinite(Date.parse(approval.recordedAt)) ||
      approval.evidence?.kind !== 'owner-conversation' ||
      approval.evidence.quote !== 'Ok, please document this in an issue, then generate audio for the contextual questions.' ||
      approval.evidenceUrl !== 'https://github.com/ajhconway/kikimashta/issues/250' ||
      drafts.length !== 10 || new Set(drafts.map(d => d.id)).size !== 10) {
    throw new Error('Short-context demo text approval differs from the frozen owner-requested text. Stop before generation.')
  }
  const config = JSON.parse(readFileSync(resolve(root, 'content/elevenlabs-voices.json'), 'utf8'))
  const voices = ['otani', 'morioki'].map(name => {
    const voice = config.voices.find(v => v.voice === name)
    if (!voice) throw new Error('Missing approved contextual voice: ' + name)
    return voice
  })
  const items = []
  const contexts = drafts.map(draft => {
    if (![draft.sentence, draft.kana, draft.english].every(v => typeof v === 'string' && v.trim()) ||
        (draft.question && ![draft.questionKana, draft.questionEnglish].every(v => typeof v === 'string' && v.trim())) ||
        !draft.choices.some(c => c.id === draft.correct)) throw new Error('Incomplete demo prompt: ' + draft.id)
    const id = `ja-short-demo-${draft.id}`
    const metadata = { contextId: id, contextRevision: 2, textApprovalSha256: approval.textSha256 }
    const sentence = { text: draft.sentence, reading: draft.kana, meaning: draft.english }
    items.push({ id: `${id}-sentence`, ...sentence, spelling: sentence.text, ...metadata, kind: 'sentence' })
    const questions = draft.question ? [{ id: `${id}-question`, revision: 2, kind: 'target',
      prompt: { text: draft.question, reading: draft.questionKana, meaning: draft.questionEnglish } }] : []
    for (const q of questions) items.push({ id: q.id, ...q.prompt, spelling: q.prompt.text,
      ...metadata, kind: 'question', questionRevision: q.revision })
    return { id, revision: 2, targetItemId: draft.id, sentence, questions,
      correctAnswer: draft.correct, correctMeaning: draft.choices.find(c => c.id === draft.correct).label }
  })
  const bank = { id: 'ja-short-context-demo-250-v2', language: 'ja-JP', contexts }
  return { bank, plan: { schemaVersion: 1, issue: 250, bankId: bank.id, approval, gapMs: 650,
    contexts: contexts.map(c => ({ id: c.id, revision: c.revision, targetItemId: c.targetItemId,
      sentenceItemId: `${c.id}-sentence`, questions: c.questions.map(q => ({ id: q.id, revision: q.revision,
        kind: q.kind, correctAnswer: c.correctAnswer, correctMeaning: c.correctMeaning })) })),
    generation: generationPlan(items, { ...config, voices, issue: 250 }) } }
}
