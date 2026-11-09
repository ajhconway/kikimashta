import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { ProgressStore } from './progress/store';
import { practicePool } from './core/practice';
import { deriveSchedules, schedulerVersion } from './core/scheduler';
import type { PracticeAttempt } from './types';

vi.mock('./content/contextual-runtime', async original => {
  const actual = await original<typeof import('./content/contextual-runtime')>();
  const { withHistoricalJapanesePractice } = await import('./test/contextual-pilot');
  return withHistoricalJapanesePractice(actual);
});

const NOW = Date.UTC(2026, 10, 8, 12);
const name = 'clock-skew-regression';
let store: ProgressStore;
let clock: number;
const now = () => clock;
const random = () => 0.5;

function attempt(index: number, at: number): PracticeAttempt {
  const item = practicePool.items[index]!;
  return { id: 'attempt-' + index, sessionId: 'fixture', itemId: item.id, language: item.language,
    choiceIds: practicePool.items.slice(0, 4).map(word => word.id), selectedId: item.id, correct: true,
    startedAt: at, answeredAt: at, responseMs: 0,
    context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: item.audio[0]!.src, replays: 0, schedulerVersion } };
}
async function click(button: HTMLElement) { await act(async () => { fireEvent.click(button); }); }
async function start() {
  await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^start/i }));
}
beforeEach(() => {
  localStorage.clear(); clock = NOW; store = new ProgressStore(name);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(async () => { await store.close(); await deleteDB(name); });

it('allows ordinary reviews and lessons with valid synchronized history one minute ahead', async () => {
  const future = attempt(0, NOW + 60_000);
  const due = attempt(1, NOW - 86_400_000);
  await store.merge([future, due]);
  render(<App now={now} random={random} progressStore={store}/>);
  await start();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await click(screen.getByRole('button', { name: /begin review/i }));
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1');
  await click(screen.getByRole('button', { name: /kikimashta home/i }));
  await store.merge([{ ...due, id: 'due-completed', answeredAt: NOW, startedAt: NOW }]);
  await start();
  expect(await screen.findByRole('button', { name: /begin lesson/i })).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect((await store.all()).find(record => record.id === future.id)).toEqual(future);
});

it('keeps practice usable after a backward clock change and recovers due work without reload or retry', async () => {
  const original = attempt(0, NOW);
  await store.record(original);
  const [schedule] = await deriveSchedules([original], practicePool.language);
  render(<App now={now} random={random} progressStore={store}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
  clock = NOW - 60_000;
  await start();
  expect(screen.getByRole('button', { name: /begin lesson/i })).toBeEnabled();
  await click(screen.getByRole('button', { name: /kikimashta home/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
  clock = schedule!.dueAt;
  await start();
  expect(screen.getByRole('button', { name: /begin review/i })).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(await store.all()).toEqual([original]);
});
