import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import type { PracticeAttempt } from './types';
import { ProgressStore } from './progress/store';
import { advanceSchedule, schedulerVersion, type ScheduledWord } from './core/scheduler';
import { deriveContextualUnlocks } from './core/contextual-progression';
import { deriveSchedules } from './core/scheduler';
import { isContextualExercise } from './core/cards';
import { forecastDensity, planLessonChunk } from './core/density';
import { practicePool } from './core/practice';
import { contextualVocabulary, contextualBanks } from './content/contextual-runtime';

vi.mock('./content/contextual-runtime', async original => {
  const actual = await original<typeof import('./content/contextual-runtime')>();
  const { withHistoricalJapanesePractice } = await import('./test/contextual-pilot');
  return withHistoricalJapanesePractice(actual);
});

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
afterEach(() => { vi.useRealTimers(); });
async function click(element: HTMLElement) { await act(async () => { fireEvent.click(element); }); }


async function unlockedTarget() {
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
  return { schedule: schedule!, target };
}

it('introduces unlocked contexts directly in reviews while saving initial-learning evidence', async () => {
  const { schedule, target } = await unlockedTarget();
  const before = history.length;
  const { container } = render(<App now={() => schedule.lastReviewedAt + 1} random={() => 0}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start/ })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^Start/ }));
  expect(screen.queryByRole('button', { name: 'Begin lesson' })).not.toBeInTheDocument();
  await click(await screen.findByRole('button', { name: 'Begin review' }));
  expect(vi.mocked(planLessonChunk).mock.calls[0]![0]).toMatchObject({ chunkSize: 3 });
  expect(vi.mocked(planLessonChunk).mock.calls[0]![0].candidates.every(card => isContextualExercise(card.exercise))).toBe(true);
  expect(screen.queryByRole('heading', { name: 'Sentence' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Mini-quiz' })).not.toBeInTheDocument();
  expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
  const id = container.querySelector('.contextual-quiz')!.getAttribute('data-question-id');
  const authored = contextualBanks.flatMap(bank => bank.contexts).flatMap(context => context.questions).find(question => question.id === id)!;
  vi.useFakeTimers();
  await click(correctRenderedChoice(container));
  expect(history).toHaveLength(before + 1);
  const saved = history.at(-1)!;
  expect(saved.itemId).toBe(target.id);
  expect(saved.selectedId).toBe(authored.correctOptionId);
  expect(saved.context).toMatchObject({ phase: 'lesson', exercise: 'context-simple-text', contextual: { questionId: authored.id, correctOptionId: authored.correctOptionId, stage: 'simple' } });
  expect(saved.context!.recordingSrc).toBe(saved.context!.contextual!.sentenceSrc);
  expect(await deriveContextualUnlocks(history, target.language, 0)).not.toContain(JSON.stringify([target.language, target.id, 'context-contrastive-text']));
  expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  expect(screen.getByRole('heading', { name: 'Nice reviewing!' })).toBeInTheDocument();
});


function correctRenderedChoice(container: HTMLElement): HTMLElement {
  const id = container.querySelector('.contextual-quiz')!.getAttribute('data-question-id');
  const authored = contextualBanks.flatMap(bank => bank.contexts).flatMap(context => context.questions).find(question => question.id === id)!;
  const correct = authored.options.find(option => option.id === authored.correctOptionId)!;
  const format = container.querySelector('.contextual-quiz')!.getAttribute('data-exercise')!;
  return screen.getAllByRole('button', { name: /^Choose (picture|writing)/ }).find(button => format.endsWith('text')
    ? button.textContent === correct.text
    : within(button).getByRole('img').getAttribute('alt') === contextualVocabulary.find(word => word.id === correct.imageItemId)!.image.alt)!;
}

it('waits for a replay to finish before automatically advancing a correct contextual answer', async () => {
  const { container } = render(<App random={() => 0}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Dev review' })).toBeEnabled());
  await click(screen.getByRole('button', { name: 'Dev review' }));
  await click(screen.getByRole('checkbox', { name: 'Words · Pictures' }));
  await click(screen.getByRole('checkbox', { name: 'Words · Writing' }));
  await click(screen.getByRole('checkbox', { name: 'Simple contexts · Writing' }));
  await click(screen.getByRole('button', { name: 'Clear levels' }));
  await click(screen.getByRole('checkbox', { name: 'Learning' }));
  vi.useFakeTimers();
  await click(screen.getByRole('button', { name: 'Start dev review' }));
  const id = container.querySelector('.contextual-quiz')!.getAttribute('data-question-id');
  correctRenderedChoice(container).focus();
  await click(correctRenderedChoice(container));
  await act(async () => { await vi.advanceTimersByTimeAsync(1199); });
  expect(container.querySelector('.contextual-quiz')).toHaveAttribute('data-question-id', id);
  await click(screen.getByRole('button', { name: 'Replay sentence and question' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(container.querySelector('.contextual-quiz')).toHaveAttribute('data-question-id', id);
  await act(async () => { fireEvent.ended(container.querySelector('.contextual-quiz audio')!); await vi.advanceTimersByTimeAsync(650); });
  await act(async () => { fireEvent.ended(container.querySelector('.contextual-quiz audio')!); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1199); });
  expect(container.querySelector('.contextual-quiz')).toHaveAttribute('data-question-id', id);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(container.querySelector('.contextual-quiz')!.getAttribute('data-question-id')).not.toBe(id);
  expect(screen.getByRole('button', { name: 'Replay sentence and question' })).toHaveFocus();
  expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
});

it('holds a correct contextual answer after a failed save and advances after successful recovery', async () => {
  const { schedule } = await unlockedTarget();
  const onSaved = vi.fn();
  const { container } = render(<App now={() => schedule.lastReviewedAt + 1} random={() => 0} onSaved={onSaved}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start/ })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^Start/ }));
  await click(screen.getByRole('button', { name: 'Begin review' }));
  vi.mocked(ProgressStore.prototype.record).mockRejectedValueOnce(new Error('Offline storage'));
  vi.useFakeTimers();
  const id = container.querySelector('.contextual-quiz')!.getAttribute('data-question-id');
  await click(correctRenderedChoice(container));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(container.querySelector('.contextual-quiz')).toHaveAttribute('data-question-id', id);
  expect(screen.getByRole('alert')).toHaveTextContent("This answer hasn't been saved yet.");
  expect(onSaved).not.toHaveBeenCalled();
  await click(screen.getByRole('button', { name: 'Retry saving' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  expect(screen.getByRole('heading', { name: 'Nice reviewing!' })).toBeInTheDocument();
  expect(onSaved).toHaveBeenCalledOnce();
  expect(vi.mocked(ProgressStore.prototype.record).mock.calls[0]![0]).toEqual(vi.mocked(ProgressStore.prototype.record).mock.calls[1]![0]);
});


it('keeps first misses and corrective retries as initial learning, then records the later scheduled encounter as a review', async () => {
  const { schedule, target } = await unlockedTarget();
  let at = schedule.lastReviewedAt + 1;
  const { container } = render(<App now={() => at} random={() => 0}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start/ })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^Start/ }));
  await click(screen.getByRole('button', { name: 'Begin review' }));
  const correct = correctRenderedChoice(container);
  const wrong = screen.getAllByRole('button', { name: /Choose writing/ }).find(button => button !== correct)!;
  await click(wrong);
  const miss = history.at(-1)!;
  expect(miss.context).toMatchObject({ phase: 'lesson', exercise: 'context-simple-text' });
  const firstSource = miss.context!.recordingSrc;
  await click(screen.getByRole('button', { name: 'Continue' }));
  vi.useFakeTimers();
  await click(correctRenderedChoice(container));
  const retry = history.at(-1)!;
  expect(retry.context).toMatchObject({ phase: 'lesson', retryOf: miss.id, recordingSrc: firstSource, contextual: miss.context!.contextual });
  expect((await deriveSchedules(history, target.language)).find(card => card.exercise === 'context-simple-text'))
    .toEqual(await advanceSchedule(undefined, miss));
  expect(await deriveContextualUnlocks(history, target.language, 0)).not.toContain(JSON.stringify([target.language, target.id, 'context-contrastive-text']));
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  vi.useRealTimers();
  at = (await advanceSchedule(undefined, miss)).dueAt + 1;
  await click(screen.getByRole('button', { name: 'Finish' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start/ })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^Start/ }));
  await click(screen.getByRole('button', { name: 'Begin review' }));
  vi.useFakeTimers();
  await click(correctRenderedChoice(container));
  expect(history.at(-1)!.context).toMatchObject({ phase: 'review', exercise: 'context-simple-text' });
  expect(await deriveContextualUnlocks(history, target.language, 0)).toContain(JSON.stringify([target.language, target.id, 'context-contrastive-text']));
});

