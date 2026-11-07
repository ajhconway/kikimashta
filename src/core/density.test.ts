import { describe, expect, it } from 'vitest';
import type { Exercise, PracticeAttempt, PracticeCard } from '../types';
import { advanceSchedule, schedulerVersion, type ScheduledWord } from './scheduler';
import { DENSITY_LEVELS, MAX_DENSITY_TARGET, densityLevel, densityTargets, forecastDensity, planLessonChunk } from './density';

const NOW = Date.UTC(2026, 10, 5, 12);
const DAY_MS = 86_400_000;
const options = { scenarios: 8 };
const word = (id: string, exercise: Exercise = 'audio-picture'): PracticeCard => ({ item: {
  id, language: 'ja-JP', theme: 'nature', label: id, text: id,
  image: { src: `images/${id}.svg`, source: 'generated', alt: id },
  audio: [{ src: `audio/${id}.mp3`, source: 'synthesized' }],
}, exercise });
function attempt(id: string, at: number, correct = true, exercise: Exercise = 'audio-picture'): PracticeAttempt {
  return { id, sessionId: 'test', itemId: id, language: 'ja-JP', choiceIds: [id, 'other'],
    selectedId: correct ? id : 'other', correct, startedAt: at, answeredAt: at, responseMs: 0,
    context: { phase: 'lesson', exercise, recordingSrc: 'audio/test.mp3', replays: 0, schedulerVersion },
  };
}
async function introduced(id = 'one', at = NOW, exercise: Exercise = 'audio-picture'): Promise<ScheduledWord> {
  return advanceSchedule(undefined, attempt(id, at, true, exercise));
}

describe('qualitative review density', () => {
  it('uses explicit workload thresholds and rejects reversed preferences', () => {
    expect(DENSITY_LEVELS.map(level => [level.id, level.threshold])).toEqual([
      ['minimal', 0], ['light', 5], ['moderate', 15], ['high', 30], ['intense', 60],
    ]);
    expect([0, 4.99, 5, 14.99, 15, 29.99, 30, 59.99, 60].map(densityLevel)).toEqual([
      'minimal', 'minimal', 'light', 'light', 'moderate', 'moderate', 'high', 'high', 'intense',
    ]);
    expect(densityTargets('light', 'moderate')).toEqual({ minimum: 5, maximum: 30 });
    expect(densityTargets('light', 'light')).toEqual({ minimum: 5, maximum: 15 });
    expect(densityTargets('intense', 'intense')).toEqual({ minimum: 60, maximum: MAX_DENSITY_TARGET });
    expect(() => densityTargets('moderate', 'light')).toThrow(/range/i);
    expect(() => densityLevel(Number.NaN)).toThrow();
  });
});

describe('future workload forecast', () => {
  it('counts both exercises of one word as independent additive review work', async () => {
    const picture = await introduced('same-word', NOW - DAY_MS);
    const writing = await introduced('same-word', NOW - DAY_MS, 'audio-text');
    const left = await forecastDensity([picture], NOW, options);
    const right = await forecastDensity([writing], NOW, options);
    const combined = await forecastDensity([picture, writing], NOW, options);
    expect(combined.daily[0]).toBe(2);
    combined.daily.forEach((count, day) => expect(count).toBe(left.daily[day]! + right.daily[day]!));
    expect(await forecastDensity([writing, picture], NOW, options)).toEqual(combined);
    await expect(forecastDensity([writing, writing], NOW, options)).rejects.toThrow(/duplicate/i);
  });

  it('counts overdue work immediately and repeats across later sessions without changing real schedules', async () => {
    const schedule = await introduced('one', NOW - DAY_MS * 2);
    const original = structuredClone(schedule);
    const forecast = await forecastDensity([schedule], NOW, { ...options, horizonDays: 7 });
    expect(forecast.daily[0]).toBe(1);
    expect(forecast.daily.reduce((sum, count) => sum + count, 0)).toBeGreaterThan(1);
    expect(forecast.daily.every(count => count >= 0 && count <= 1)).toBe(true);
    expect(forecast.reviewsPerDay).toBe(forecast.daily.reduce((sum, count) => sum + count, 0) / 7);
    expect(schedule).toEqual(original);
    expect(await forecastDensity([schedule], NOW, options)).toEqual(forecast);
  });

  it('honors the due-time boundary and leaves newly introduced work until another daily session', async () => {
    const schedule = await introduced();
    const dueNow = { ...schedule, dueAt: NOW, card: { ...schedule.card, dueAt: NOW } };
    expect((await forecastDensity([dueNow], NOW, { ...options, horizonDays: 1 })).daily).toEqual([1]);
    expect((await forecastDensity([schedule], NOW, { ...options, horizonDays: 1 })).daily).toEqual([0]);
    expect((await forecastDensity([schedule], NOW, { ...options, horizonDays: 2 })).daily[1]).toBe(1);
    const future = { ...schedule, dueAt: NOW + DAY_MS * 10, card: { ...schedule.card, dueAt: NOW + DAY_MS * 10 } };
    expect((await forecastDensity([future], NOW, options)).reviewsPerDay).toBe(0);
  });

  it('is additive and independent of input order while including sampled failures', async () => {
    const first = await introduced('first', NOW - 30 * DAY_MS);
    const second = await introduced('second', NOW - 30 * DAY_MS);
    const left = await forecastDensity([first], NOW, options);
    const right = await forecastDensity([second], NOW, options);
    const combined = await forecastDensity([first, second], NOW, options);
    combined.daily.forEach((count, day) => expect(count).toBe(left.daily[day]! + right.daily[day]!));
    expect(await forecastDensity([second, first], NOW, options)).toEqual(combined);
    expect(combined.daily.slice(1).some(count => count % 1 !== 0)).toBe(true);
    await expect(forecastDensity([first, first], NOW, options)).rejects.toThrow(/duplicate/i);
  });

  it('handles empty state and validates options rather than permitting an unbounded simulation', async () => {
    expect(await forecastDensity([], NOW, { horizonDays: 3, scenarios: 1 })).toEqual({
      daily: [0, 0, 0], reviewsPerDay: 0, horizonDays: 3, scenarios: 1,
    });
    for (const invalid of [{ scenarios: 0 }, { horizonDays: 0 }, { horizonDays: 1.5 }, { seed: 0.5 }, { lessonSuccessRate: 2 }]) {
      await expect(forecastDensity([], NOW, invalid)).rejects.toThrow(/options/i);
    }
  });
});

