import { State } from 'ts-fsrs';
import type { PracticeCard } from '../types';
import { cardKey } from './cards';
import { masteryLevels } from './mastery';
import { schedulerVersion, type ScheduledWord } from './scheduler';
import { createQuestions, shuffled, type Question } from './session';

const day = 86_400_000;
// Representative intervals within each level; these are disposable demo fixtures.
const gaps = [0, 600_000, day / 2, 3 * day, 14 * day, 60 * day, 180 * day, 730 * day];

/** One independent sample per level, even when a small pool repeats a real card. (#140) */
export function createMasteryDemo(cards: readonly PracticeCard[], at: number, random = Math.random) {
  if (!cards.length) throw new Error('Select a pack for the mastery demo.');
  const pool = shuffled(cards, random);
  const schedules = new Map<string, ScheduledWord | undefined>();
  const questions: Question[] = masteryLevels.map((_, index) => {
    const target = pool[index % pool.length]!;
    const demoId = `mastery-demo-${index}`;
    const gap = gaps[index]!;
    const lastReviewAt = Math.max(0, at - gap);
    const identity = { itemId: target.item.id, language: target.item.language, exercise: target.exercise };
    schedules.set(demoId, index === 0 ? undefined : {
      ...identity, dueAt: lastReviewAt + gap, lastReviewedAt: lastReviewAt, schedulerVersion,
      card: { cardId: cardKey(identity), stability: gap / day, difficulty: 5,
        state: index === 1 ? State.Learning : State.Review,
        scheduleStatus: index === 1 ? 'learning' : 'review',
        dueAt: lastReviewAt + gap, lastReviewAt, reps: index === 1 ? 1 : 8,
        lapses: 0, scheduledDays: gap / day, learningStep: 0 },
    });
    return { ...createQuestions([target], cards.filter(card => card.exercise === target.exercise).map(card => card.item), random)[0]!, demoId };
  });
  return { questions, schedules };
}