it('keeps due reviews available when workload defers new contexts', async () => {
  const { schedule } = await unlockedTarget();
  vi.mocked(planLessonChunk).mockResolvedValue({ items: [], forecast, projectedForecast: forecast, reason: 'at-max' });
  const { container } = render(<App now={() => schedule.dueAt + 1} random={() => 0}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start/ })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^Start/ }));
  await click(screen.getByRole('button', { name: 'Begin review' }));
  expect(container.querySelector('.quiz')).toHaveAttribute('data-exercise', 'audio-picture');
  expect(container.querySelector('.contextual-quiz')).not.toBeInTheDocument();
  expect(vi.mocked(planLessonChunk).mock.calls[0]![0].candidates.every(card => isContextualExercise(card.exercise))).toBe(true);
});

it('offers only word previews after the contextual review block', async () => {
  const { schedule } = await unlockedTarget();
  vi.mocked(planLessonChunk).mockImplementation(async ({ candidates }) => ({
    items: candidates.some(card => isContextualExercise(card.exercise)) ? candidates.filter(card => card.exercise === 'context-simple-text') : candidates.slice(0, 1),
    forecast, projectedForecast: forecast, reason: 'below-min',
  }));
  const { container } = render(<App now={() => schedule.lastReviewedAt + 1} random={() => 0}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start/ })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^Start/ }));
  await click(screen.getByRole('button', { name: 'Begin review' }));
  vi.useFakeTimers();
  await click(correctRenderedChoice(container));
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  expect(vi.mocked(planLessonChunk).mock.calls.at(-1)![0].candidates.every(card => !isContextualExercise(card.exercise))).toBe(true);
  await click(screen.getByRole('button', { name: 'Begin lesson' }));
  expect(container.querySelector('.preview-picture')).toBeInTheDocument();
  expect(container.querySelector('.contextual-quiz')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Replay word' })).toBeInTheDocument();
});

