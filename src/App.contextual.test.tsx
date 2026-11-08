import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import type { PracticeAttempt } from './types';
import { ProgressStore } from './progress/store';
import { advanceSchedule, schedulerVersion, type ScheduledWord } from './core/scheduler';
import { forecastDensity, planLessonChunk } from './core/density';
import { practicePool } from './core/practice';
import { contextualVocabulary, contextualBanks } from './content/contextual-runtime';

vi.mock('./core/density', async original => ({ ...await original<typeof import('./core/density')>(), forecastDensity: vi.fn(), planLessonChunk: vi.fn() }));
const forecast = { reviewsPerDay: 0, daily: [0, 0, 0, 0, 0, 0, 0], horizonDays: 7, scenarios: 32 };
let history: PracticeAttempt[];
beforeEach(() => {
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

it('opens all eighty questions for dev evaluation and never records an answer', async () => {
  render(<App/>);
  await click(screen.getByRole('button', { name: 'Contextual dev review' }));
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
  const { schedule, target } = await unlockedTarget();
  const now = () => schedule!.lastReviewedAt + 1;
  const before = history.length;
  let draw = 0;
  const { container } = render(<App now={now} random={() => draw}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start/ })).toBeEnabled());
  expect(screen.getByText(/2 contextual cards are ready for lessons/)).toBeInTheDocument();
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
  vi.useFakeTimers();
  await click(answer);
  expect(history).toHaveLength(before + 1);
  const saved = history.at(-1)!;
  expect(saved.itemId).toBe(target.id);
  expect(saved.selectedId).toBe(authored.correctOptionId);
  expect(saved.context).toMatchObject({ phase: 'lesson', exercise: 'context-simple-text', contextual: { questionId: authored.id, correctOptionId: authored.correctOptionId, stage: 'simple' } });
  expect(saved.context!.recordingSrc).toBe(saved.context!.contextual!.sentenceSrc);
  expect(previewSource).toBe('/' + saved.context!.recordingSrc);
  expect(screen.queryByText('The book is on the desk.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  expect(screen.getByRole('heading', { name: 'Nice round!' })).toBeInTheDocument();
});


it('runs the actual contextual practice screen as an unsaved demo with retries and both answer formats', async () => {
  vi.useFakeTimers();
  const onSaved = vi.fn();
  const { container } = render(<App random={() => 0} onSaved={onSaved}/>);
  await click(screen.getByRole('button', { name: 'Contextual practice demo' }));
  expect(screen.getByLabelText('Practice demo. Progress is not saved.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Jump to question')).not.toBeInTheDocument();
  const seen = new Set<string>();
  let firstId: string | null = null;
  let firstSource: string | null = null;
  let retried = false;
  for (let step = 0; step < 5; step++) {
    const quiz = container.querySelector('.contextual-quiz')!;
    const id = quiz.getAttribute('data-question-id');
    const source = quiz.querySelector('audio')!.getAttribute('src');
    const authored = contextualBanks.flatMap(bank => bank.contexts).flatMap(context => context.questions).find(question => question.id === id)!;
    const correct = authored.options.find(option => option.id === authored.correctOptionId)!;
    const format = container.querySelector('.contextual-practice')!.getAttribute('data-exercise')!;
    seen.add(format);
    const buttons = screen.getAllByRole('button', { name: /^Choose (picture|writing)/ });
    const correctButton = format.endsWith('text') ? buttons.find(button => button.textContent === correct.text)! :
      buttons.find(button => within(button).getByRole('img').getAttribute('alt') === contextualVocabulary.find(word => word.id === correct.imageItemId)!.image.alt)!;
    if (step === 0) { firstId = id; firstSource = source; }
    else if (id === firstId) { expect(source).toBe(firstSource); retried = true; }
    await click(step === 0 ? buttons.find(button => button !== correctButton)! : correctButton);
    if (step === 0) {
      expect(screen.getByRole('button', { name: 'Show Japanese' })).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
      expect(container.querySelector('.contextual-quiz')!.getAttribute('data-question-id')).toBe(id);
      await click(screen.getByRole('button', { name: 'Continue' }));
    } else {
      expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    }
  }
  expect(retried).toBe(true);
  expect(seen).toEqual(new Set(['context-simple-picture', 'context-simple-text', 'context-contrastive-picture', 'context-contrastive-text']));
  expect(screen.getByRole('heading', { name: 'Contextual practice demo complete' })).toBeInTheDocument();
  expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
  expect(history).toEqual([]);
  await click(screen.getByRole('button', { name: 'Finish' }));
  expect(screen.getByRole('button', { name: /^Start/ })).toBeInTheDocument();
});

it('offers a direct contextual demo link even with no selected packs', async () => {
  window.history.replaceState({}, '', '/?demo=contextual');
  localStorage.setItem('kikimashta-card-packs-v1', '[]');
  try {
    render(<App random={() => 0}/>);
    expect(screen.getByRole('heading', { name: 'Contextual practice demo' })).toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Begin review' }));
    expect(screen.getByLabelText('Practice demo. Progress is not saved.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Jump to question')).not.toBeInTheDocument();
    expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
  } finally { window.history.replaceState({}, '', '/'); }
});


it('explains when workload defers unlocked contextual lessons while leaving the demo available', async () => {
  const { schedule } = await unlockedTarget();
  vi.mocked(forecastDensity).mockResolvedValue({ ...forecast, reviewsPerDay: 30 });
  render(<App now={() => schedule.lastReviewedAt + 1} random={() => 0}/>);
  await waitFor(() => expect(screen.getByText(/2 contextual cards are ready for lessons/)).toBeInTheDocument());
  expect(screen.getByText(/New lessons are waiting for your review workload to ease/)).toBeInTheDocument();
  await click(screen.getByRole('button', { name: 'Contextual practice demo' }));
  expect(screen.getByLabelText('Practice demo. Progress is not saved.')).toBeInTheDocument();
  expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
});


it('keeps Japanese contextual demos out of the Spanish practice language', async () => {
  localStorage.setItem('kikimashta-learning-language-v1', 'es-419');
  window.history.replaceState({}, '', '/?demo=contextual');
  try {
    render(<App/>);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Learning language' })).toHaveValue('es-419'));
    expect(screen.queryByRole('button', { name: 'Contextual practice demo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Contextual practice demo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Practice demo. Progress is not saved.')).not.toBeInTheDocument();
    expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
  } finally { window.history.replaceState({}, '', '/'); }
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
  vi.useFakeTimers();
  const { container } = render(<App random={() => 0}/>);
  await click(screen.getByRole('button', { name: 'Contextual practice demo' }));
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
  await click(screen.getByRole('button', { name: 'Begin lesson' }));
  await click(screen.getByRole('button', { name: 'Mini-quiz' }));
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
  expect(screen.getByRole('heading', { name: 'Nice round!' })).toBeInTheDocument();
  expect(onSaved).toHaveBeenCalledOnce();
  expect(vi.mocked(ProgressStore.prototype.record).mock.calls[0]![0]).toEqual(vi.mocked(ProgressStore.prototype.record).mock.calls[1]![0]);
});
