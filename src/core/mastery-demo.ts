import { State } from 'ts-fsrs';
import type { PracticeCard } from '../types';
import { cardKey } from './cards';
import { masteryLevels } from './mastery';
import { schedulerVersion, type ScheduledWord } from './scheduler';
import { createQuestions, shuffled, type Question } from './session';

const day = 86_400_000;
// Representative intervals within each level; these are disposable demo fixtures.
const gaps = [0, 600_000, day / 2, 3 * day, 14 * day, 60 * day, 180 * day, 730 * day];

/** A fresh disposable FSRS sample; no saved history or other sample is changed. */
export function createDemoSchedule(card: PracticeCard, at: number, levelIndex: number): ScheduledWord | undefined {
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= gaps.length) throw new Error('Unknown demo mastery level.');
  if (levelIndex === 0) return undefined;
  const gap = gaps[levelIndex]!;
  const lastReviewAt = Math.max(0, at - gap);
  const identity = { itemId: card.item.id, language: card.item.language, exercise: card.exercise };
  return {
    ...identity, dueAt: lastReviewAt + gap, lastReviewedAt: lastReviewAt, schedulerVersion,
    card: { cardId: cardKey(identity), stability: gap / day, difficulty: 5,
      state: levelIndex === 1 ? State.Learning : State.Review,
      scheduleStatus: levelIndex === 1 ? 'learning' : 'review',
      dueAt: lastReviewAt + gap, lastReviewAt, reps: levelIndex === 1 ? 1 : 8,
      lapses: 0, scheduledDays: gap / day, learningStep: 0 },
  };
}

/** One independent sample per level, even when a small pool repeats a real card. (#140) */
export function createMasteryDemo(cards: readonly PracticeCard[], at: number, random = Math.random) {
  if (!cards.length) throw new Error('Select a pack for the mastery demo.');
  const pool = shuffled(cards, random);
  const schedules = new Map<string, ScheduledWord | undefined>();
  const questions: Question[] = masteryLevels.map((_, index) => {
    const target = pool[index % pool.length]!;
    const demoId = `mastery-demo-${index}`;
    schedules.set(demoId, createDemoSchedule(target, at, index));
    return { ...createQuestions([target], cards.filter(card => card.exercise === target.exercise).map(card => card.item), random)[0]!, demoId };
  });
  return { questions, schedules };
}
