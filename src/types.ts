export interface ImageAsset {
  src: string
  source: 'generated' | 'library'
  alt: string
  credit?: string
}

export interface AudioAsset {
  src: string
  source: 'synthesized' | 'recorded'
  voice?: string
  voiceName?: string
}

export interface WordItem {
  id: string
  language: string
  theme: string
  /** Internal meaning, also useful for non-quiz descriptions. */
  label: string
  text: string
  reading?: string
  image: ImageAsset
  audio: AudioAsset[]
  /** Pictures that could also reasonably answer this word's prompt. */
  pictureDistractorExclusions?: string[]
}

export interface WordBank {
  id: string
  language: string
  title: string
  items: WordItem[]
}

export type WordExercise = 'audio-picture' | 'audio-text'
export type ContextualStage = 'simple' | 'contrastive'
export type ContextualExercise = `context-${ContextualStage}-${'picture' | 'text'}`
export type Exercise = WordExercise | ContextualExercise

export interface ContextualAttemptDetails {
  stage: ContextualStage
  contextId: string
  contextRevision: number
  questionId: string
  questionRevision: number
  kind: 'target' | 'detail'
  correctOptionId: string
  sentenceSrc: string
  questionSrc: string
}
export type AnswerOutcome = 'success' | 'partial' | 'failure'

/** Vocabulary stays shared; each exercise is learned independently. */
export interface PracticeCard {
  item: WordItem
  exercise: Exercise
}

export interface CardIdentity {
  itemId: string
  language: string
  exercise: Exercise
}

/** Epoch milliseconds make timing explicit and easy to sync later. */
export interface PracticeAttempt {
  id: string
  sessionId: string
  itemId: string
  language: string
  choiceIds: string[]
  selectedId: string
  correct: boolean
  /** Missing on older attempts, whose grade remains based on correctness. */
  outcome?: AnswerOutcome
  /** Present only when a countdown actually started; replays never reset it. */
  timer?: { limitMs: number; startedAt: number }
  startedAt: number
  answeredAt: number
  responseMs: number
  /** Missing on legacy attempts; never infer delayed recall from old fixed rounds. */
  context?: {
    phase: 'lesson' | 'review'
    exercise: Exercise
    recordingSrc: string
    replays: number
    schedulerVersion: string
    contextual?: ContextualAttemptDetails
    /** Original miss ID when this answer is an in-block corrective retry. */
    retryOf?: string
  }
}
