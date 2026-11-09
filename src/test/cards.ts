import type { PracticeCard, WordItem } from '../types';
import { exercises } from '../core/cards';

/** Both exercise identities for small, explicit test fixtures. */
export function practiceCards(items: readonly WordItem[]): PracticeCard[] {
  return items.flatMap(item => exercises.map(exercise => ({ item, exercise })));
}
