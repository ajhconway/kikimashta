import { DefaultScheduler, Rating, type DefaultSchedulerCard } from 'ts-fsrs';
import type { Exercise, PracticeAttempt } from '../types';
import { attemptExercise, cardKey } from './cards';

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
  exercise: Exercise;
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
  const identity = { itemId: attempt.itemId, language: attempt.language, exercise: attemptExercise(attempt) };
  if (previous && cardKey(previous) !== cardKey(identity)) throw new Error('Review belongs to another word, language, or exercise.');
  if ((previous && previous.schedulerVersion !== schedulerVersion) ||
      (attempt.context && attempt.context.schedulerVersion !== schedulerVersion)) throw new Error('Unsupported scheduler version.');
  if (previous?.card.lastReviewAt !== undefined && previous.card.lastReviewAt !== null && attempt.answeredAt < previous.card.lastReviewAt) throw new Error('Reviews must be chronological.');
  const engine = await scheduler;
  const before = previous ? deserialize(previous.card) : engine.newCard({ cardId: cardKey(identity), now });
  const result = engine.review({ card: before, now, grade: attempt.correct ? Rating.Good : Rating.Again });
  const card = serialize(result.card);
  return { ...identity, dueAt: card.dueAt, lastReviewedAt: attempt.answeredAt, schedulerVersion, card };
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
    const key = cardKey({ ...attempt, exercise: attemptExercise(attempt) });
    const group = groups.get(key) ?? [];
    group.push(attempt);
    groups.set(key, group);
  }
  const words: ScheduledWord[] = [];
  const engine = await scheduler;
  for (const attempts of groups.values()) {
    // Corrective retries occur after feedback within the same block. Retain them
    // in history, but never let their success erase the original memory lapse.
    const modern = attempts.filter(attempt => attempt.context && attempt.context.retryOf === undefined);
    if (modern.length) {
      let word: ScheduledWord | undefined;
      for (const attempt of modern) word = await advanceSchedule(word, attempt);
      words.push(word!);
    } else {
      // Legacy or orphan-correction history cannot establish durable memory:
      // surface the word as due without inventing a retention estimate.
      const latest = attempts[attempts.length - 1]!;
      const identity = { itemId: latest.itemId, language, exercise: attemptExercise(latest) };
      const card = serialize(engine.newCard({ cardId: cardKey(identity), now: date(latest.answeredAt) }));
      words.push({ ...identity, dueAt: card.dueAt, lastReviewedAt: latest.answeredAt, schedulerVersion, card });
    }
  }
  return words.sort((a, b) => a.itemId.localeCompare(b.itemId) || a.exercise.localeCompare(b.exercise));
}

/** A value snapshot: callers keep this queue throughout their active session. */
export function snapshotDue(schedules: readonly ScheduledWord[], eligibleIds: readonly string[], at: number): ScheduledWord[] {
  date(at);
  const eligible = new Set(eligibleIds);
  return structuredClone(schedules.filter(word => eligible.has(word.itemId) && word.dueAt <= at)
    .sort((a, b) => a.dueAt - b.dueAt || a.itemId.localeCompare(b.itemId) || a.exercise.localeCompare(b.exercise)));
}

/** Predicted correctness for this exercise; a new card has no retention evidence. */
export async function retrievability(word: ScheduledWord, at: number): Promise<number> {
  const now = date(at);
  if (word.card.lastReviewAt === null || word.card.stability <= 0) return 0;
  const engine = await scheduler;
  const elapsedDays = Math.max(0, engine.chrono.difference(date(word.card.lastReviewAt), now));
  return Math.max(0, Math.min(1, engine.model.forgettingCurve(word.card, elapsedDays)));
}
