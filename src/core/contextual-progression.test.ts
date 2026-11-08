import { describe, expect, it } from 'vitest';
import type { ContextualExercise, Exercise, PracticeAttempt, PracticeCard, WordItem } from '../types';
import { cardKey } from './cards';
import { advanceSchedule, schedulerVersion, type ScheduledWord } from './scheduler';
import { CONTEXTUAL_MASTERY_INTERVAL_MS, deriveContextualUnlocks, earnedContextualUnlocks, selectedContextualCards } from './contextual-progression';

const DAY = 86_400_000;
function attempt(id: string, exercise: Exercise = 'audio-picture', at = 1000): PracticeAttempt {
  return { id, sessionId: 'session', itemId: 'water', language: 'ja-JP', choiceIds: ['teacher', 'student'], selectedId: 'teacher',
    correct: true, startedAt: at, answeredAt: at, responseMs: 0,
    context: { phase: 'review', exercise, recordingSrc: 'audio/sentence.mp3', replays: 0, schedulerVersion,
      ...(exercise.startsWith('context-') ? { contextual: { stage: exercise.includes('simple') ? 'simple' as const : 'contrastive' as const,
        contextId: 'water-at-school', contextRevision: 1, questionId: 'who-drinks', questionRevision: 2,
        kind: 'detail' as const, correctOptionId: 'teacher', sentenceSrc: 'audio/sentence.mp3', questionSrc: 'audio/question.mp3' } } : {}) } };
}
const key = (exercise: Exercise, itemId = 'water', language = 'ja-JP') => cardKey({ exercise, itemId, language });
async function scheduleFor(value: PracticeAttempt, interval: number): Promise<ScheduledWord> {
  const schedule = await advanceSchedule(undefined, value);
  return { ...schedule, dueAt: value.answeredAt + interval };
}

