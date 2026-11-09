import type { CardIdentity, PracticeCard } from '../types';
import { cardKey } from './cards';
import type { ScheduledWord } from './scheduler';

const hour = 60 * 60 * 1000;
const day = 24 * hour;
/** Shared interval mastery and feature policy (#135); fixed days keep boundaries deterministic. */
export const masteryLevels = [
  { label: 'New', minimumMs: 0, timerMs: null, preferMatchingKana: false, distractors: { semantic: 0, pronunciation: 0 } },
  { label: 'Learning', minimumMs: 0, timerMs: null, preferMatchingKana: false, distractors: { semantic: 0, pronunciation: 0 } },
  { label: 'Improving', minimumMs: 4 * hour, timerMs: 10000, preferMatchingKana: false, distractors: { semantic: 1, pronunciation: 0 } },
  { label: 'Familiar', minimumMs: day, timerMs: 10000, preferMatchingKana: true, distractors: { semantic: 2, pronunciation: 0 } },
  { label: 'Steady', minimumMs: 7 * day, timerMs: 5000, preferMatchingKana: true, distractors: { semantic: 3, pronunciation: 0 } },
  { label: 'Strong', minimumMs: 30 * day, timerMs: 3000, preferMatchingKana: true, distractors: { semantic: 2, pronunciation: 1 } },
  { label: 'Confident', minimumMs: 90 * day, timerMs: 1500, preferMatchingKana: true, distractors: { semantic: 1, pronunciation: 2 } },
  { label: 'Mastered', minimumMs: 365 * day, timerMs: 1500, preferMatchingKana: true, distractors: { semantic: 0, pronunciation: 3 } },
] as const;
export type MasteryLevel = typeof masteryLevels[number];

export function masteryIndex(word: ScheduledWord | undefined): number {
  if (!word || word.card.lastReviewAt === null) return 0;
  const gap = word.dueAt - word.card.lastReviewAt;
  if (!Number.isFinite(gap) || gap < 0) return 0;
  for (let index = masteryLevels.length - 1; index > 0; index--) {
    if (gap >= masteryLevels[index]!.minimumMs) return index;
  }
  return 0;
}
export function cardMastery(word: ScheduledWord | undefined): MasteryLevel {
  return masteryLevels[masteryIndex(word)]!;
}

/** Average ordinal rounded down; every eligible card counts, including unseen cards. */
export function packMastery(cards: readonly (CardIdentity | PracticeCard)[], schedules: ReadonlyMap<string, ScheduledWord>) {
  const levels = cards.map(card => masteryIndex(schedules.get(cardKey(card))));
  return {
    lowest: masteryLevels[levels.length ? Math.min(...levels) : 0]!,
    average: masteryLevels[levels.length ? Math.floor(levels.reduce((sum, level) => sum + level, 0) / levels.length) : 0]!,
  };
}