it('waits until the next Start to introduce contexts unlocked by the current review', async () => {
  const { target } = await unlockedTarget();
  const qualifying = history.pop()!;
  const { container } = render(<App now={() => qualifying.answeredAt} random={() => 0}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start/ })).toBeEnabled());
  expect(await deriveContextualUnlocks(history, target.language)).not.toContain(JSON.stringify([target.language, target.id, 'context-simple-text']));
  await click(screen.getByRole('button', { name: /^Start/ }));
  await click(screen.getByRole('button', { name: 'Begin review' }));
  expect(container.querySelector('.contextual-quiz')).not.toBeInTheDocument();
  await act(async () => { fireEvent.ended(container.querySelector('.app > audio')!); });
  vi.useFakeTimers();
  const answer = screen.getAllByRole('button', { name: /Choose picture/ })
    .find(button => within(button).getByRole('img').getAttribute('alt') === target.image.alt)!;
  await click(answer);
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  expect(screen.getByRole('heading', { name: 'Nice reviewing!' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Begin review' })).not.toBeInTheDocument();
  expect(container.querySelector('.contextual-quiz')).not.toBeInTheDocument();
  vi.useRealTimers();
  await click(screen.getByRole('button', { name: 'Finish' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start/ })).toBeEnabled());
  expect(await deriveContextualUnlocks(history, target.language)).toContain(JSON.stringify([target.language, target.id, 'context-simple-text']));
  await click(screen.getByRole('button', { name: /^Start/ }));
  await click(screen.getByRole('button', { name: 'Begin review' }));
  expect(container.querySelector('.contextual-quiz')).toBeInTheDocument();
  expect(history.at(-1)!.context?.phase).toBe('review');
});
