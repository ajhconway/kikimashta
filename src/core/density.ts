import type { CardIdentity, PracticeAttempt, PracticeCard } from '../types';
import { cardKey } from './cards';
import { advanceSchedule, retrievability, schedulerVersion, type ScheduledWord } from './scheduler';

export const DENSITY_LEVELS = [
  { id: 'minimal', label: 'Minimal', threshold: 0 },
  { id: 'light', label: 'Light', threshold: 5 },
  { id: 'moderate', label: 'Moderate', threshold: 15 },
  { id: 'high', label: 'High', threshold: 30 },
  { id: 'intense', label: 'Intense', threshold: 60 },
] as const;
export type DensityLevel = typeof DENSITY_LEVELS[number]['id'];
export interface DensityRange { min: DensityLevel; max: DensityLevel }
/** Provisional workload preferences, separate from FSRS desired retention. */
export const DEFAULT_DENSITY_RANGE: DensityRange = { min: 'light', max: 'moderate' };
/** Provisional finite admission ceiling for the open-ended Intense display band. */
export const MAX_DENSITY_TARGET = 120;
/** Daily sessions stay at the same local time; each offset starts from the original date. */
export function forecastDayAt(now: number, day: number): number {
  if (day === 0) return now;
  const date = new Date(now);
  date.setDate(date.getDate() + day);
  return date.getTime();
}

export interface ForecastOptions {
  horizonDays?: number;
  scenarios?: number;
  seed?: number;
  /** Admission assumption for an unseen card's initial mini-quiz, not a measured retention rate. */
  lessonSuccessRate?: number;
}
export interface DensityForecast {
  reviewsPerDay: number;
  daily: number[];
  horizonDays: number;
  scenarios: number;
}
export interface LessonPlan {
  items: PracticeCard[];
  /** Forecast from the actual current schedules. */
  forecast: DensityForecast;
  /** Estimate after the proposed cards' initial mini-quiz; never saved as actual learning. */
  projectedForecast: DensityForecast;
  reason: 'below-min' | 'optional' | 'at-max' | 'exhausted' | 'capacity';
}
interface Options { horizonDays: number; scenarios: number; seed: number; lessonSuccessRate: number }

function optionsFor(options: ForecastOptions, now: number): Options {
  const config = { horizonDays: 7, scenarios: 32, seed: 5231, lessonSuccessRate: 0.8, ...options };
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new Error('Invalid forecast time.');
  if (!Number.isInteger(config.horizonDays) || config.horizonDays < 1 || config.horizonDays > 365 ||
      !Number.isInteger(config.scenarios) || config.scenarios < 1 || config.scenarios > 256 ||
      !Number.isInteger(config.seed) || !Number.isFinite(config.lessonSuccessRate) ||
      config.lessonSuccessRate < 0 || config.lessonSuccessRate > 1) throw new Error('Invalid forecast options.');
  return config;
}

export function densityLevel(reviewsPerDay: number): DensityLevel {
  if (!Number.isFinite(reviewsPerDay) || reviewsPerDay < 0) throw new Error('Invalid review density.');
  return [...DENSITY_LEVELS].reverse().find(level => reviewsPerDay >= level.threshold)!.id;
}

export function densityTargets(min: DensityLevel, max: DensityLevel): { minimum: number; maximum: number } {
  const minimumIndex = DENSITY_LEVELS.findIndex(level => level.id === min);
  const maximumIndex = DENSITY_LEVELS.findIndex(level => level.id === max);
  if (minimumIndex < 0 || maximumIndex < 0 || minimumIndex > maximumIndex) throw new Error('Invalid density range.');
  const minimum = DENSITY_LEVELS[minimumIndex]!.threshold;
  const maximum = DENSITY_LEVELS[maximumIndex + 1]?.threshold ?? MAX_DENSITY_TARGET;
  return { minimum, maximum };
}

