/** Authored contextual content for #119; draft banks are separate from active practice. */
export type ContextualAnswerFormat = 'picture' | 'text'
export type ContextualQuestionKind = 'target' | 'detail'

export interface ContextualPrompt {
  text: string
  reading: string
  meaning: string
  grammarTags: string[]
  supportingVocabularyIds: string[]
}

export interface ContextualOption extends ContextualPrompt {
  id: string
  /** The answer concept, independent of the question's target. */
  vocabularyItemId?: string
  /** Existing catalogue picture depicting this answer; requires semantic review. */
  imageItemId?: string
}

export interface ContextualQuestion {
  id: string
  revision: number
  kind: ContextualQuestionKind
  /** Semantic authoring focus; distinct from the literal answer-concept kind. */
  focus?: ContextualQuestionKind
  prompt: ContextualPrompt
  formats: ContextualAnswerFormat[]
  options: ContextualOption[]
  correctOptionId: string
  explanation: string
}

export interface ContextualRecording {
  id: string
  voice: string
  sentenceSrc: string
  questionSrcs: Record<string, string>
}

export interface ContextualItem {
  id: string
  revision: number
  /** Absent on the original, approved contrastive bank. */
  stage?: 'simple' | 'contrastive'
  comparisonContextId?: string
  targetItemId: string
  targetOccurrence: { surface: string; reading: string }
  sentence: ContextualPrompt
  questions: ContextualQuestion[]
  recordings: ContextualRecording[]
  review: {
    text: 'pending' | 'approved' | 'rejected'
    audio: 'not-generated' | 'pending' | 'approved' | 'rejected'
  }
  reviewNotes: string
}

export interface ContextualBank {
  schemaVersion: 1
  id: string
  language: string
  grammarProfile: 'genki-1'
  grammarReference: string
  grammarPoints: { id: string; label: string; genkiLesson: number }[]
  supportingVocabulary: { id: string; text: string; reading: string; meaning: string }[]
  contexts: ContextualItem[]
}

export interface ContextualVocabularyReference {
  id: string
  language?: string
  text: string
  reading: string
  meaning: string
  image: { src: string; alt: string }
  removalReason?: string
}
