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
}

export interface WordBank {
  id: string
  language: string
  title: string
  items: WordItem[]
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
  startedAt: number
  answeredAt: number
  responseMs: number
  /** Missing on legacy attempts; never infer delayed recall from old fixed rounds. */
  context?: {
    phase: 'lesson' | 'review'
    exercise: 'audio-picture'
    recordingSrc: string
    replays: number
    schedulerVersion: string
    /** Original miss ID when this answer is an in-block corrective retry. */
    retryOf?: string
  }
}

export interface WordProgress {
  itemId: string
  language: string
  attempts: number
  correct: number
  lastPracticedAt: number
}
