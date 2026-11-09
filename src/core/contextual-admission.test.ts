import { describe, expect, it } from 'vitest';
import type { Exercise, PracticeAttempt, PracticeCard } from '../types';
import { cardKey } from './cards';
import { CONTEXTUAL_INTRODUCTION_LIMIT, planContextualIntroductions } from './contextual-admission';
import { densityTargets } from './density';
import { advanceSchedule, schedulerVersion, type ScheduledWord } from './scheduler';

const NOW = Date.UTC(2026, 10, 8, 12);
const DAY_MS = 86_400_000;
function card(id: string, exercise: Exercise = 'context-simple-text', language = 'ja-JP'): PracticeCard {
  return { exercise, item: { id, language, theme: 'test', label: id, text: id,
    image: { src: `images/${id}.svg`, source: 'generated', alt: id },
    audio: [{ src: `audio/${id}.mp3`, source: 'synthesized' }] } };
}
async function introduced(value: PracticeCard, at = NOW): Promise<ScheduledWord> {
  const attempt: PracticeAttempt = { id: `initial-${cardKey(value)}`, sessionId: 'test', itemId: value.item.id,
    language: value.item.language, choiceIds: [value.item.id, 'other'], selectedId: value.item.id,
    correct: true, startedAt: at, answeredAt: at, responseMs: 0,
    context: { phase: 'lesson', exercise: value.exercise, recordingSrc: 'audio/test.mp3', replays: 0, schedulerVersion } };
  return advanceSchedule(undefined, attempt);
}

describe('contextual first-encounter admission', () => {
  it('admits at most three contextual cards in candidate order without mutating inputs', async () => {
    const cards = Array.from({ length: 6 }, (_, index) => card('context-' + index));
    const schedules = [await introduced(card('word', 'audio-picture'))];
    const before = structuredClone({ schedules, cards });
    const plan = await planContextualIntroductions({ schedules, cards, now: NOW });
    expect(CONTEXTUAL_INTRODUCTION_LIMIT).toBe(3);
    expect(plan.items).toEqual(cards.slice(0, 3));
    expect(plan.projectedForecast.reviewsPerDay).toBeGreaterThan(plan.forecast.reviewsPerDay);
    expect(await planContextualIntroductions({ schedules, cards, now: NOW })).toEqual(plan);
    expect({ schedules, cards }).toEqual(before);
  });

  it('filters word exercises and deduplicates before applying the cap', async () => {
    const first = card('same-word');
    const picture = card('same-word', 'context-simple-picture');
    const contrastive = card('same-word', 'context-contrastive-text');
    const cards = [card('word-a', 'audio-picture'), first, first, card('word-b', 'audio-text'), picture, picture, contrastive];
    const plan = await planContextualIntroductions({ schedules: [], cards, now: NOW });
    expect(plan.items).toEqual([first, picture, contrastive]);
    expect(new Set(plan.items.map(cardKey)).size).toBe(3);
  });

  it('never readmits scheduled cards, including future history, while admitting unknown sibling formats and stages', async () => {
    const known = card('known');
    const future = card('future', 'context-contrastive-picture');
    const schedules = [await introduced(known, NOW - DAY_MS), await introduced(future, NOW + 30 * DAY_MS)];
    const sibling = card('known', 'context-simple-picture');
    const nextStage = card('known', 'context-contrastive-text');
    const unrelated = card('unrelated');
    const plan = await planContextualIntroductions({ schedules, cards: [known, future, sibling, nextStage, unrelated], now: NOW });
    expect(plan.items).toEqual([sibling, nextStage, unrelated]);
    expect(plan.items.some(item => cardKey(item) === cardKey(future))).toBe(false);
  });

  it('keeps language identity separate when excluding known cards', async () => {
    const japanese = card('shared', 'context-simple-text', 'ja-JP');
    const spanish = card('shared', 'context-simple-text', 'es-419');
    const plan = await planContextualIntroductions({ schedules: [await introduced(japanese)], cards: [japanese, spanish], now: NOW });
    expect(plan.items).toEqual([spanish]);
  });

  it('counts every provided schedule toward the maximum, including ordinary word work', async () => {
    const schedules = await Promise.all(Array.from({ length: 40 }, (_, index) =>
      introduced(card('word-' + index, index % 2 ? 'audio-text' : 'audio-picture'), NOW - DAY_MS)));
    const range = { min: 'minimal', max: 'minimal' } as const;
    const plan = await planContextualIntroductions({ schedules, cards: [card('new-context')], now: NOW, range });
    expect(plan.reason).toBe('at-max');
    expect(plan.forecast.reviewsPerDay).toBeGreaterThanOrEqual(densityTargets(range.min, range.max).maximum);
    expect(plan.items).toEqual([]);
    expect(plan.projectedForecast).toEqual(plan.forecast);
  });

  it('uses remaining projected capacity for a smaller introduction block', async () => {
    const schedules = await Promise.all(Array.from({ length: 26 }, (_, index) =>
      introduced(card('busy-' + index, 'audio-picture'), NOW - DAY_MS)));
    const range = { min: 'minimal', max: 'minimal' } as const;
    const cards = Array.from({ length: 5 }, (_, index) => card('new-' + index));
    const plan = await planContextualIntroductions({ schedules, cards, now: NOW, range });
    expect(plan.forecast.reviewsPerDay).toBeLessThan(5);
    expect(plan.projectedForecast.reviewsPerDay).toBeLessThan(5);
    expect(plan.items).toEqual(cards.slice(0, 2));
    expect(plan.reason).toBe('optional');
  });

  it('defers introductions when the next card would reach the ceiling even though current demand is below it', async () => {
    const schedules = await Promise.all(Array.from({ length: 29 }, (_, index) =>
      introduced(card('busy-' + index, 'audio-picture'), NOW - DAY_MS)));
    const plan = await planContextualIntroductions({ schedules, cards: [card('new-0')], now: NOW,
      range: { min: 'minimal', max: 'minimal' } });
    expect(plan.forecast.reviewsPerDay).toBeLessThan(5);
    expect(plan.items).toEqual([]);
    expect(plan.reason).toBe('capacity');
    expect(plan.projectedForecast).toEqual(plan.forecast);
  });

  it('returns an empty plan for no contextual candidates or already known cards', async () => {
    for (const cards of [[], [card('word', 'audio-picture'), card('writing', 'audio-text')]]) {
      const plan = await planContextualIntroductions({ schedules: [], cards, now: NOW });
      expect(plan.items).toEqual([]);
      expect(plan.reason).toBe('exhausted');
      expect(plan.forecast.reviewsPerDay).toBe(0);
    }
    const known = card('known');
    const plan = await planContextualIntroductions({ schedules: [await introduced(known)], cards: [known, known], now: NOW });
    expect(plan.items).toEqual([]);
    expect(plan.reason).toBe('exhausted');
  });
});