describe('contextual stage mastery', () => {
  it('uses the assigned interval strictly above seven days, regardless of elapsed time or stability', async () => {
    const value = attempt('word');
    const base = await scheduleFor(value, CONTEXTUAL_MASTERY_INTERVAL_MS);
    for (const interval of [7 * DAY - 1, 7 * DAY]) {
      expect(earnedContextualUnlocks({ ...base, dueAt: value.answeredAt + interval }, value)).toEqual([]);
    }
    expect(earnedContextualUnlocks({ ...base, dueAt: value.answeredAt + 7 * DAY + 1,
      card: { ...base.card, stability: 0 } }, value)).toEqual([key('context-simple-picture'), key('context-simple-text')]);
    expect(earnedContextualUnlocks({ ...base, dueAt: value.answeredAt + DAY,
      card: { ...base.card, stability: 1000 } }, value)).toEqual([]);
  });

  it.each(['audio-picture', 'audio-text'] as const)('either %s word review can unlock both simple formats', async exercise => {
    const value = attempt('word', exercise);
    expect(earnedContextualUnlocks(await scheduleFor(value, 8 * DAY), value))
      .toEqual([key('context-simple-picture'), key('context-simple-text')]);
  });

  it.each(['context-simple-picture', 'context-simple-text'] as const)('a %s review unlocks only its matching contrastive format', async exercise => {
    const value = attempt('simple', exercise);
    expect(earnedContextualUnlocks(await scheduleFor(value, 8 * DAY), value))
      .toEqual([key(exercise.replace('simple', 'contrastive') as ContextualExercise)]);
  });

  it('requires correct first scheduled-review evidence and matching saved identity', async () => {
    const original = attempt('word');
    const schedule = await scheduleFor(original, 8 * DAY);
    const variants = [
      { ...original, correct: false },
      { ...original, context: undefined },
      { ...original, context: { ...original.context!, phase: 'lesson' as const } },
      { ...original, context: { ...original.context!, retryOf: 'original-miss' } },
      { ...original, language: 'es-ES' },
      { ...original, itemId: 'coffee' },
      { ...original, answeredAt: original.answeredAt + 1 },
    ];
    for (const value of variants) expect(earnedContextualUnlocks(schedule, value)).toEqual([]);
    const simple = attempt('simple', 'context-simple-text');
    simple.context!.contextual = undefined;
    expect(earnedContextualUnlocks(await scheduleFor(simple, 8 * DAY), simple)).toEqual([]);
    const contrastive = attempt('contrastive', 'context-contrastive-text');
    expect(earnedContextualUnlocks(await scheduleFor(contrastive, 8 * DAY), contrastive)).toEqual([]);
  });

  it('replays real FSRS history, deduplicates it, and retains earned access after a later miss', async () => {
    const history: PracticeAttempt[] = [];
    let schedule: ScheduledWord | undefined;
    for (let index = 0; index < 12; index++) {
      const value = attempt('word-' + index, 'audio-text', schedule?.dueAt ?? 1000);
      if (!index) value.context!.phase = 'lesson';
      history.push(value);
      schedule = await advanceSchedule(schedule, value);
      if (value.context!.phase === 'review' && schedule.dueAt - schedule.lastReviewedAt > 7 * DAY) break;
    }
    expect(schedule!.dueAt - schedule!.lastReviewedAt).toBeGreaterThan(7 * DAY);
    const miss = { ...attempt('later-miss', 'audio-text', schedule!.dueAt), correct: false };
    history.push(miss, { ...attempt('retry', 'audio-text', miss.answeredAt + 1000), context: {
      ...miss.context!, retryOf: miss.id } });
    const expected = new Set([key('context-simple-picture'), key('context-simple-text')]);
    const snapshot = structuredClone(history);
    expect(await deriveContextualUnlocks([...history].reverse().concat(history[1]!), 'ja-JP')).toEqual(expected);
    expect(await deriveContextualUnlocks(history, 'es-ES')).toEqual(new Set());
    expect(history).toEqual(snapshot);
  });

  it('lessons, legacy and corrective retries cannot earn access even under a low configurable threshold', async () => {
    const lesson = attempt('lesson'); lesson.context!.phase = 'lesson';
    const legacy = { ...attempt('legacy'), context: undefined };
    const retry = attempt('retry'); retry.context!.retryOf = 'miss';
    expect(await deriveContextualUnlocks([lesson, legacy, retry], 'ja-JP', 0)).toEqual(new Set());
    const review = attempt('review');
    expect(await deriveContextualUnlocks([review], 'ja-JP', 0)).toEqual(new Set([key('context-simple-picture'), key('context-simple-text')]));
    for (const invalid of [-1, NaN, Infinity]) await expect(deriveContextualUnlocks([], 'ja-JP', invalid)).rejects.toThrow(/interval/);
  });
});

describe('contextual card admission scope', () => {
  it('admits only ready, unlocked cards within the selected language, target and answer format', () => {
    const item = { id: 'water', language: 'ja-JP' } as WordItem;
    const card = (exercise: Exercise, overrides: Partial<WordItem> = {}): PracticeCard => ({ item: { ...item, ...overrides }, exercise });
    const simple = card('context-simple-text');
    const contrastive = card('context-contrastive-text');
    const ready = [simple, contrastive, card('context-simple-picture'), card('context-simple-text', { id: 'coffee' }),
      card('context-simple-text', { language: 'es-ES' }), simple, card('audio-text')];
    const unlocked = new Set(ready.map(cardKey));
    expect(selectedContextualCards([card('audio-text')], ready, unlocked)).toEqual([simple, contrastive]);
    expect(selectedContextualCards([card('audio-text')], ready, new Set([cardKey(simple)]))).toEqual([simple]);
    expect(selectedContextualCards([], ready, unlocked)).toEqual([]);
    expect(selectedContextualCards([card('audio-text')], [], unlocked)).toEqual([]);
  });
});
