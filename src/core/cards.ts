import type { CardIdentity, ContextualExercise, ContextualStage, Exercise, PracticeAttempt, PracticeCard, WordExercise, WordItem } from '../types';

export const exercises: readonly WordExercise[] = ['audio-picture', 'audio-text'];

export function isContextualExercise(exercise: Exercise): exercise is ContextualExercise {
  return exercise.startsWith('context-');
}
export function answerFormat(exercise: Exercise): 'picture' | 'text' {
  return exercise.endsWith('picture') ? 'picture' : 'text';
}
export function contextualExercise(stage: ContextualStage, format: 'picture' | 'text'): ContextualExercise {
  return `context-${stage}-${format}`;
}

/** Old immutable attempts describe picture recognition, never writing. */
export function attemptExercise(attempt: PracticeAttempt): Exercise {
  return attempt.context?.exercise ?? 'audio-picture';
}

/** Encoding the tuple avoids collisions even when vocabulary IDs contain punctuation. */
export function cardKey(card: CardIdentity | PracticeCard): string {
  return 'item' in card
    ? JSON.stringify([card.item.language, card.item.id, card.exercise])
    : JSON.stringify([card.language, card.itemId, card.exercise]);
}

export function practiceCards(items: readonly WordItem[]): PracticeCard[] {
  return items.flatMap(item => exercises.map(exercise => ({ item, exercise })));
}
