import { describe, expect, it } from 'vitest';
import type { PracticeAttempt } from '../types';
import { advanceSchedule, deriveSchedules, retrievability, schedulerVersion, snapshotDue, type ScheduledWord } from './scheduler';

const start = Date.parse('2026-01-01T12:00:00Z');
const day = 86_400_000;
function attempt(overrides: Partial<PracticeAttempt> = {}): PracticeAttempt {
  return {
    id: 'a', sessionId: 'session', itemId: 'cat', language: 'ja-JP',
    choiceIds: ['cat', 'dog', 'cup', 'apple'], selectedId: 'cat', correct: true,
    startedAt: start - 2000, answeredAt: start, responseMs: 2000,
    context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: 'audio/cat.mp3', replays: 0, schedulerVersion },
    ...overrides,
  };
}

async function established(): Promise<ScheduledWord> {
  let word = await advanceSchedule(undefined, attempt());
  for (let i = 1; i <= 3; i++) {
    word = await advanceSchedule(word, attempt({ id: 'review-' + i, answeredAt: word.dueAt, context: { ...attempt().context!, phase: 'review' } }));
  }
  return word;
}

describe('FSRS listening schedules', () => {
  it('retains corrective retries in history without letting them overwrite a miss or a later normal review', async () => {
    const lesson = attempt();
    const miss = attempt({ id: 'miss', answeredAt: start + day, correct: false, selectedId: 'dog',
      context: { ...lesson.context!, phase: 'review' } });
    const repeatedMiss = attempt({ id: 'correction-miss', answeredAt: start + day + 60000, correct: false, selectedId: 'dog',
      context: { ...miss.context!, retryOf: miss.id } });
    const correction = attempt({ id: 'correction-pass', answeredAt: start + day + 120000,
      context: { ...miss.context!, retryOf: miss.id } });
    const history = [correction, lesson, repeatedMiss, miss];
    const original = structuredClone(history);
    const afterMiss = await deriveSchedules([lesson, miss], 'ja-JP');
    expect(await deriveSchedules(history, 'ja-JP')).toEqual(afterMiss);
    expect(snapshotDue(afterMiss, ['cat'], correction.answeredAt)).toEqual(['cat']);
    const later = attempt({ id: 'later-review', answeredAt: start + 3 * day, context: { ...miss.context! } });
    expect(await deriveSchedules([...history, later], 'ja-JP')).toEqual(await deriveSchedules([lesson, miss, later], 'ja-JP'));
    expect(history).toEqual(original);
    expect(history).toHaveLength(4);
  });

  it('safely surfaces orphan corrective history as a due new word without retention evidence', async () => {
    const first = attempt({ id: 'orphan-1', context: { ...attempt().context!, retryOf: 'missing-original' } });
    const last = attempt({ id: 'orphan-2', answeredAt: start + 120000, context: { ...first.context! } });
    const history = [last, first];
    const original = structuredClone(history);
    const words = await deriveSchedules(history, 'ja-JP');
    expect(words).toHaveLength(1);
    expect(words[0]!.card).toMatchObject({ reps: 0, stability: 0, lastReviewAt: null, scheduleStatus: 'new' });
    expect(words[0]!.dueAt).toBe(last.answeredAt);
    expect(snapshotDue(words, ['cat'], last.answeredAt)).toEqual(['cat']);
    expect(await retrievability(words[0]!, last.answeredAt + day)).toBe(0);
    expect(history).toEqual(original);
  });

  it('initializes success and failure through FSRS with shorter relearning after a miss', async () => {
    const good = await advanceSchedule(undefined, attempt());
    const missed = await advanceSchedule(undefined, attempt({ correct: false, selectedId: 'dog' }));
    expect(good.itemId).toBe('cat');
    expect(good.language).toBe('ja-JP');
    expect(good.schedulerVersion).toBe(schedulerVersion);
    expect(good.dueAt).toBeGreaterThan(start);
    expect(missed.dueAt).toBeLessThan(good.dueAt);
    expect(missed.card.stability).toBeLessThan(good.card.stability);
    expect(good.card.lastReviewAt).toBe(start);
    expect(good.card.reps).toBe(1);
    expect(JSON.parse(JSON.stringify(good))).toEqual(good);
  });

  it('responds differently to remembering and forgetting an established word after a gap', async () => {
    const word = await established();
    const original = structuredClone(word);
    const when = word.dueAt + 10 * day;
    const good = await advanceSchedule(word, attempt({ answeredAt: when }));
    const missed = await advanceSchedule(word, attempt({ answeredAt: when, correct: false, selectedId: 'dog' }));
    expect(good.dueAt).toBeGreaterThan(missed.dueAt);
    expect(good.card.stability).toBeGreaterThan(missed.card.stability);
    expect(missed.card.lapses).toBeGreaterThan(word.card.lapses);
    expect(word).toEqual(original);
  });

  it('does not assign subjective difficulty grades from response speed or replay use', async () => {
    const first = attempt();
    const slow = attempt({ responseMs: 90000, startedAt: start - 90000, context: { ...first.context!, replays: 5 } });
    expect(await advanceSchedule(undefined, slow)).toEqual(await advanceSchedule(undefined, first));
  });

  it('replays modern history deterministically across order, duplicate IDs, and languages', async () => {
    const first = attempt();
    const later = attempt({ id: 'b', answeredAt: start + day, context: { ...first.context!, phase: 'review' } });
    const french = attempt({ id: 'fr', language: 'fr-FR' });
    const history = [later, french, first, first];
    const original = structuredClone(history);
    const direct = await advanceSchedule(await advanceSchedule(undefined, first), later);
    expect(await deriveSchedules(history, 'ja-JP')).toEqual([direct]);
    expect(await deriveSchedules([...history].reverse(), 'ja-JP')).toEqual([direct]);
    expect(await deriveSchedules(history, 'es-ES')).toEqual([]);
    expect(history).toEqual(original);
  });

  it('keeps massed legacy quizzes due without manufacturing long-term retention evidence', async () => {
    const history = [
      attempt({ id: 'old-1', context: undefined }),
      attempt({ id: 'old-2', answeredAt: start + 10000, context: undefined }),
      attempt({ id: 'old-3', answeredAt: start + 20000, correct: false, context: undefined }),
    ];
    const original = structuredClone(history);
    const words = await deriveSchedules(history, 'ja-JP');
    expect(words).toHaveLength(1);
    expect(words[0]!.dueAt).toBe(start + 20000);
    expect(words[0]!.card).toMatchObject({ lastReviewAt: null, reps: 0, stability: 0, scheduleStatus: 'new' });
    expect(snapshotDue(words, ['cat'], start + 20000)).toEqual(['cat']);
    expect(history).toEqual(original);
    const modern = attempt({ id: 'new-1', answeredAt: start + day, context: { ...attempt().context!, phase: 'review' } });
    const staleClient = attempt({ id: 'old-later', answeredAt: start + 2 * day, context: undefined });
    expect(await deriveSchedules([...history, modern, staleClient], 'ja-JP')).toEqual(await deriveSchedules([modern], 'ja-JP'));
  });

  it('takes an eligible, due-ordered snapshot with exact boundary inclusion', async () => {
    const base = await advanceSchedule(undefined, attempt());
    const schedules = [
      { ...base, itemId: 'future', dueAt: start + 1 },
      { ...base, itemId: 'zebra', dueAt: start },
      { ...base, itemId: 'apple', dueAt: start },
      { ...base, itemId: 'oldest', dueAt: start - 1 },
      { ...base, itemId: 'excluded', dueAt: start - 10 },
    ];
    const original = structuredClone(schedules);
    const ids = ['future', 'zebra', 'apple', 'oldest'];
    const queue = snapshotDue(schedules, ids, start);
    expect(queue).toEqual(['oldest', 'apple', 'zebra']);
    expect(snapshotDue(schedules, ids, start + 1)).toContain('future');
    expect(queue).not.toContain('future');
    expect(schedules).toEqual(original);
  });

  it('predicts declining retrievability over time and makes no retention claim for legacy cards', async () => {
    const word = await established();
    const atReview = await retrievability(word, word.lastReviewedAt);
    const muchLater = await retrievability(word, word.lastReviewedAt + 100 * day);
    expect(atReview).toBe(1);
    expect(muchLater).toBeGreaterThan(0);
    expect(muchLater).toBeLessThan(atReview);
    const legacy = (await deriveSchedules([attempt({ context: undefined })], 'ja-JP'))[0]!;
    expect(await retrievability(legacy, start + day)).toBe(0);
  });

  it('rejects incompatible state and backwards reviews rather than silently corrupting history', async () => {
    const word = await advanceSchedule(undefined, attempt());
    await expect(advanceSchedule(word, attempt({ itemId: 'dog' }))).rejects.toThrow(/another word/i);
    await expect(advanceSchedule(word, attempt({ language: 'fr-FR' }))).rejects.toThrow(/another word/i);
    await expect(advanceSchedule(word, attempt({ answeredAt: start - 1 }))).rejects.toThrow(/chronological/i);
    await expect(advanceSchedule({ ...word, schedulerVersion: 'unsupported' }, attempt())).rejects.toThrow(/version/i);
    await expect(advanceSchedule(undefined, attempt({ answeredAt: NaN }))).rejects.toThrow(/time/i);
  });
});
