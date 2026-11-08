import { describe, expect, it } from 'vitest';
import type { PracticeAttempt } from '../types';
import { advanceSchedule, deriveSchedules, schedulerVersion, type ScheduledWord } from './scheduler';
import { answerOutcome, quizTimeLimit } from './quiz-timer';

const start = Date.parse('2026-01-01T12:00:00Z');
function attempt(overrides: Partial<PracticeAttempt> = {}): PracticeAttempt {
  return { id: 'lesson', sessionId: 'session', itemId: 'cat', language: 'ja-JP',
    choiceIds: ['cat', 'dog'], selectedId: 'cat', correct: true,
    startedAt: start - 1000, answeredAt: start, responseMs: 1000,
    context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: 'audio/cat.mp3', replays: 0, schedulerVersion },
    ...overrides };
}

describe('adaptive quiz timer policy', () => {
  it('starts untimed and shortens at explicit stability thresholds only for review cards', async () => {
    const learning = await advanceSchedule(undefined, attempt());
    expect(quizTimeLimit(undefined)).toBeNull();
    expect(quizTimeLimit(learning)).toBeNull();
    const review = { ...learning, card: { ...learning.card, scheduleStatus: 'review' as const } };
    for (const [stability, expected] of [[0, null], [.999, null], [1, 10000], [2.999, 10000], [3, 7000], [6.999, 7000], [7, 5000], [20.999, 5000], [21, 3000], [100, 3000], [NaN, null]] as const) {
      expect(quizTimeLimit({ ...review, card: { ...review.card, stability } })).toBe(expected);
    }
    for (const scheduleStatus of ['new', 'learning'] as const) {
      expect(quizTimeLimit({ ...review, card: { ...review.card, scheduleStatus, stability: 100 } })).toBeNull();
    }
  });

  it('keeps mastery specific to language, word, and exercise and relaxes timing after a lapse', async () => {
    const history: PracticeAttempt[] = [attempt()];
    let word: ScheduledWord = (await deriveSchedules(history, 'ja-JP'))[0]!;
    for (let i = 0; i < 5; i++) {
      const review = attempt({ id: 'review-' + i, answeredAt: word.dueAt,
        context: { ...attempt().context!, phase: 'review' } });
      history.push(review);
      word = await advanceSchedule(word, review);
    }
    history.push(attempt({ id: 'writing', context: { ...attempt().context!, exercise: 'audio-text' } }));
    history.push(attempt({ id: 'dog', itemId: 'dog' }));
    history.push(attempt({ id: 'french-cat', language: 'fr-FR' }));
    const schedules = await deriveSchedules(history, 'ja-JP');
    expect(schedules.map(schedule => [schedule.itemId, schedule.exercise, quizTimeLimit(schedule)])).toEqual([
      ['cat', 'audio-picture', 3000], ['cat', 'audio-text', null], ['dog', 'audio-picture', null],
    ]);
    expect(quizTimeLimit((await deriveSchedules(history, 'fr-FR'))[0])).toBeNull();
    const lapse = await advanceSchedule(word, attempt({ id: 'lapse', answeredAt: word.dueAt, correct: false, selectedId: 'dog', outcome: 'failure' }));
    expect(quizTimeLimit(lapse)).toBeNull();
  });

  it('accepts correct answers after expiry as partial and keeps wrong answers failures', () => {
    const timer = { limitMs: 7000, startedAt: start };
    expect(answerOutcome(true, undefined, start + 90000)).toBe('success');
    expect(answerOutcome(true, timer, start + 6999)).toBe('success');
    expect(answerOutcome(true, timer, start + 7000)).toBe('partial');
    expect(answerOutcome(true, timer, start + 90000)).toBe('partial');
    expect(answerOutcome(false, timer, start + 6999)).toBe('failure');
    expect(answerOutcome(false, timer, start + 90000)).toBe('failure');
    expect(answerOutcome(false, undefined, start)).toBe('failure');
    expect(timer).toEqual({ limitMs: 7000, startedAt: start });
  });
});
