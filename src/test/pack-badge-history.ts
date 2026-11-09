import { advanceSchedule, schedulerVersion, type ScheduledWord } from '../core/scheduler';
import { masteryIndex } from '../core/mastery';
import type { PracticeAttempt, PracticeCard } from '../types';

/** Small real FSRS history for an entire approved pack; shared by component and browser checks. */
export async function badgeHistory(cards: readonly PracticeCard[], packId: string, targetLevel = 3): Promise<PracticeAttempt[]> {
  const attempts: PracticeAttempt[] = [];
  for (const { item, exercise } of cards) {
    let schedule: ScheduledWord | undefined;
    for (let step = 0; masteryIndex(schedule) < targetLevel && step < 20; step++) {
      const at = schedule?.dueAt ?? Date.parse('2020-01-01T12:00:00Z');
      const attempt: PracticeAttempt = { id: `${packId}-${item.id}-${step}`, sessionId: 'badge-fixture', itemId: item.id, language: item.language,
        choiceIds: [item.id], selectedId: item.id, correct: true, startedAt: at - 100, answeredAt: at, responseMs: 100,
        context: { phase: step ? 'review' : 'lesson', exercise, recordingSrc: item.audio[0]!.src, replays: 0, schedulerVersion } };
      attempts.push(attempt); schedule = await advanceSchedule(schedule, attempt);
    }
    if (masteryIndex(schedule) < targetLevel) throw new Error('Fixture did not reach the requested level.');
  }
  return attempts;
}
