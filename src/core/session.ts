import type { Exercise, PracticeCard, WordBank, WordItem } from '../types';
import { cardKey } from './cards';
import type { ContextualItem, ContextualQuestion, ContextualRecording } from '../content/contextual-types';
import type { WordChoicePolicySnapshot } from './distractor-types';
import { selectWordChoices } from './distractors';
import { cardMastery } from './mastery';
import type { ScheduledWord } from './scheduler';
import { shuffled } from './random';
export { shuffled } from './random';
export { InsufficientChoicesError } from './distractors';

export interface Question {
  target: WordItem; exercise: Exercise; choices: WordItem[]; retryOf?: string; demoId?: string;
  /** First contextual encounter: review UI, initial-learning evidence. */
  introduction?: boolean;
  choicePolicy?: WordChoicePolicySnapshot;
  contextual?: { context: ContextualItem; question: ContextualQuestion; recording?: ContextualRecording };
}

export function correctChoiceId(question: Question): string {
  return question.contextual?.question.correctOptionId ?? question.target.id;
}

export function validateBank(bank: WordBank): void {
  if (!bank.id || !bank.language || !Array.isArray(bank.items) || bank.items.length < 2) throw new Error('A bank needs at least two words.');
  const ids = new Set<string>();
  for (const item of bank.items) {
    if (!item.id || ids.has(item.id)) throw new Error('Word IDs must be present and unique.');
    ids.add(item.id);
    if (item.wordExercises !== undefined && (!Array.isArray(item.wordExercises) || !item.wordExercises.length ||
        new Set(item.wordExercises).size !== item.wordExercises.length || item.wordExercises.some(exercise => !['audio-picture', 'audio-text'].includes(exercise)))) throw new Error('Invalid word exercise eligibility: ' + item.id);
    if (item.language !== bank.language || !item.theme || !item.text || !item.image?.src || !Array.isArray(item.audio) || !item.audio.length || item.audio.some(recording => !recording.src)) throw new Error('Incomplete word: ' + item.id);
    for (const path of [item.image.src, ...item.audio.map(recording => recording.src)]) {
      if (path.startsWith('/') || path.includes('..') || /^[a-z]+:/i.test(path)) throw new Error('Media paths must be relative to the app.');
    }
  }
  for (const item of bank.items) {
    if (item.pictureDistractorExclusions !== undefined && (!Array.isArray(item.pictureDistractorExclusions) ||
        item.pictureDistractorExclusions.some(id => typeof id !== 'string' || id === item.id || !ids.has(id)))) throw new Error('Invalid picture distractor exclusion: ' + item.id);
  }
}

/** Build mixed questions for a fixed card snapshot; each question keeps one answer format. */
export function createQuestions(targets: PracticeCard[], pool: WordItem[], random = Math.random,
  schedules?: ReadonlyMap<string, ScheduledWord | undefined>): Question[] {
  if (!targets.length) return [];
  if (new Set(targets.map(cardKey)).size !== targets.length) throw new Error('Targets must be unique cards.');
  return shuffled(targets, random).map(card => ({ target: card.item, exercise: card.exercise,
    ...selectWordChoices(card, pool, cardMastery(schedules?.get(cardKey(card))), random) }));
}

/** Revisit a miss within this block without admitting any new due-word targets. */
export function requeueMissedQuestion(questions: readonly Question[], index: number, attemptId: string, random = Math.random): Question[] {
  if (!Number.isInteger(index) || index < 0 || index >= questions.length || !attemptId) throw new Error('A retry needs a current question and miss ID.');
  const current = questions[index]!;
  const retryOf = current.retryOf ?? attemptId;
  const result = [...questions];
  // Repeating a transition cannot leave multiple pending copies of this miss.
  if (questions.slice(index + 1).some(question => question.retryOf === retryOf)) return result;
  const firstPosition = Math.min(index + 2, questions.length);
  const positions = questions.length - firstPosition + 1;
  // Finish the current sample set before revisiting demo mistakes.
  const insertion = current.demoId ? questions.length
    : firstPosition + Math.min(positions - 1, Math.max(0, Math.floor(random() * positions)));
  const retry: Question = { ...current, retryOf, choices: shuffled(current.choices, random) };
  result.splice(insertion, 0, retry);
  return result;
}
