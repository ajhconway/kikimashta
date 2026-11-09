import { describe, expect, it, vi } from 'vitest';
import * as scheduler from './scheduler';
import type { Exercise, PracticeAttempt, PracticeCard } from '../types';
import { advanceSchedule, deriveSchedules, schedulerVersion, type ScheduledWord } from './scheduler';
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
  it('counts work due now during the second occurrence of a fall-back local hour', async () => {
    const now = new Date('2026-11-01T01:30:00-05:00').getTime();
    const learned = await introduced('repeated-hour', now - 2 * DAY_MS);
    const schedule = { ...learned, dueAt: now, card: { ...learned.card, dueAt: now } };
    expect((await forecastDensity([schedule], now, { scenarios: 1, horizonDays: 1 })).daily).toEqual([1]);
  });

  it.each([
    { name: 'fall-back', now: new Date(2026, 9, 31, 12).getTime(), due: new Date(2026, 10, 1, 11, 30).getTime(), expected: 1 },
    { name: 'spring-forward', now: new Date(2026, 2, 7, 12).getTime(), due: new Date(2026, 2, 8, 12, 30).getTime(), expected: 0 },
  ])('assigns a card around the $name session boundary to its local calendar day', async ({ now, due, expected }) => {
    const learned = await introduced('clock-change', now - 2 * DAY_MS);
    const schedule = { ...learned, dueAt: due, card: { ...learned.card, dueAt: due } };
    const original = structuredClone(schedule);
    const forecast = await forecastDensity([schedule], now, { scenarios: 1, horizonDays: 2 });
    expect(forecast.daily).toEqual([0, expected]);
    expect(schedule).toEqual(original);
  });

  it.each([
    { name: 'fall-back', year: 2026, month: 9, day: 31, hour: 1 },
    { name: 'spring-forward gap', year: 2026, month: 2, day: 7, hour: 2 },
  ])('simulates each $name review from the original local session time', async ({ year, month, day, hour }) => {
    const now = new Date(year, month, day, hour, 30).getTime();
    const learned = await introduced('daily-clock', now - 2 * DAY_MS);
    const schedule = { ...learned, dueAt: now, card: { ...learned.card, dueAt: now } };
    // Failures keep this card due at every daily session, exposing the actual
    // timestamps passed into the real scheduler rather than only testing labels.
    const recall = vi.spyOn(scheduler, 'retrievability').mockResolvedValue(0);
    const advance = vi.spyOn(scheduler, 'advanceSchedule');
    try {
      const forecast = await forecastDensity([schedule], now, { scenarios: 1, horizonDays: 4 });
      expect(forecast.daily).toEqual([1, 1, 1, 1]);
      expect(advance.mock.calls.map(([, attempt]) => attempt.answeredAt)).toEqual([
        new Date(year, month, day, hour, 30).getTime(),
        new Date(year, month, day + 1, hour, 30).getTime(),
        new Date(year, month, day + 2, hour, 30).getTime(),
        new Date(year, month, day + 3, hour, 30).getTime(),
      ]);
    } finally { recall.mockRestore(); advance.mockRestore(); }
  });

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

  it('defers future history while counting unrelated due work without changing schedules', async () => {
    const future = await introduced('future', NOW + 60_000);
    const due = await introduced('due', NOW - DAY_MS * 2);
    const schedules = [future, due];
    const original = structuredClone(schedules);
    const forecast = await forecastDensity(schedules, NOW, options);
    expect(forecast.daily[0]).toBe(1);
    const futureOnly = await forecastDensity([future], NOW, options);
    expect(futureOnly.daily[0]).toBe(0);
    expect(futureOnly.daily.slice(1).some(count => count > 0)).toBe(true);
    expect(await forecastDensity([due, future], NOW, options)).toEqual(forecast);
    const distant = await introduced('distant', NOW + 30 * DAY_MS);
    expect((await forecastDensity([distant], NOW, options)).daily).toEqual(Array(7).fill(0));
    expect(schedules).toEqual(original);
  });

  it('handles a backward clock and counts a legacy card only when its original due time arrives', async () => {
    const legacy = attempt('legacy', NOW);
    delete legacy.context;
    const [schedule] = await deriveSchedules([legacy], 'ja-JP');
    const original = structuredClone(schedule!);
    expect(schedule!.card.lastReviewAt).toBeNull();
    expect((await forecastDensity([schedule!], NOW - 60_000, { ...options, horizonDays: 1 })).daily).toEqual([0]);
    expect((await forecastDensity([schedule!], schedule!.dueAt, { ...options, horizonDays: 1 })).daily).toEqual([1]);
    expect(schedule).toEqual(original);
  });

  it('never simulates before a serialized review even when a due timestamp is earlier', async () => {
    const future = await introduced('future', NOW + 60_000);
    const schedule = { ...future, dueAt: NOW, lastReviewedAt: NOW, card: { ...future.card, dueAt: NOW } };
    expect((await forecastDensity([schedule], NOW, { ...options, horizonDays: 1 })).daily).toEqual([0]);
    expect((await forecastDensity([schedule], NOW + 60_000, { ...options, horizonDays: 1 })).daily).toEqual([1]);
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

  it('rejects invalid schedule timestamps while accepting representable future times', async () => {
    const schedule = await introduced();
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 8_640_000_000_000_001]) {
      const invalid = [
        { ...schedule, dueAt: value },
        { ...schedule, lastReviewedAt: value },
        { ...schedule, card: { ...schedule.card, dueAt: value } },
        { ...schedule, card: { ...schedule.card, lastReviewAt: value } },
      ];
      for (const word of invalid) await expect(forecastDensity([word], NOW, options)).rejects.toThrow(/invalid forecast schedule/i);
    }
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
  it('projects newly admitted lessons at calendar sessions through the spring-forward gap', async () => {
    const now = new Date(2026, 2, 7, 2, 30).getTime();
    const recall = vi.spyOn(scheduler, 'retrievability').mockResolvedValue(0);
    const advance = vi.spyOn(scheduler, 'advanceSchedule');
    try {
      const plan = await planLessonChunk({ schedules: [], candidates: [word('projected-clock')], now,
        options: { scenarios: 1, horizonDays: 4, lessonSuccessRate: 0 } });
      expect(plan.items).toHaveLength(1);
      expect(plan.projectedForecast.daily).toEqual([0, 1, 1, 1]);
      expect(advance.mock.calls.filter(([, attempt]) => attempt.context?.phase === 'review').map(([, attempt]) => attempt.answeredAt)).toEqual([
        new Date(2026, 2, 8, 2, 30).getTime(),
        new Date(2026, 2, 9, 2, 30).getTime(),
        new Date(2026, 2, 10, 2, 30).getTime(),
      ]);
    } finally { recall.mockRestore(); advance.mockRestore(); }
  });

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

  it('retains future cards as learned while admitting their unlearned sibling and unrelated cards', async () => {
    const picture = await introduced('known', NOW + 60_000);
    const plan = await planLessonChunk({ schedules: [picture],
      candidates: [word('known'), word('known', 'audio-text'), word('new')], now: NOW, options });
    expect(plan.items).toEqual([word('known', 'audio-text'), word('new')]);
    expect(plan.forecast.daily[0]).toBe(0);
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
