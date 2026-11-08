import { describe, expect, it } from 'vitest';
import type { CardIdentity, PracticeAttempt } from '../types';
import { cardKey } from './cards';
import { cardMastery, packMastery } from './mastery';
import { advanceSchedule, deriveSchedules, schedulerVersion } from './scheduler';

const reviewedAt = Date.parse('2026-01-01T12:00:00Z');
const hour = 60 * 60 * 1000;
const day = 24 * hour;
const identity: CardIdentity = { itemId: 'cat', language: 'ja-JP', exercise: 'audio-picture' };
const attempt: PracticeAttempt = {
  id: 'lesson', sessionId: 'session', itemId: identity.itemId, language: identity.language,
  choiceIds: ['cat', 'dog'], selectedId: 'cat', correct: true,
  startedAt: reviewedAt - 1000, answeredAt: reviewedAt, responseMs: 1000,
  context: { phase: 'lesson', exercise: identity.exercise, recordingSrc: 'audio/cat.mp3', replays: 0, schedulerVersion },
};

async function scheduled(gap: number) {
  const word = await advanceSchedule(undefined, attempt);
  return { ...word, dueAt: reviewedAt + gap };
}

describe('interval mastery (#135)', () => {
  it('uses the last-to-next scheduled gap at every boundary, independent of stability', async () => {
    const word = await scheduled(0);
    for (const [gap, label] of [
      [0, 'Learning'], [4 * hour - 1, 'Learning'],
      [4 * hour, 'Improving'], [day - 1, 'Improving'],
      [day, 'Familiar'], [7 * day - 1, 'Familiar'],
      [7 * day, 'Steady'], [30 * day - 1, 'Steady'],
      [30 * day, 'Strong'], [90 * day - 1, 'Strong'],
      [90 * day, 'Confident'], [365 * day - 1, 'Confident'],
      [365 * day, 'Mastered'], [2000 * day, 'Mastered'],
    ] as const) {
      expect(cardMastery({ ...word, dueAt: reviewedAt + gap, card: { ...word.card, stability: 9999 } }).label).toBe(label);
    }
    // Shift both review timestamps into the past: an overdue card keeps its level.
    const old = reviewedAt - 1000 * day;
    expect(cardMastery({ ...word, lastReviewedAt: old, dueAt: old + 30 * day,
      card: { ...word.card, lastReviewAt: old, stability: 0 } }).label).toBe('Strong');
  });

  it('keeps unseen and legacy-only cards New without inventing review evidence', async () => {
    expect(cardMastery(undefined).label).toBe('New');
    const word = await scheduled(day);
    expect(cardMastery({ ...word, card: { ...word.card, lastReviewAt: null } }).label).toBe('New');
    const legacy = { ...attempt, context: undefined };
    const legacyWord = (await deriveSchedules([legacy], identity.language))[0]!;
    expect(cardMastery(legacyWord).label).toBe('New');
  });

  it('does not assign mastery to invalid gaps', async () => {
    const word = await scheduled(0);
    for (const gap of [-1, NaN, Infinity]) {
      expect(cardMastery({ ...word, dueAt: reviewedAt + gap }).label).toBe('New');
    }
  });

  it('includes unlearned cards in the lowest and floor-average levels', async () => {
    const word = await scheduled(365 * day);
    const writing = { ...identity, exercise: 'audio-text' as const };
    const schedules = new Map([[cardKey(identity), word]]);
    expect(packMastery([identity, writing], schedules)).toMatchObject({
      lowest: { label: 'New' }, average: { label: 'Familiar' },
    });
    expect(packMastery([], schedules)).toMatchObject({ lowest: { label: 'New' }, average: { label: 'New' } });
    expect(packMastery([identity], schedules)).toMatchObject({ lowest: { label: 'Mastered' }, average: { label: 'Mastered' } });
  });

  it('aggregates only requested identities, separating languages, items, and exercises', async () => {
    const word = await scheduled(7 * day);
    const dog = { ...identity, itemId: 'dog' };
    const dogWord = { ...await scheduled(90 * day), ...dog };
    const schedules = new Map([[cardKey(identity), word], [cardKey(dog), dogWord]]);
    expect(packMastery([identity, dog], schedules)).toMatchObject({
      lowest: { label: 'Steady' }, average: { label: 'Strong' },
    });
    for (const unrelated of [
      { ...identity, exercise: 'audio-text' as const },
      { ...identity, language: 'fr-FR' },
      { ...identity, itemId: 'bird' },
    ]) {
      expect(packMastery([unrelated], schedules)).toMatchObject({ lowest: { label: 'New' }, average: { label: 'New' } });
    }
  });
});
