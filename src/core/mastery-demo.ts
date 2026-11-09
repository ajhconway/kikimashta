import { State } from 'ts-fsrs';
import type { PracticeCard } from '../types';
import { cardKey } from './cards';
import { masteryLevels } from './mastery';
import { schedulerVersion, type ScheduledWord } from './scheduler';

const day = 86_400_000;
// Representative intervals within each level; these are disposable demo fixtures.
const gaps = [0, 600_000, day / 2, 3 * day, 14 * day, 60 * day, 180 * day, 730 * day];

/** Disposable schedule shared by contextual samples and configurable Dev review. */
export function createMasterySample(target: PracticeCard, levelIndex: number, at: number): ScheduledWord | undefined {
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= masteryLevels.length || !Number.isFinite(at) || at < 1) throw new Error('Invalid sample mastery level or time.');
  if (levelIndex === 0) return undefined;
  const gap = gaps[levelIndex]!;
  const lastReviewAt = Math.max(1, at - gap);
  const identity = { itemId: target.item.id, language: target.item.language, exercise: target.exercise };
  return {
    ...identity, dueAt: lastReviewAt + gap, lastReviewedAt: lastReviewAt, schedulerVersion,
    card: { cardId: cardKey(identity), stability: gap / day, difficulty: 5,
      state: levelIndex === 1 ? State.Learning : State.Review,
      scheduleStatus: levelIndex === 1 ? 'learning' : 'review',
      dueAt: lastReviewAt + gap, lastReviewAt, reps: levelIndex === 1 ? 1 : 8,
      lapses: 0, scheduledDays: gap / day, learningStep: 0 },
  };
}
