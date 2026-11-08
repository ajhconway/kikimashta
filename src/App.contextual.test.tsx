import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import type { PracticeAttempt } from './types';
import { ProgressStore } from './progress/store';
import { advanceSchedule, schedulerVersion, type ScheduledWord } from './core/scheduler';
import { forecastDensity, planLessonChunk } from './core/density';
import { practicePool } from './core/practice';
import { contextualBanks } from './content/contextual-runtime';

vi.mock('./core/density', async original => ({ ...await original<typeof import('./core/density')>(), forecastDensity: vi.fn(), planLessonChunk: vi.fn() }));
const forecast = { reviewsPerDay: 0, daily: [0, 0, 0, 0, 0, 0, 0], horizonDays: 7, scenarios: 32 };
let history: PracticeAttempt[];
beforeEach(() => {
  window.history.replaceState({}, '', '/');
  localStorage.clear(); history = [];
  vi.spyOn(ProgressStore.prototype, 'history').mockImplementation(async () => structuredClone(history));
  vi.spyOn(ProgressStore.prototype, 'record').mockImplementation(async attempt => { history.push(attempt); });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.mocked(forecastDensity).mockResolvedValue(forecast);
  vi.mocked(planLessonChunk).mockImplementation(async ({ candidates }) => ({ items: candidates.filter(card => card.exercise === 'context-simple-text'), forecast, projectedForecast: forecast, reason: 'below-min' }));
});
async function click(element: HTMLElement) { await act(async () => { fireEvent.click(element); }); }

it('opens all eighty questions for dev evaluation and never records an answer', async () => {
  window.history.replaceState({}, '', '/?review=contextual');
  render(<App/>);
  const jump = screen.getByLabelText('Jump to question');
  expect(within(jump).getAllByRole('option')).toHaveLength(80);
  await act(async () => { fireEvent.change(jump, { target: { value: '79' } }); });
  expect(screen.getByText(/Question 80 of 80/)).toBeInTheDocument();
  await click(screen.getAllByRole('button', { name: /Choose writing/ })[0]!);
  expect(screen.getByRole('heading', { name: 'Sentence' })).toBeInTheDocument();
  await click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('heading', { name: 'Review complete' })).toBeInTheDocument();
  expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
  expect(planLessonChunk).not.toHaveBeenCalled();
  expect(history).toEqual([]);
});

it('admits unlocked contextual lessons through workload planning and saves explicit authored answers', async () => {
  const target = practicePool.items.find(item => item.text === '上')!;
  let schedule: ScheduledWord | undefined;
  for (let index = 0; index < 12; index++) {
    const at = schedule?.dueAt ?? 1000;
    const attempt: PracticeAttempt = { id: 'word-' + index, sessionId: 'old', itemId: target.id, language: target.language,
      choiceIds: [target.id, 'other'], selectedId: target.id, correct: true, startedAt: at, answeredAt: at, responseMs: 0,
      context: { phase: index === 0 ? 'lesson' : 'review', exercise: 'audio-picture', recordingSrc: target.audio[0]!.src, replays: 0, schedulerVersion } };
    history.push(attempt); schedule = await advanceSchedule(schedule, attempt);
    if (index > 0 && schedule.dueAt - at > 7 * 86_400_000) break;
  }
  const now = () => schedule!.lastReviewedAt + 1;
  const before = history.length;
  let draw = 0;
  const { container } = render(<App now={now} random={() => draw}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start/ })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^Start/ }));
  await click(await screen.findByRole('button', { name: 'Begin lesson' }));
  expect(vi.mocked(planLessonChunk).mock.calls[0]![0].candidates.some(card => card.item.id === target.id && card.exercise === 'context-simple-text')).toBe(true);
  expect(screen.getByRole('heading', { name: 'Sentence' })).toBeInTheDocument();
  expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
  const previewId = container.querySelector('.contextual-quiz')!.getAttribute('data-question-id');
  const previewSource = container.querySelector('.contextual-quiz audio')!.getAttribute('src');
  draw = 0.99;
  await click(screen.getByRole('button', { name: 'Mini-quiz' }));
  const id = container.querySelector('.contextual-quiz')!.getAttribute('data-question-id');
  expect(id).toBe(previewId);
  const authored = contextualBanks.flatMap(bank => bank.contexts).flatMap(context => context.questions).find(question => question.id === id)!;
  const correct = authored.options.find(option => option.id === authored.correctOptionId)!;
  expect(screen.queryByRole('heading', { name: 'Sentence' })).not.toBeInTheDocument();
  const answer = screen.getAllByRole('button', { name: /Choose writing/ }).find(button => within(button).queryByText(correct.text, { exact: true }))!;
  await click(answer);
  await waitFor(() => expect(history).toHaveLength(before + 1));
  const saved = history.at(-1)!;
  expect(saved.itemId).toBe(target.id);
  expect(saved.selectedId).toBe(authored.correctOptionId);
  expect(saved.context).toMatchObject({ phase: 'lesson', exercise: 'context-simple-text', contextual: { questionId: authored.id, correctOptionId: authored.correctOptionId, stage: 'simple' } });
  expect(saved.context!.recordingSrc).toBe(saved.context!.contextual!.sentenceSrc);
  expect(previewSource).toBe('/' + saved.context!.recordingSrc);
  expect(screen.getByRole('heading', { name: 'Sentence' })).toBeInTheDocument();
  await click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('heading', { name: 'Nice round!' })).toBeInTheDocument();
});