describe('lesson chunk admission', () => {
  it('admits writing for a known picture word and deduplicates by exercise', async () => {
    const picture = await introduced('known');
    const writing = word('known', 'audio-text');
    const plan = await planLessonChunk({ schedules: [picture], candidates: [word('known'), writing, writing], now: NOW, options });
    expect(plan.items).toEqual([writing]);
    expect(plan.projectedForecast.reviewsPerDay).toBeGreaterThan(plan.forecast.reviewsPerDay);
    const learnedWriting = await introduced('known', NOW, 'audio-text');
    const done = await planLessonChunk({ schedules: [picture, learnedWriting], candidates: [word('known'), writing], now: NOW, options });
    expect(done.items).toEqual([]);
    expect(done.reason).toBe('exhausted');
  });

  it('bounds mixed lesson size by cards rather than vocabulary items', async () => {
    const candidates = [word('one'), word('one', 'audio-text'), word('two'), word('two', 'audio-text')];
    const plan = await planLessonChunk({ schedules: [], candidates, now: NOW, chunkSize: 3, options });
    expect(plan.items).toEqual(candidates.slice(0, 3));
    expect(plan.projectedForecast.reviewsPerDay).toBeGreaterThan(0);
  });

  it('offers about ten new cards below minimum, with explicit initial-quiz assumptions and no actual learning writes', async () => {
    const candidates = Array.from({ length: 12 }, (_, index) => word('word-' + index));
    const original = structuredClone(candidates);
    const plan = await planLessonChunk({ schedules: [], candidates, now: NOW, options });
    expect(plan.items).toEqual(candidates.slice(0, 10));
    expect(plan.reason).toBe('below-min');
    expect(plan.forecast.reviewsPerDay).toBe(0);
    expect(plan.projectedForecast.reviewsPerDay).toBeGreaterThan(0);
    expect(plan.projectedForecast.daily[0]).toBe(0);
    expect(candidates).toEqual(original);
    expect(await planLessonChunk({ schedules: [], candidates, now: NOW, options })).toEqual(plan);
  });

  it('uses smaller chunks near capacity and never fabricates enough demand to hit the minimum', async () => {
    const candidates = Array.from({ length: 100 }, (_, index) => word('word-' + index));
    const plan = await planLessonChunk({ schedules: [], candidates, now: NOW,
      range: { min: 'minimal', max: 'minimal' }, chunkSize: 100, options });
    expect(plan.reason).toBe('optional');
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items.length).toBeLessThan(100);
    expect(plan.projectedForecast.reviewsPerDay).toBeLessThanOrEqual(5);
    const smallPool = await planLessonChunk({ schedules: [], candidates: [word('single')], now: NOW, options });
    expect(smallPool.items).toHaveLength(1);
    expect(smallPool.projectedForecast.reviewsPerDay).toBeLessThan(5);
  });

  it('excludes learned and duplicate cards and stops new intake at the maximum', async () => {
    const existing = await introduced('known');
    const plan = await planLessonChunk({ schedules: [existing], candidates: [word('known'), word('new'), word('new')], now: NOW, options });
    expect(plan.items.map(card => card.item.id)).toEqual(['new']);
    const noNew = await planLessonChunk({ schedules: [existing], candidates: [word('known')], now: NOW, options });
    expect(noNew.reason).toBe('exhausted');
    const busy = await Promise.all(Array.from({ length: 40 }, (_, index) => introduced('busy-' + index, NOW - DAY_MS)));
    const capped = await planLessonChunk({ schedules: busy, candidates: [word('new')], now: NOW,
      range: { min: 'minimal', max: 'minimal' }, options });
    expect(capped.reason).toBe('at-max');
    expect(capped.items).toEqual([]);
  });
});
