import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import policy from '../content/contextual/pack-1/practice-policy.json';
import type { PracticeAttempt } from './types';
import { ProgressStore } from './progress/store';
import { advanceSchedule, deriveSchedules, schedulerVersion, type ScheduledWord } from './core/scheduler';
import { deriveContextualUnlocks } from './core/contextual-progression';
import { contextualBanks } from './content/contextual-runtime';
import { cardKey } from './core/cards';

// Accepted media is a test boundary only. Production still requires exact owner
// acceptance; use one small direct-only context per stage and synthetic URLs.
vi.mock('./content/contextual-runtime', async original => {
  const actual = await original<typeof import('./content/contextual-runtime')>();
  const { default: policy } = await import('../content/contextual/pack-1/practice-policy.json');
  const contexts = policy.contextualOnlyItemIds.flatMap(id => (['simple', 'contrastive'] as const).map(stage => {
    const context = actual.pack1ContextualBank.contexts.find(row => row.targetItemId === id && row.stage === stage)!;
    const question = context.questions[0]!;
    return { ...context, questions: [question], review: { text: 'approved' as const, audio: 'approved' as const },
      recordings: [{ id: 'test-voice', voice: 'otani', sentenceSrc: 'audio/test/sentence.mp3', questionSrcs: { [question.id]: 'audio/test/question.mp3' } }] };
  }));
  return { ...actual, contextualBanks: [{ ...actual.pack1ContextualBank, contexts }] };
});
vi.mock('./core/density', async original => {
  const actual = await original<typeof import('./core/density')>();
  const forecast = { reviewsPerDay: 0, daily: [0, 0, 0, 0, 0, 0, 0], horizonDays: 7, scenarios: 32 };
  return { ...actual, forecastDensity: vi.fn(async (schedules: { dueAt: number }[], at: number) => ({ ...forecast,
    daily: [schedules.filter(card => card.dueAt <= at).length, 0, 0, 0, 0, 0, 0],
  })), planLessonChunk: vi.fn(async ({ candidates, chunkSize = 10 }) => ({
    items: candidates.filter((card: { exercise: string }) => card.exercise.startsWith('context-')).slice(0, chunkSize),
    forecast, projectedForecast: forecast, reason: 'below-min',
  })) };
});
const DAY = 86_400_000;
const stores: ProgressStore[] = [];
beforeEach(() => {
  localStorage.clear(); window.history.replaceState({}, '', '/');
  localStorage.setItem('kikimashta-card-packs-v1', JSON.stringify(['ja-wanikani-1-writing']));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(async () => { vi.useRealTimers(); await Promise.all(stores.splice(0).map(store => store.close())); });
const click = async (element: HTMLElement) => { await act(async () => { fireEvent.click(element); }); };
async function answer(container: HTMLElement, store: ProgressStore) {
  const quiz = container.querySelector('.contextual-quiz')!;
  const id = quiz.getAttribute('data-question-id');
  const question = contextualBanks.flatMap(bank => bank.contexts).flatMap(context => context.questions).find(row => row.id === id)!;
  const correct = question.options.find(option => option.id === question.correctOptionId)!;
  await click(screen.getByRole('button', { name: 'Choose writing ' + correct.text }));
  // An IndexedDB read queued after the write waits for that transaction to
  // commit; flush the save notification before advancing the UI pause.
  await act(async () => { await store.history('ja-JP'); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
}

it('persists all three direct-only introductions, reloads due reviews, and earns contrastive access from actual spaced reviews', async () => {
  const name = 'pack1-direct-persisted';
  let store = new ProgressStore(name); stores.push(store);
  let at = 1_000_000;
  let view = render(<App progressStore={store} now={() => at} random={() => .3}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start/ })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^Start/ }));
  await click(screen.getByRole('button', { name: 'Begin review' }));
  expect(screen.queryByRole('button', { name: 'Begin lesson' })).not.toBeInTheDocument();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  for (let index = 0; index < 3; index++) await answer(view.container, store);
  vi.useRealTimers();
  const introduced = await store.history('ja-JP');
  expect(new Set(introduced.map(row => row.itemId))).toEqual(new Set(policy.contextualOnlyItemIds));
  expect(introduced).toHaveLength(3);
  expect(introduced.every(row => row.context?.phase === 'lesson' && row.context.exercise === 'context-simple-text')).toBe(true);
  expect(await deriveContextualUnlocks(introduced, 'ja-JP')).toEqual(new Set());
  view.unmount(); await store.close();

  // Replay genuine FSRS intervals and stop immediately before each qualifying
  // answer. The app, rather than a fabricated unlock, must save that answer.
  const beforeQualifying: PracticeAttempt[] = [];
  const due: number[] = [];
  for (const initial of introduced) {
    let schedule: ScheduledWord = await advanceSchedule(undefined, initial);
    for (let index = 0; index < 12; index++) {
      const time = schedule.dueAt;
      const review: PracticeAttempt = { ...initial, id: initial.itemId + '-review-' + index, sessionId: 'spaced', startedAt: time,
        answeredAt: time, context: { ...initial.context!, phase: 'review', schedulerVersion } };
      const next = await advanceSchedule(schedule, review);
      if (next.dueAt - next.lastReviewedAt > 7 * DAY) { due.push(time); break; }
      beforeQualifying.push(review); schedule = next;
    }
  }
  expect(due).toHaveLength(3);
  store = new ProgressStore(name); stores.push(store);
  await store.merge(beforeQualifying);
  expect(await deriveContextualUnlocks(await store.history('ja-JP'), 'ja-JP')).toEqual(new Set());
  at = Math.max(...due);
  view = render(<App progressStore={store} now={() => at} random={() => .3}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start · 3 reviews' })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^Start/ }));
  await click(screen.getByRole('button', { name: 'Begin review' }));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  for (let index = 0; index < 3; index++) {
    expect(view.container.querySelector('.contextual-quiz')).toHaveAttribute('data-exercise', 'context-simple-text');
    await answer(view.container, store);
  }
  vi.useRealTimers();
  const saved = await store.history('ja-JP');
  const newReviews = saved.filter(row => ![...introduced, ...beforeQualifying].some(old => old.id === row.id));
  expect(newReviews).toHaveLength(3);
  expect(newReviews.every(row => row.context?.phase === 'review' && row.context.exercise === 'context-simple-text')).toBe(true);
  const schedules = await deriveSchedules(saved, 'ja-JP');
  const unlocks = await deriveContextualUnlocks(saved, 'ja-JP');
  for (const itemId of policy.contextualOnlyItemIds) {
    expect(schedules.find(row => row.itemId === itemId)!.dueAt - schedules.find(row => row.itemId === itemId)!.lastReviewedAt).toBeGreaterThan(7 * DAY);
    expect(unlocks).toContain(cardKey({ language: 'ja-JP', itemId, exercise: 'context-contrastive-text' }));
  }
  expect(saved.some(row => row.context?.exercise === 'audio-text' || row.context?.exercise === 'audio-picture')).toBe(false);
  await click(screen.getByRole('button', { name: 'Finish' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start/ })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^Start/ }));
  await click(screen.getByRole('button', { name: 'Begin review' }));
  expect(view.container.querySelector('.contextual-quiz')).toHaveAttribute('data-exercise', 'context-contrastive-text');
}, 20_000);
