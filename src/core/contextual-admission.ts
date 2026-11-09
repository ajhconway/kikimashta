import type { PracticeCard } from '../types';
import { cardKey, isContextualExercise } from './cards';
import { planLessonChunk, type DensityRange, type LessonPlan } from './density';
import type { ScheduledWord } from './scheduler';

export const CONTEXTUAL_INTRODUCTION_LIMIT = 3;

/** Initial encounters share the workload budget but enter the review block. */
export async function planContextualIntroductions({ schedules, cards, now, range }: {
  schedules: ScheduledWord[];
  cards: PracticeCard[];
  now: number;
  range?: DensityRange;
}): Promise<LessonPlan> {
  const known = new Set(schedules.map(cardKey));
  const candidates = cards.filter(card => {
    if (!isContextualExercise(card.exercise)) return false;
    const key = cardKey(card);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
  return planLessonChunk({ schedules, candidates, now, range, chunkSize: CONTEXTUAL_INTRODUCTION_LIMIT });
}
