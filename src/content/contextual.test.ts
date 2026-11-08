import { describe, expect, it } from 'vitest'
import type { ContextualBank, ContextualPrompt, ContextualVocabularyReference } from './contextual-types'
import { approvedContextualQuestions, contextualMediaPath, contextualSummary, validateContextualBank } from './contextual'

const prompt = (text: string, reading: string, meaning: string): ContextualPrompt => ({
  text, reading, meaning, grammarTags: ['existence'], supportingVocabularyIds: [],
})
const vocabulary: ContextualVocabularyReference[] = [
  { id: 'book', text: '本', reading: 'ほん', meaning: 'Book', image: { src: 'images/book.svg', alt: 'A book' } },
  { id: 'notebook', text: 'ノート', reading: 'のーと', meaning: 'Notebook', image: { src: 'images/notebook.svg', alt: 'A notebook' } },
  { id: 'three', text: '三つ', reading: 'みっつ', meaning: 'Three things', image: { src: 'images/three.svg', alt: 'Three objects' } },
  { id: 'two', text: '二つ', reading: 'ふたつ', meaning: 'Two things', image: { src: 'images/two.svg', alt: 'Two objects' } },
]
const refs = {
  vocabulary,
  eligibleTargetIds: new Set(['book']),
  imageExists: (src: string) => vocabulary.some(item => item.image.src === src),
  audioExists: (src: string) => ['audio/sentence.mp3', 'audio/target.mp3', 'audio/detail.mp3'].includes(src),
}

function fixture(): ContextualBank {
  return {
    schemaVersion: 1, id: 'ja-contextual-test', language: 'ja-JP', grammarProfile: 'genki-1',
    grammarReference: 'https://bookclub2.japantimes.co.jp/download/files/genki3/genki-3rd_syllabus_E.pdf',
    grammarPoints: [{ id: 'existence', label: 'あります', genkiLesson: 4 }],
    supportingVocabulary: [],
    contexts: [{
      id: 'books-and-notebooks', revision: 1, targetItemId: 'book', targetOccurrence: { surface: '本', reading: 'ほん' },
      sentence: prompt('本は三つ、ノートは二つあります。', 'ほんはみっつ、のーとはふたつあります。', 'There are three books and two notebooks.'),
      questions: [{
        id: 'which-has-three', revision: 1, kind: 'target',
        prompt: prompt('何が三つありますか。', 'なにがみっつありますか。', 'What are there three of?'),
        formats: ['picture', 'text'], correctOptionId: 'answer-book', explanation: 'There are three books.',
        options: [
          { id: 'answer-book', ...prompt('本', 'ほん', 'Book'), vocabularyItemId: 'book', imageItemId: 'book' },
          { id: 'answer-notebook', ...prompt('ノート', 'のーと', 'Notebook'), vocabularyItemId: 'notebook', imageItemId: 'notebook' },
        ],
      }, {
        id: 'how-many-books', revision: 1, kind: 'detail',
        prompt: prompt('本はいくつありますか。', 'ほんはいくつありますか。', 'How many books are there?'),
        formats: ['picture', 'text'], correctOptionId: 'answer-three', explanation: 'The book count is three.',
        options: [
          { id: 'answer-three', ...prompt('三つ', 'みっつ', 'Three'), vocabularyItemId: 'three', imageItemId: 'three' },
          { id: 'answer-two', ...prompt('二つ', 'ふたつ', 'Two'), vocabularyItemId: 'two', imageItemId: 'two' },
        ],
      }],
      recordings: [], review: { text: 'pending', audio: 'not-generated' }, reviewNotes: 'Compare the two counts.',
    }],
  }
}

function recordedFixture(): ContextualBank {
  const bank = fixture()
  const context = bank.contexts[0]!
  context.review = { text: 'approved', audio: 'approved' }
  context.recordings = [{ id: 'voice-v1', voice: 'otani', sentenceSrc: 'audio/sentence.mp3',
    questionSrcs: { 'which-has-three': 'audio/target.mp3', 'how-many-books': 'audio/detail.mp3' } }]
  return bank
}