/** Independent streams make estimates additive: adding a card cannot change existing cards' simulations. */
function randomFor(key: string, scenario: number, seed: number): () => number {
  let state = seed >>> 0;
  for (const character of `${key}:${scenario}`) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function simulatedAttempt({ itemId, language, exercise }: CardIdentity, at: number, correct: boolean): PracticeAttempt {
  return {
    id: 'forecast-only', sessionId: 'forecast-only', itemId, language,
    choiceIds: [itemId], selectedId: correct ? itemId : 'forecast-wrong-answer', correct,
    startedAt: at, answeredAt: at, responseMs: 0,
    context: { phase: 'review', exercise, recordingSrc: '', replays: 0, schedulerVersion },
  };
}

/**
 * A forecast assumes one session each local calendar day at the same local time,
 * with the due queue fixed at that session's start. Each card is reviewed at most once per simulated
 * day; short-interval retries wait until the next session. Existing overdue work
 * is counted on day zero. Future-dated reviews wait for their original review/due
 * times without rewriting schedules. They remain in the known-card set when
 * choosing new lesson cards.
 * No later new words are assumed unless explicitly admitted.
 *
 * Outcomes sample FSRS's recall estimates; these estimates describe this task only
 * after calibration. Daily attendance and a new card's initial success rate are explicit
 * policy assumptions, not guarantees about the user's future workload.
 */
async function cardContribution(
  key: string, initialize: (random: () => number) => Promise<ScheduledWord>, now: number, config: Options,
): Promise<number[]> {
  const daily = Array<number>(config.horizonDays).fill(0);
  for (let scenario = 0; scenario < config.scenarios; scenario++) {
    const random = randomFor(key, scenario, config.seed);
    let schedule = await initialize(random);
    for (let day = 0; day < config.horizonDays; day++) {
      const at = forecastDayAt(now, day);
      // A synced answer may come from a device whose wall clock is ahead.
      // Defer only this card until both its review and due times have arrived.
      if (schedule.dueAt > at || schedule.lastReviewedAt > at ||
          (schedule.card.lastReviewAt !== null && schedule.card.lastReviewAt > at)) continue;
      daily[day]! += 1 / config.scenarios;
      const probability = await retrievability(schedule, at);
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error('Invalid recall probability.');
      schedule = await advanceSchedule(schedule, simulatedAttempt(schedule, at, random() < probability));
    }
  }
  return daily;
}

function forecastFrom(daily: number[], config: Options): DensityForecast {
  return {
    daily, reviewsPerDay: daily.reduce((sum, reviews) => sum + reviews, 0) / config.horizonDays,
    horizonDays: config.horizonDays, scenarios: config.scenarios,
  };
}

export async function forecastDensity(schedules: ScheduledWord[], now: number, options: ForecastOptions = {}): Promise<DensityForecast> {
  const config = optionsFor(options, now);
  const daily = Array<number>(config.horizonDays).fill(0);
  const keys = new Set<string>();
  for (const schedule of schedules) {
    const key = cardKey(schedule);
    if (keys.has(key)) throw new Error('Duplicate scheduled card.');
    keys.add(key);
    const timestamps = [schedule.dueAt, schedule.lastReviewedAt, schedule.card.dueAt,
      ...(schedule.card.lastReviewAt === null ? [] : [schedule.card.lastReviewAt])];
    if (timestamps.some(value => !Number.isSafeInteger(value) || value < 0 ||
        !Number.isFinite(new Date(value).getTime()))) throw new Error('Invalid forecast schedule.');
    const contribution = await cardContribution(key, async () => schedule, now, config);
    contribution.forEach((count, day) => { daily[day]! += count; });
  }
  return forecastFrom(daily, config);
}

export async function planLessonChunk({
  schedules, candidates, now, range = DEFAULT_DENSITY_RANGE, chunkSize = 10, options = {},
}: {
  schedules: ScheduledWord[];
  candidates: PracticeCard[];
  now: number;
  range?: DensityRange;
  chunkSize?: number;
  options?: ForecastOptions;
}): Promise<LessonPlan> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 100) throw new Error('Invalid lesson chunk size.');
  const config = optionsFor(options, now);
  const { minimum, maximum } = densityTargets(range.min, range.max);
  const forecast = await forecastDensity(schedules, now, options);
  const result: LessonPlan = { items: [], forecast, projectedForecast: forecast, reason: 'at-max' };
  if (forecast.reviewsPerDay >= maximum) return result;
  const known = new Set(schedules.map(cardKey));
  const eligible = candidates.filter(card => {
    const key = cardKey(card);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
  if (!eligible.length) return { ...result, reason: 'exhausted' };
  result.reason = forecast.reviewsPerDay < minimum ? 'below-min' : 'optional';
  let projectedDaily = [...forecast.daily];
  for (const candidate of eligible.slice(0, chunkSize)) {
    // Hypothetical first answers seed possible states; previews alone never count as reviews.
    const identity = { itemId: candidate.item.id, language: candidate.item.language, exercise: candidate.exercise };
    const correct = simulatedAttempt(identity, now, true);
    correct.context = { ...correct.context!, phase: 'lesson' };
    const incorrect = { ...correct, correct: false, selectedId: 'forecast-wrong-answer' };
    const good = await advanceSchedule(undefined, correct);
    const again = await advanceSchedule(undefined, incorrect);
    const contribution = await cardContribution(cardKey(candidate), async random => (
      random() < config.lessonSuccessRate ? good : again
    ), now, config);
    const proposed = forecastFrom(projectedDaily.map((count, day) => count + contribution[day]!), config);
    // The next band's threshold is exclusive: max=Moderate stays below High.
    if (proposed.reviewsPerDay >= maximum - 1e-10) break;
    result.items.push(candidate);
    projectedDaily = proposed.daily;
    result.projectedForecast = proposed;
  }
  if (!result.items.length) result.reason = 'capacity';
  return result;
}
