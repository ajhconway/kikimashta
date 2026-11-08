/** Prepare generated pilot media for unsaved dev review; never approves listening. */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { contextualTextDigest } from './contextual-audio-plan.mjs'
import { loadContextualPilot, projectRoot } from './validate-contextual.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const samePrompt = (left, right) => ['text', 'reading', 'meaning'].every(key => left[key] === right[key])

export function prepareContextualDeliveries({ root = projectRoot, review, delivery }) {
  const source = JSON.parse(readFileSync(resolve(root, review, 'review-provenance.json'), 'utf8'))
  assert(source.issue === 139 && source.contexts.length === 17 && source.samples.length === 68, 'Expected a complete expanded pilot batch')
  const stage = source.bankId === 'ja-contextual-simple-expansion-v1' ? 'simple' : 'contrastive'
  const bankPath = stage === 'simple' ? 'content/contextual/ja-simple-expansion.json' : 'content/contextual/ja-pilot.json'
  const { bank } = loadContextualPilot(root, bankPath)
  assert(source.bankId === bank.id && source.approval.textSha256 === contextualTextDigest(bank), 'Expanded media approval differs')
  assert(source.voices.length === 2 && source.voices.map(voice => voice.voice).join(',') === 'otani,morioki', 'Unexpected expanded voices')
  const accepted = JSON.parse(readFileSync(resolve(root, 'content/contextual/accepted-media.json'), 'utf8'))
  const output = resolve(root, 'content/contextual/generated-media.json')
  const previous = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : { schemaVersion: 1, contexts: [] }
  const entries = new Map(previous.contexts.map(context => [context.contextId, context]))
  const files = new Map()
  const ids = new Set()
  for (const authored of source.contexts) {
    assert(!ids.has(authored.id) && !accepted.contexts.some(context => context.contextId === authored.id), 'Duplicate or already accepted context')
    ids.add(authored.id)
    const context = bank.contexts.find(context => context.id === authored.id)
    assert(context?.review.text === 'approved' && context.revision === authored.revision && context.targetItemId === authored.targetItemId, 'Unapproved or mismatched context')
    const samples = source.samples.filter(sample => sample.contextId === context.id)
    assert(samples.length === 4, 'Missing expanded question/voice pairs')
    const recordings = source.voices.map(voice => {
      const copy = (item, itemId, publicId) => {
        const expected = `${voice.voice}/${itemId}.mp3`
        assert(item.normalizedFile === expected, 'Unexpected normalized source path')
        const bytes = readFileSync(resolve(root, delivery, expected))
        assert(hash(bytes) === item.deliverySha256, 'Expanded delivery hash mismatch')
        const src = `audio/contextual/${context.id}/${voice.voice}/${publicId}.mp3`
        const destination = resolve(root, 'public', src)
        assert(!existsSync(destination) || hash(readFileSync(destination)) === item.deliverySha256, 'Refusing to replace different contextual audio')
        files.set(destination, bytes)
        return { src, sha256: item.deliverySha256 }
      }
      const voiceSamples = samples.filter(sample => sample.voice === voice.voice)
      assert(voiceSamples.length === 2, 'Missing voice recordings')
      assert(voiceSamples.every(sample => samePrompt(sample.sentence, context.sentence) &&
        sample.contextRevision === context.revision && sample.targetItemId === context.targetItemId), 'Sentence identity differs')
      const sentence = copy(voiceSamples[0].sentence, context.id + '-sentence', 'sentence')
      const questionAssets = context.questions.map(question => {
        const matches = voiceSamples.filter(sample => sample.question.id === question.id)
        const sample = matches[0]
        const correct = question.options.find(option => option.id === question.correctOptionId)
        assert(matches.length === 1 && samePrompt(sample.question, question.prompt) && sample.question.revision === question.revision &&
          sample.question.kind === question.kind && sample.question.correctAnswer === correct.text && sample.question.correctMeaning === correct.meaning, 'Question identity differs')
        return [question.id, copy(sample.question, question.id, question.id)]
      })
      return { id: voice.voice + '-v1', voice: voice.voice, sentenceSrc: sentence.src,
        questionSrcs: Object.fromEntries(questionAssets.map(([id, asset]) => [id, asset.src])),
        hashes: { [sentence.src]: sentence.sha256, ...Object.fromEntries(questionAssets.map(([, asset]) => [asset.src, asset.sha256])) } }
    })
    const entry = { contextId: context.id, stage, contextRevision: context.revision, targetItemId: context.targetItemId,
      sentenceText: context.sentence.text, questions: Object.fromEntries(context.questions.map(question => [question.id, question.prompt.text])),
      questionRevisions: Object.fromEntries(context.questions.map(question => [question.id, question.revision])),
      textApprovalSha256: source.approval.textSha256, generationIdentity: source.generationIdentity, recordings }
    assert(!entries.has(context.id) || JSON.stringify(entries.get(context.id)) === JSON.stringify(entry), 'Saved expanded media differs')
    entries.set(context.id, entry)
  }
  for (const [destination, bytes] of files) {
    mkdirSync(dirname(destination), { recursive: true })
    if (!existsSync(destination)) writeFileSync(destination, bytes, { flag: 'wx' })
  }
  writeFileSync(output, JSON.stringify({ schemaVersion: 1, contexts: [...entries.values()] }, null, 2) + '\n')
  return { contexts: ids.size, clips: files.size, totalGeneratedContexts: entries.size, audioReview: 'pending' }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { review: { type: 'string' }, delivery: { type: 'string' } } })
    if (!values.review || !values.delivery) throw new Error('Choose --review verified previews and --delivery normalized audio')
    console.log(JSON.stringify(prepareContextualDeliveries(values), null, 2))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