describe('contextual content validation', () => {
  it('accepts a review draft with a detail answer different from its vocabulary target', () => {
    const bank = validateContextualBank(fixture(), refs)
    expect(bank.contexts[0]!.questions[1]!.correctOptionId).toBe('answer-three')
    expect(contextualSummary(bank)).toEqual({ targets: 1, contexts: 1, questions: 2, targetQuestions: 1, detailQuestions: 1,
      pictureQuestions: 2, textQuestions: 2, readyPictureQuestions: 0, readyTextQuestions: 0 })
    expect(approvedContextualQuestions(bank, 'picture')).toEqual([])
  })

  it('requires both text and audio approval before offering the requested answer format', () => {
    const bank = recordedFixture()
    bank.contexts[0]!.questions[1]!.formats = ['text']
    validateContextualBank(bank, refs)
    expect(approvedContextualQuestions(bank, 'picture').map(entry => entry.question.id)).toEqual(['which-has-three'])
    expect(approvedContextualQuestions(bank, 'text')).toHaveLength(2)
    bank.contexts[0]!.review.audio = 'pending'
    expect(approvedContextualQuestions(bank, 'text')).toEqual([])
    bank.contexts[0]!.review.text = 'rejected'
    expect(approvedContextualQuestions(bank, 'text')).toEqual([])
  })

  it('rejects recordings made before text approval and approval without recordings', () => {
    const bank = recordedFixture()
    bank.contexts[0]!.review.text = 'pending'
    expect(() => validateContextualBank(bank, refs)).toThrow(/recordings require approved text/)
    bank.contexts[0]!.review.text = 'approved'
    bank.contexts[0]!.recordings = []
    expect(() => validateContextualBank(bank, refs)).toThrow(/approved audio requires/)
  })

  it('requires a complete sentence and question recording pair for every authored question', () => {
    const bank = recordedFixture()
    bank.contexts[0]!.recordings[0]!.questionSrcs = { 'which-has-three': 'audio/target.mp3' }
    expect(() => validateContextualBank(bank, refs)).toThrow(/recording questions must match/)
    expect(() => validateContextualBank(recordedFixture(), { ...refs, audioExists: src => src !== 'audio/detail.mp3' }))
      .toThrow(/missing question recording/)
    bank.contexts[0]!.recordings[0]!.questionSrcs['how-many-books'] = 'audio/sentence.mp3'
    expect(() => validateContextualBank(bank, refs)).toThrow(/separate clips/)
  })

  it('requires unique identities, valid references and an offered correct answer', () => {
    const bank = fixture()
    bank.contexts.push(structuredClone(bank.contexts[0]!))
    expect(() => validateContextualBank(bank, refs)).toThrow(/duplicate entries/)
    bank.contexts.pop()
    bank.contexts[0]!.questions[1]!.id = 'which-has-three'
    expect(() => validateContextualBank(bank, refs)).toThrow(/duplicate entries/)
    bank.contexts[0]!.questions[1]!.id = 'how-many-books'
    bank.contexts[0]!.questions[0]!.correctOptionId = 'absent'
    expect(() => validateContextualBank(bank, refs)).toThrow(/correct answer/)
  })

  it('keeps target-answer and detail-answer concepts explicit', () => {
    const bank = fixture()
    bank.contexts[0]!.questions[0]!.correctOptionId = 'answer-notebook'
    expect(() => validateContextualBank(bank, refs)).toThrow(/question kind/)
    bank.contexts[0]!.questions[0]!.correctOptionId = 'answer-book'
    bank.contexts[0]!.questions[0]!.kind = 'detail'
    expect(() => validateContextualBank(bank, refs)).toThrow(/question kind/)
  })

  it('checks the supplied target surface and reading in the sentence', () => {
    const bank = fixture()
    bank.contexts[0]!.targetOccurrence.surface = '水'
    expect(() => validateContextualBank(bank, refs)).toThrow(/target surface/)
    bank.contexts[0]!.targetOccurrence = { surface: '本', reading: 'みず' }
    expect(() => validateContextualBank(bank, refs)).toThrow(/target reading/)
    bank.contexts[0]!.targetOccurrence = { surface: '本', reading: 'ほん' }
    expect(validateContextualBank(bank, refs)).toBe(bank)
  })

  it('rejects targets outside the active pool and removed answer concepts', () => {
    expect(() => validateContextualBank(fixture(), { ...refs, eligibleTargetIds: new Set() })).toThrow(/approved practice pool/)
    const removed = vocabulary.map(word => word.id === 'notebook' ? { ...word, removalReason: 'retired' } : word)
    expect(() => validateContextualBank(fixture(), { ...refs, vocabulary: removed })).toThrow(/removed/)
  })

  it('requires all picture choices to resolve to distinct existing images', () => {
    const bank = fixture()
    delete bank.contexts[0]!.questions[0]!.options[1]!.imageItemId
    expect(() => validateContextualBank(bank, refs)).toThrow(/image for every choice/)
    bank.contexts[0]!.questions[0]!.formats = ['text']
    expect(validateContextualBank(bank, refs)).toBe(bank)
    expect(() => validateContextualBank(fixture(), { ...refs, imageExists: () => false })).toThrow(/missing picture/)
    const sameImage = vocabulary.map(word => ({ ...word, image: vocabulary[0]!.image }))
    expect(() => validateContextualBank(fixture(), { ...refs, vocabulary: sameImage })).toThrow(/options images/)
  })

  it('rejects indistinguishable written and spoken choices after normalization', () => {
    const bank = fixture()
    bank.contexts[0]!.questions[0]!.options[1]!.text = ' 本 '
    expect(() => validateContextualBank(bank, refs)).toThrow(/options writing/)
    bank.contexts[0]!.questions[0]!.options[1]!.text = 'ノート'
    bank.contexts[0]!.questions[0]!.options[1]!.reading = 'ホン'
    expect(() => validateContextualBank(bank, refs)).toThrow(/options readings/)
  })

  it('keeps grammar in the agreed profile and all metadata references resolvable', () => {
    const bank = fixture()
    bank.grammarPoints[0]!.genkiLesson = 13
    expect(() => validateContextualBank(bank, refs)).toThrow(/lessons 1–12/)
    bank.grammarPoints[0]!.genkiLesson = 4
    bank.contexts[0]!.sentence.grammarTags = ['unlisted-grammar']
    expect(() => validateContextualBank(bank, refs)).toThrow(/unknown reference/)
    bank.contexts[0]!.sentence.grammarTags = ['existence']
    bank.contexts[0]!.questions[0]!.options[0]!.supportingVocabularyIds = ['unlisted-word']
    expect(() => validateContextualBank(bank, refs)).toThrow(/unknown reference/)
  })

  it.each([null, [], {}, { ...fixture(), contexts: [null] }])('reports malformed bank data as a validation error', input => {
    expect(() => validateContextualBank(input, refs)).toThrow()
  })

  it.each(['../audio/a.mp3', '/audio/a.mp3', 'https://example.com/a.mp3', 'audio/%2e%2e/a.mp3', 'audio/a.mp3?x=1', 'audio/a.wav'])(
    'rejects unsafe recording path %s', path => {
      expect(() => contextualMediaPath(path, 'audio')).toThrow(/unsafe or unsupported/)
    })
})
