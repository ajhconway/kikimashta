import type { CardIdentity, Exercise, PracticeAttempt, PracticeCard, WordItem } from '../types';

export const exercises: readonly Exercise[] = ['audio-picture', 'audio-text'];

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
