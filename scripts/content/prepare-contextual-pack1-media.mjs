/** Stage exact generated pack 1 audio for inspection; never records listening acceptance. (#197) */
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadContextualAudition } from './contextual-audio-plan.mjs'
import { CONTEXTUAL_AUDIO_PROFILE, verifyContextualAudioLevel } from './build-contextual-audio-review.mjs'
import { speechBody } from './audition-elevenlabs.mjs'
import { projectRoot } from './validate-contextual.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const sorted = value => Array.isArray(value) ? value.map(sorted) : value !== null && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
const promptMatches = (sample, prompt) => ['text', 'reading', 'meaning'].every(key => sample[key] === prompt[key])
const readJournal = path => readFileSync(path, 'utf8').split('\n').filter(line => line.trim()).map(JSON.parse)

function rejectSymlink(root, file) {
  let current = root
  for (const part of file.split('/')) {
    current = join(current, part)
    try { assert(!lstatSync(current).isSymbolicLink(), 'Pack 1 staging target contains a symlink.') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}

export function prepareContextualPack1Media({ root = projectRoot, review, delivery }) {
  const { bank, plan } = loadContextualAudition(root, { batch: 'pack1' })
  // Runtime binds the approval document itself; the generation engine's legacy
  // item field binds its inner canonical authored-text digest. Keep both explicit.
  const textApprovalSha256 = hash(readFileSync(resolve(root, 'content/contextual/pack-1/text-approval.json')))
  assert(typeof review === 'string' && review.trim() && typeof delivery === 'string' && delivery.trim(), 'Choose --review and --delivery.')
  const reviewBytes = readFileSync(resolve(root, review, 'review-provenance.json'))
  const source = JSON.parse(reviewBytes)
  const generationIdentity = hash(JSON.stringify(plan.generation))
  assert(source.schemaVersion === 1 && source.issue === 197 && source.bankId === bank.id &&
    same(source.approval, plan.approval) && source.generationIdentity === generationIdentity &&
    same(source.contexts, plan.contexts) && same(source.aliases, plan.aliases) &&
    same(source.voices, plan.generation.voices) && source.logicalRecordings === plan.logicalRecordings &&
    source.originalRecordings === plan.generation.expectedClips && source.samples.length === bank.contexts.length * 4 &&
    same(source.normalizationProfile, CONTEXTUAL_AUDIO_PROFILE),
  'Pack 1 review differs from the frozen approved generation plan.')
  const records = readJournal(resolve(root, delivery, 'deliveries.jsonl'))
  const originals = readJournal(resolve(root, source.input, 'originals.jsonl'))
  const byRecording = new Map(records.map(record => [`${record.voice}:${record.id}`, record]))
  const byOriginal = new Map(originals.map(record => [`${record.voice}:${record.id}`, record]))
  assert(records.length === plan.generation.expectedClips && byRecording.size === records.length &&
    originals.length === records.length && byOriginal.size === originals.length, 'Pack 1 normalized/original recording matrix is incomplete.')
  for (const voice of plan.generation.voices) for (const item of plan.generation.items) {
    const key = `${voice.voice}:${item.id}`, original = byOriginal.get(key), record = byRecording.get(key)
    assert(original && record && original.voiceId === voice.id && original.voiceName === voice.name &&
      original.model === plan.generation.model && original.planIdentity === generationIdentity &&
      original.file === `originals/${voice.voice}/${item.id}.mp3` && record.file === `${voice.voice}/${item.id}.mp3` &&
      same(original.request, speechBody(plan.generation, item.text)) &&
      Object.entries(item).every(([field, value]) => same(original[field], value)) &&
      record.originalFile === original.file && record.originalSha256 === original.sha256 &&
      record.sourceRecordSha256 === hash(JSON.stringify(sorted(original))) &&
      Object.entries(original).every(([field, value]) => field === 'file' || same(record[field], value)),
    'Pack 1 provider/normalization provenance differs.')
    const bytes = readFileSync(resolve(root, source.input, original.file))
    const sidecar = JSON.parse(readFileSync(resolve(root, source.input, `records/${voice.voice}-${item.id}.json`)))
    assert(bytes.length === original.bytes && hash(bytes) === original.sha256 && same(sidecar, original),
      'Pack 1 original bytes or sidecar differ.')
    verifyContextualAudioLevel(record, key)
  }
  const aliases = new Map(plan.aliases.map(alias => [alias.id, alias]))
  const items = new Map(plan.generation.items.map(item => [item.id, item]))
  const outputs = new Map()
  const seenSamples = new Set()
  const contexts = bank.contexts.map(context => {
    const planned = plan.contexts.find(entry => entry.id === context.id)
    const recordings = plan.generation.voices.map(voice => {
      const samples = source.samples.filter(sample => sample.contextId === context.id && sample.voice === voice.voice)
      assert(samples.length === context.questions.length && samples.every(sample => sample.voiceName === voice.name &&
        sample.contextRevision === context.revision && sample.targetItemId === context.targetItemId &&
        promptMatches(sample.sentence, context.sentence)), 'Pack 1 sentence/voice identity differs.')
      const copy = (part, logicalId, publicName) => {
        const alias = aliases.get(logicalId), canonical = items.get(alias?.itemId)
        assert(canonical && part.normalizedFile === `${voice.voice}/${canonical.id}.mp3` &&
          alias.text === part.text && alias.reading === part.reading,
        'Pack 1 speech alias does not match its exact approved text/reading.')
        const record = byRecording.get(`${voice.voice}:${canonical.id}`)
        assert(record && record.planIdentity === generationIdentity && record.voiceId === voice.id &&
          record.text === canonical.text && record.reading === canonical.reading &&
          record.originalSha256 === part.originalSha256 && record.deliverySha256 === part.deliverySha256 &&
          record.decodedFrames === part.decodedFrames && record.targetLimited === part.targetLimited &&
          same(record.limitingReasons, part.limitingReasons), 'Pack 1 normalized source identity differs.')
        const bytes = readFileSync(resolve(root, delivery, part.normalizedFile))
        assert(bytes.length === record.deliveryBytes && hash(bytes) === part.deliverySha256, 'Pack 1 delivery hash differs.')
        const src = `audio/contextual/${context.id}/${voice.voice}/${publicName}.mp3`
        outputs.set(`public/${src}`, bytes)
        return { src, sha256: part.deliverySha256 }
      }
      // A shared sentence must resolve to exactly the same source in both pairs.
      assert(samples.every(sample => same(sample.sentence, samples[0].sentence)), 'Pack 1 paired sentences differ.')
      const sentence = copy(samples[0].sentence, planned.authoredSentenceItemId, 'sentence')
      const questions = context.questions.map(question => {
        const matching = samples.filter(sample => sample.question.id === question.id)
        assert(matching.length === 1, 'Pack 1 logical question identity is missing or duplicated.')
        const sample = matching[0], correct = question.options.find(option => option.id === question.correctOptionId)
        const key = `${voice.voice}:${question.id}`
        assert(!seenSamples.has(key) && promptMatches(sample.question, question.prompt) &&
          sample.question.revision === question.revision && sample.question.kind === question.kind &&
          sample.question.itemId === aliases.get(question.id)?.itemId &&
          sample.question.correctAnswer === correct.text && sample.question.correctMeaning === correct.meaning,
        'Pack 1 logical question text/revision/answer differs.')
        assert(sample.src === `samples/${voice.voice}-${question.id}.wav`, 'Pack 1 review sample path differs.')
        const preview = readFileSync(resolve(root, review, sample.src))
        assert(preview.length === sample.bytes && hash(preview) === sample.sha256,
          'Pack 1 listening preview hash differs.')
        seenSamples.add(key)
        return [question.id, copy(sample.question, question.id, question.id)]
      })
      return { id: `${voice.voice}-v1`, voice: voice.voice, sentenceSrc: sentence.src,
        questionSrcs: Object.fromEntries(questions.map(([id, asset]) => [id, asset.src])),
        hashes: { [sentence.src]: sentence.sha256, ...Object.fromEntries(questions.map(([, asset]) => [asset.src, asset.sha256])) } }
    })
    return { contextId: context.id, stage: context.stage, contextRevision: context.revision, targetItemId: context.targetItemId,
      sentenceText: context.sentence.text, questions: Object.fromEntries(context.questions.map(question => [question.id, question.prompt.text])),
      questionRevisions: Object.fromEntries(context.questions.map(question => [question.id, question.revision])),
      textApprovalSha256, authoredTextSha256: plan.approval.textSha256, generationIdentity, recordings }
  })
  assert(seenSamples.size === 464 && outputs.size === plan.logicalRecordings, 'Pack 1 logical delivery matrix is incomplete.')
  const provenance = { schemaVersion: 1, issue: 197, bankId: bank.id, language: bank.language,
    approval: plan.approval, generationIdentity, generation: plan.generation, aliases: plan.aliases,
    logicalRecordings: plan.logicalRecordings, reviewProvenanceSha256: hash(reviewBytes),
    normalizationProfile: source.normalizationProfile,
    recordings: records.sort((a, b) => `${a.voice}:${a.id}`.localeCompare(`${b.voice}:${b.id}`, 'en')),
    audioReview: 'pending' }
  const provenanceBytes = Buffer.from(JSON.stringify(provenance, null, 2) + '\n')
  const manifest = { schemaVersion: 1, bankId: bank.id, language: bank.language,
    textApprovalSha256, authoredTextSha256: plan.approval.textSha256, sourceFileSha256: plan.approval.sourceFileSha256,
    generationIdentity, reviewProvenanceSha256: hash(reviewBytes), audioProvenanceSha256: hash(provenanceBytes),
    audioReview: 'pending', contexts }
  outputs.set('content/contextual/pack-1/audio-provenance.json', provenanceBytes)
  outputs.set('content/contextual/pack-1/generated-media.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'))
  // Check every byte and destination before staging any of the matrix.
  for (const [file, bytes] of outputs) {
    rejectSymlink(root, file)
    assert(!existsSync(resolve(root, file)) || hash(readFileSync(resolve(root, file))) === hash(bytes),
      'Refusing to replace different pack 1 media or provenance.')
  }
  for (const [file, bytes] of outputs) {
    const destination = resolve(root, file)
    mkdirSync(dirname(destination), { recursive: true })
    if (!existsSync(destination)) writeFileSync(destination, bytes, { flag: 'wx' })
  }
  return { contexts: contexts.length, logicalRecordings: plan.logicalRecordings,
    uniqueRecordings: records.length, reusedAliasRecordings: plan.logicalRecordings - records.length,
    generatedMediaSha256: hash(outputs.get('content/contextual/pack-1/generated-media.json')),
    targetLimited: records.filter(record => record.targetLimited).length, audioReview: 'pending' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { review: { type: 'string' }, delivery: { type: 'string' } } })
    console.log(JSON.stringify(prepareContextualPack1Media(values), null, 2))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
