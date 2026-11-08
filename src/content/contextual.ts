import type {
  ContextualAnswerFormat, ContextualBank, ContextualItem, ContextualPrompt,
  ContextualQuestion, ContextualVocabularyReference,
} from './contextual-types'

export interface ContextualReferences {
  vocabulary: readonly ContextualVocabularyReference[]
  eligibleTargetIds: ReadonlySet<string>
  imageExists: (src: string) => boolean
  audioExists: (src: string) => boolean
}

function check(condition: unknown, path: string, message: string): asserts condition {
  if (!condition) throw new Error(`${path}: ${message}`)
}

function object(value: unknown, path: string): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'expected an object')
  return value as Record<string, unknown>
}

function list(value: unknown, path: string): unknown[] {
  check(Array.isArray(value), path, 'expected an array')
  return value
}

function string(value: unknown, path: string): string {
  check(typeof value === 'string' && value.trim().length > 0, path, 'expected nonempty text')
  return value
}

function id(value: unknown, path: string): string {
  const result = string(value, path)
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result), path, 'expected a stable kebab-case ID')
  return result
}

function revision(value: unknown, path: string) {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value >= 1, path, 'expected a positive integer revision')
}

function unique(values: readonly string[], path: string) {
  check(new Set(values).size === values.length, path, 'duplicate entries')
}

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase()
}

function normalizedReading(value: string): string {
  return normalized(value).replace(/[ァ-ヶ]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0x60))
}

function references(value: unknown, known: ReadonlySet<string>, path: string) {
  const values = list(value, path).map((entry, index) => id(entry, `${path}[${index}]`))
  unique(values, path)
  for (const entry of values) check(known.has(entry), path, `unknown reference ${entry}`)
}

