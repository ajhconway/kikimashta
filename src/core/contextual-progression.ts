import type { PracticeAttempt, PracticeCard } from '../types';
import { answerFormat, attemptExercise, cardKey, contextualExercise, isContextualExercise } from './cards';
import { advanceSchedule, type ScheduledWord } from './scheduler';

export const CONTEXTUAL_MASTERY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function threshold(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid contextual mastery interval.');
  return value;
}

/** The assigned interval is retention evidence only after an eligible saved review. */
export function earnedContextualUnlocks(
  schedule: ScheduledWord, attempt: PracticeAttempt, thresholdMs = CONTEXTUAL_MASTERY_INTERVAL_MS,
): string[] {
  threshold(thresholdMs);
  const context = attempt.context;
  if (!attempt.correct || !context || context.phase !== 'review' || context.retryOf !== undefined ||
      cardKey(schedule) !== cardKey({ ...attempt, exercise: attemptExercise(attempt) }) ||
      schedule.lastReviewedAt !== attempt.answeredAt || !Number.isFinite(schedule.dueAt) ||
      !Number.isFinite(schedule.lastReviewedAt) || schedule.dueAt - schedule.lastReviewedAt <= thresholdMs) return [];
  const identity = { itemId: attempt.itemId, language: attempt.language };
  if (context.exercise === 'audio-picture' || context.exercise === 'audio-text') {
    return (['picture', 'text'] as const).map(format => cardKey({ ...identity, exercise: contextualExercise('simple', format) }));
  }
  if ((context.exercise === 'context-simple-picture' || context.exercise === 'context-simple-text') &&
      context.contextual?.stage === 'simple') {
    return [cardKey({ ...identity, exercise: contextualExercise('contrastive', answerFormat(context.exercise)) })];
  }
  return [];
}

/** Reconstruct earned access from immutable history, retaining it after later misses. */
export async function deriveContextualUnlocks(
  history: readonly PracticeAttempt[], language: string, thresholdMs = CONTEXTUAL_MASTERY_INTERVAL_MS,
): Promise<Set<string>> {
  threshold(thresholdMs);
  const ordered = history.filter(attempt => attempt.language === language)
    .sort((a, b) => a.answeredAt - b.answeredAt || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const schedules = new Map<string, ScheduledWord>();
  const unlocked = new Set<string>();
  for (const attempt of ordered) {
    if (seen.has(attempt.id)) continue;
    seen.add(attempt.id);
    // This mirrors scheduling: legacy and corrective history does not advance
    // memory. Lessons establish a schedule but cannot earn stage access.
    if (!attempt.context || attempt.context.retryOf !== undefined) continue;
    const key = cardKey({ ...attempt, exercise: attemptExercise(attempt) });
    const schedule = await advanceSchedule(schedules.get(key), attempt);
    schedules.set(key, schedule);
    for (const destination of earnedContextualUnlocks(schedule, attempt, thresholdMs)) unlocked.add(destination);
  }
  return unlocked;
}

/** Mastery does not bypass the selected word/format scope or content readiness. */
export function selectedContextualCards(
  wordCards: readonly PracticeCard[], readyContextualCards: readonly PracticeCard[], unlocks: ReadonlySet<string>,
  directEntryTargets: readonly { language: string; itemId: string }[] = [],
): PracticeCard[] {
  const selected = new Set(wordCards.filter(card => !isContextualExercise(card.exercise)).map(card =>
    JSON.stringify([card.item.language, card.item.id, answerFormat(card.exercise)])));
  const seen = new Set<string>();
  return readyContextualCards.filter(card => {
    const key = cardKey(card);
    const directSimple = card.exercise.startsWith('context-simple-') && directEntryTargets.some(target =>
      target.language === card.item.language && target.itemId === card.item.id);
    if (!isContextualExercise(card.exercise) || (!directSimple && !unlocks.has(key)) || seen.has(key) ||
        !selected.has(JSON.stringify([card.item.language, card.item.id, answerFormat(card.exercise)]))) return false;
    seen.add(key);
    return true;
  });
}
