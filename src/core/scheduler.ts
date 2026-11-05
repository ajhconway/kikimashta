import { DefaultScheduler, Rating, type DefaultSchedulerCard } from 'ts-fsrs';
import type { PracticeAttempt } from '../types';

/** Changing the model, defaults, or grade policy requires a new version. */
export const schedulerVersion = 'fsrs-6-v1';
export const desiredRetention = 0.9;

export type SerializedCard = Omit<DefaultSchedulerCard<'FSRS-6'>, 'dueAt' | 'lastReviewAt'> & {
  dueAt: number;
  lastReviewAt: number | null;
};

export interface ScheduledWord {
  itemId: string;
  language: string;
  dueAt: number;
  lastReviewedAt: number;
  schedulerVersion: string;
  card: SerializedCard;
}

// Explicitly select FSRS-6; the package's default model may change independently.
const scheduler = DefaultScheduler({
  version: 'FSRS-6', desiredRetention, enableFuzz: false,
  enableShortTerm: true, learningSteps: ['1m', '10m'], relearningSteps: ['10m'],
});

function date(value: number): Date {
  if (!Number.isFinite(value) || value < 0 || Number.isNaN(new Date(value).getTime())) throw new Error('Invalid review time.');
  return new Date(value);
}

function serialize(card: DefaultSchedulerCard<'FSRS-6'>): SerializedCard {
  return { ...card, dueAt: card.dueAt.getTime(), lastReviewAt: card.lastReviewAt?.getTime() ?? null };
}

function deserialize(card: SerializedCard): DefaultSchedulerCard<'FSRS-6'> {
  return { ...card, dueAt: date(card.dueAt), lastReviewAt: card.lastReviewAt === null ? null : date(card.lastReviewAt) };
}

/** Correctness maps to Good/Again. Speed and replay count do not affect grades. */
export async function advanceSchedule(previous: ScheduledWord | undefined, attempt: PracticeAttempt): Promise<ScheduledWord> {
  if (!attempt.id || !attempt.itemId || !attempt.language) throw new Error('Missing review identity.');
  const now = date(attempt.answeredAt);
  if (previous && (previous.itemId !== attempt.itemId || previous.language !== attempt.language)) throw new Error('Review belongs to another word or language.');
  if ((previous && previous.schedulerVersion !== schedulerVersion) ||
      (attempt.context && attempt.context.schedulerVersion !== schedulerVersion)) throw new Error('Unsupported scheduler version.');
  if (previous?.card.lastReviewAt !== undefined && previous.card.lastReviewAt !== null && attempt.answeredAt < previous.card.lastReviewAt) throw new Error('Reviews must be chronological.');
  const engine = await scheduler;
  const before = previous ? deserialize(previous.card) : engine.newCard({ cardId: attempt.itemId, now });
  const result = engine.review({ card: before, now, grade: attempt.correct ? Rating.Good : Rating.Again });
  const card = serialize(result.card);
  return { itemId: attempt.itemId, language: attempt.language, dueAt: card.dueAt, lastReviewedAt: attempt.answeredAt, schedulerVersion, card };
}

/** Rebuild derived state; old attempts remain untouched and are never relabelled. */
export async function deriveSchedules(history: readonly PracticeAttempt[], language: string): Promise<ScheduledWord[]> {
  const ordered = history.filter(attempt => attempt.language === language)
    .sort((a, b) => a.answeredAt - b.answeredAt || a.id.localeCompare(b.id));
  const groups = new Map<string, PracticeAttempt[]>();
  const seen = new Set<string>();
  for (const attempt of ordered) {
    if (seen.has(attempt.id)) continue;
    seen.add(attempt.id);
    const group = groups.get(attempt.itemId) ?? [];
    group.push(attempt);
    groups.set(attempt.itemId, group);
  }
  const words: ScheduledWord[] = [];
  const engine = await scheduler;
  for (const [itemId, attempts] of groups) {
    const modern = attempts.filter(attempt => attempt.context);
    if (modern.length) {
      let word: ScheduledWord | undefined;
      for (const attempt of modern) word = await advanceSchedule(word, attempt);
      words.push(word!);
    } else {
      // Earlier quizzes lack exposure/phase metadata: surface each known word once
      // as due, without inventing a long-term memory estimate from massed practice.
      const latest = attempts[attempts.length - 1]!;
      const card = serialize(engine.newCard({ cardId: itemId, now: date(latest.answeredAt) }));
      words.push({ itemId, language, dueAt: card.dueAt, lastReviewedAt: latest.answeredAt, schedulerVersion, card });
    }
  }
  return words.sort((a, b) => a.itemId.localeCompare(b.itemId));
}

/** A value snapshot: callers keep this queue throughout their active session. */
export function snapshotDue(schedules: readonly ScheduledWord[], eligibleIds: readonly string[], at: number): string[] {
  date(at);
  const eligible = new Set(eligibleIds);
  return schedules.filter(word => eligible.has(word.itemId) && word.dueAt <= at)
    .sort((a, b) => a.dueAt - b.dueAt || a.itemId.localeCompare(b.itemId))
    .map(word => word.itemId);
}

/** Predicted correctness for this exercise; a new card has no retention evidence. */
export async function retrievability(word: ScheduledWord, at: number): Promise<number> {
  const now = date(at);
  if (word.card.lastReviewAt === null || word.card.stability <= 0) return 0;
  const engine = await scheduler;
  const elapsedDays = Math.max(0, engine.chrono.difference(date(word.card.lastReviewAt), now));
  return Math.max(0, Math.min(1, engine.model.forgettingCurve(word.card, elapsedDays)));
}