/** Media paths stay relative to public/ and cannot navigate or fetch external resources. */
export function contextualMediaPath(value: unknown, family: 'images' | 'audio'): string {
  const src = string(value, `${family} path`)
  const extension = family === 'images' ? /\.(svg|png|jpe?g|webp)$/i : /\.mp3$/i
  check(src.startsWith(`${family}/`) && !/[\\%?#:]/u.test(src) &&
    !src.split('/').some(part => !part || part === '.' || part === '..') && extension.test(src),
  `${family} path`, 'unsafe or unsupported media path')
  return src
}

/** Structural checks supplement owner review of Japanese, meaning and picture semantics. */
export function validateContextualBank(input: unknown, refs: ContextualReferences): ContextualBank {
  const bank = object(input, 'bank')
  check(bank.schemaVersion === 1, 'bank.schemaVersion', 'unsupported schema version')
  id(bank.id, 'bank.id')
  const language = string(bank.language, 'bank.language')
  check(language === 'ja-JP' && bank.grammarProfile === 'genki-1', 'bank.grammarProfile', 'the pilot uses Japanese and Genki I')
  check(bank.grammarReference === 'https://bookclub2.japantimes.co.jp/download/files/genki3/genki-3rd_syllabus_E.pdf',
    'bank.grammarReference', 'expected the official Genki syllabus reference')

  const grammarIds = list(bank.grammarPoints, 'bank.grammarPoints').map((value, index) => {
    const path = `bank.grammarPoints[${index}]`
    const point = object(value, path)
    string(point.label, `${path}.label`)
    check(typeof point.genkiLesson === 'number' && Number.isInteger(point.genkiLesson) &&
      point.genkiLesson >= 1 && point.genkiLesson <= 12, path, 'grammar must be within Genki I lessons 1–12')
    return id(point.id, `${path}.id`)
  })
  unique(grammarIds, 'bank.grammarPoints')
  const grammar = new Set(grammarIds)
  const vocabularyIds = list(bank.supportingVocabulary, 'bank.supportingVocabulary').map((value, index) => {
    const path = `bank.supportingVocabulary[${index}]`
    const word = object(value, path)
    for (const field of ['text', 'reading', 'meaning']) string(word[field], `${path}.${field}`)
    return id(word.id, `${path}.id`)
  })
  unique(vocabularyIds, 'bank.supportingVocabulary')
  const supportingVocabulary = new Set(vocabularyIds)
  const byId = new Map(refs.vocabulary.map(word => [word.id, word]))
  check(byId.size === refs.vocabulary.length, 'references.vocabulary', 'duplicate vocabulary IDs')
  const knownVocabulary = (value: unknown, path: string) => {
    const word = byId.get(id(value, path))
    check(word && !word.removalReason && (!word.language || word.language === language), path, 'unknown, removed or wrong-language vocabulary')
    return word
  }
  const prompt = (value: unknown, path: string): ContextualPrompt => {
    const item = object(value, path)
    for (const field of ['text', 'reading', 'meaning']) string(item[field], `${path}.${field}`)
    check(!/\p{Script=Han}/u.test(item.reading as string), `${path}.reading`, 'readings must spell out kanji')
    references(item.grammarTags, grammar, `${path}.grammarTags`)
    references(item.supportingVocabularyIds, supportingVocabulary, `${path}.supportingVocabularyIds`)
    return item as unknown as ContextualPrompt
  }

  const contextIds: string[] = []
  const questionIds: string[] = []
  const contexts = list(bank.contexts, 'bank.contexts')
  check(contexts.length > 0, 'bank.contexts', 'expected at least one authored context')
  contexts.forEach((value, index) => {
    const path = `bank.contexts[${index}]`
    const context = object(value, path)
    contextIds.push(id(context.id, `${path}.id`))
    revision(context.revision, `${path}.revision`)
    const target = knownVocabulary(context.targetItemId, `${path}.targetItemId`)
    check(refs.eligibleTargetIds.has(target.id), `${path}.targetItemId`, 'target is outside the approved practice pool')
    const sentence = prompt(context.sentence, `${path}.sentence`)
    const occurrence = object(context.targetOccurrence, `${path}.targetOccurrence`)
    const surface = string(occurrence.surface, `${path}.targetOccurrence.surface`)
    const reading = string(occurrence.reading, `${path}.targetOccurrence.reading`)
    check(sentence.text.includes(surface), path, 'target surface is absent from the sentence')
    check(normalizedReading(sentence.reading).includes(normalizedReading(reading)), path, 'target reading is absent from the sentence reading')
    string(context.reviewNotes, `${path}.reviewNotes`)
    const review = object(context.review, `${path}.review`)
    check(['pending', 'approved', 'rejected'].includes(review.text as string), path, 'invalid text review state')
    check(['not-generated', 'pending', 'approved', 'rejected'].includes(review.audio as string), path, 'invalid audio review state')

    const questions = list(context.questions, `${path}.questions`)
    check(questions.length > 0, path, 'expected at least one question')
    const localQuestionIds: string[] = []
    questions.forEach((value, index) => {
      const qPath = `${path}.questions[${index}]`
      const question = object(value, qPath)
      const questionId = id(question.id, `${qPath}.id`)
      questionIds.push(questionId)
      localQuestionIds.push(questionId)
      revision(question.revision, `${qPath}.revision`)
      check(question.kind === 'target' || question.kind === 'detail', qPath, 'unknown question kind')
      prompt(question.prompt, `${qPath}.prompt`)
      string(question.explanation, `${qPath}.explanation`)
      const formats = list(question.formats, `${qPath}.formats`).map((format, index) => string(format, `${qPath}.formats[${index}]`))
      check(formats.length > 0 && formats.every(format => format === 'picture' || format === 'text'), qPath, 'unknown or missing answer format')
      unique(formats, `${qPath}.formats`)
      const options = list(question.options, `${qPath}.options`)
      check(options.length >= 2, qPath, 'expected at least two choices')
      const optionIds: string[] = []
      const writings: string[] = []
      const readings: string[] = []
      const meanings: string[] = []
      const images: string[] = []
      const concepts: string[] = []
      for (const [index, value] of options.entries()) {
        const oPath = `${qPath}.options[${index}]`
        const option = object(value, oPath)
        optionIds.push(id(option.id, `${oPath}.id`))
        const answer = prompt(option, oPath)
        writings.push(normalized(answer.text))
        readings.push(normalizedReading(answer.reading))
        meanings.push(normalized(answer.meaning))
        if (option.vocabularyItemId !== undefined) concepts.push(knownVocabulary(option.vocabularyItemId, `${oPath}.vocabularyItemId`).id)
        if (option.imageItemId !== undefined) {
          const imageWord = knownVocabulary(option.imageItemId, `${oPath}.imageItemId`)
          const src = contextualMediaPath(imageWord.image.src, 'images')
          string(imageWord.image.alt, `${oPath}.image.alt`)
          check(refs.imageExists(src), oPath, `missing picture ${src}`)
          images.push(src)
        } else check(!formats.includes('picture'), oPath, 'picture format requires an image for every choice')
      }
      unique(optionIds, `${qPath}.options IDs`)
      unique(writings, `${qPath}.options writing`)
      unique(readings, `${qPath}.options readings`)
      unique(meanings, `${qPath}.options meanings`)
      unique(concepts, `${qPath}.options vocabulary concepts`)
      if (formats.includes('picture')) unique(images, `${qPath}.options images`)
      const correctId = id(question.correctOptionId, `${qPath}.correctOptionId`)
      const correct = options.map((value, index) => object(value, `${qPath}.options[${index}]`)).find(option => option.id === correctId)
      check(correct, qPath, 'correct answer does not reference exactly one offered choice')
      check(question.kind === 'target' ? correct.vocabularyItemId === target.id : correct.vocabularyItemId !== target.id,
        qPath, 'question kind disagrees with the correct answer concept')
    })

    const recordings = list(context.recordings, `${path}.recordings`)
    check(recordings.length === 0 || review.text === 'approved', path, 'recordings require approved text')
    check(review.audio !== 'approved' || (review.text === 'approved' && recordings.length > 0), path, 'approved audio requires approved text and paired recordings')
    check(review.audio !== 'not-generated' || recordings.length === 0, path, 'not-generated audio cannot contain recordings')
    const recordingIds: string[] = []
    const voices: string[] = []
    recordings.forEach((value, index) => {
      const rPath = `${path}.recordings[${index}]`
      const recording = object(value, rPath)
      recordingIds.push(id(recording.id, `${rPath}.id`))
      voices.push(id(recording.voice, `${rPath}.voice`))
      const sentenceSrc = contextualMediaPath(recording.sentenceSrc, 'audio')
      check(refs.audioExists(sentenceSrc), rPath, `missing sentence recording ${sentenceSrc}`)
      const questionSrcs = object(recording.questionSrcs, `${rPath}.questionSrcs`)
      check(Object.keys(questionSrcs).length === localQuestionIds.length &&
        Object.keys(questionSrcs).every(key => localQuestionIds.includes(key)), rPath, 'recording questions must match the authored questions')
      for (const questionId of localQuestionIds) {
        const src = contextualMediaPath(questionSrcs[questionId], 'audio')
        check(src !== sentenceSrc, rPath, 'sentence and question require separate clips')
        check(refs.audioExists(src), rPath, `missing question recording ${src}`)
      }
      unique(Object.values(questionSrcs) as string[], `${rPath}.questionSrcs`)
    })
    unique(recordingIds, `${path}.recordings IDs`)
    unique(voices, `${path}.recordings voices`)
  })
  unique(contextIds, 'bank.contexts IDs')
  unique(questionIds, 'bank.questions IDs')
  return input as ContextualBank
}

/** Pending text or unreviewed/missing audio never qualifies as practice content. */
export function approvedContextualQuestions(bank: ContextualBank, format: ContextualAnswerFormat): {
  context: ContextualItem; question: ContextualQuestion
}[] {
  return bank.contexts.filter(context => context.review.text === 'approved' && context.review.audio === 'approved' && context.recordings.length > 0)
    .flatMap(context => context.questions.filter(question => question.formats.includes(format))
      .map(question => ({ context, question })))
}

export function contextualSummary(bank: ContextualBank) {
  const questions = bank.contexts.flatMap(context => context.questions)
  return {
    targets: new Set(bank.contexts.map(context => context.targetItemId)).size,
    contexts: bank.contexts.length,
    questions: questions.length,
    targetQuestions: questions.filter(question => question.kind === 'target').length,
    detailQuestions: questions.filter(question => question.kind === 'detail').length,
    pictureQuestions: questions.filter(question => question.formats.includes('picture')).length,
    textQuestions: questions.filter(question => question.formats.includes('text')).length,
    readyPictureQuestions: approvedContextualQuestions(bank, 'picture').length,
    readyTextQuestions: approvedContextualQuestions(bank, 'text').length,
  }
}
