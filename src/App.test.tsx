import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ProgressStore } from './progress/store';
import { practicePool } from './core/practice';
import { forecastDensity, planLessonChunk } from './core/density';
import type { PracticeAttempt } from './types';
import { quizFeedbackColors, themeColors } from './themes';

vi.mock('./core/density', async importOriginal => {
  const actual = await importOriginal<typeof import('./core/density')>();
  return { ...actual, forecastDensity: vi.fn(), planLessonChunk: vi.fn() };
});
const fixedNow = () => 1_000_000;
let records: PracticeAttempt[];
const forecast = { reviewsPerDay: 0, daily: [0, 0, 0, 0, 0, 0, 0], horizonDays: 7, scenarios: 32 };
function legacy(count = 6): PracticeAttempt[] {
  return practicePool.items.slice(0, count).map((item, i) => ({
    id: 'old-' + i, sessionId: 'old-session', itemId: item.id, language: item.language,
    choiceIds: practicePool.items.slice(0, 4).map(word => word.id), selectedId: item.id,
    correct: true, startedAt: 900, answeredAt: 1000 + i, responseMs: 100,
  }));
}
beforeEach(() => {
  localStorage.clear(); records = [];
  vi.spyOn(ProgressStore.prototype, 'history').mockImplementation(async () => [...records]);
  vi.spyOn(ProgressStore.prototype, 'record').mockImplementation(async attempt => { records.push(attempt); });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.mocked(forecastDensity).mockResolvedValue(forecast);
  vi.mocked(planLessonChunk).mockImplementation(async ({ candidates }) => ({
    items: candidates.slice(0, 10), forecast, projectedForecast: forecast,
    reason: candidates.length ? 'below-min' : 'exhausted',
  }));
});
afterEach(() => { vi.useRealTimers(); });

function heardChoice(container: HTMLElement, correct = true) {
  const source = container.querySelector('audio')!.getAttribute('src');
  const target = practicePool.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  return screen.getAllByRole('button', { name: /choose picture/i }).find(button =>
    Boolean(within(button).queryByRole('img', { name: target.image.alt })) === correct,
  )!;
}
async function click(button: HTMLElement) { await act(async () => { fireEvent.click(button); }); }
async function start() {
  await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^start/i }));
}
async function review(options: { now?: () => number; count?: number } = {}) {
  records = legacy(options.count ?? 6);
  const view = render(<App now={options.now ?? fixedNow} random={() => 0.5}/>);
  await start();
  await click(await screen.findByRole('button', { name: /begin review/i }));
  return view;
}
function endAudio(container: HTMLElement) { fireEvent.ended(container.querySelector('audio')!); }
async function advance(ms: number) { await act(async () => { vi.advanceTimersByTime(ms); }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('adaptive session flow', () => {
  it('starts a random dev review with no due words, retries misses, and leaves saved progress untouched', async () => {
    const { container } = render(<App now={fixedNow} random={() => 0.5}/>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dev review' })).toBeEnabled());
    await click(screen.getByRole('button', { name: 'Dev review' }));
    vi.useFakeTimers();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '6');
    expect(screen.getAllByRole('button', { name: /choose picture/i })).toHaveLength(4);
    await click(heardChoice(container, false));
    expect(screen.getByRole('status', { name: 'Mistakes' })).toHaveTextContent('1 incorrect answer');
    await click(screen.getByRole('button', { name: /^continue$/i }));
    const completed = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const choice = heardChoice(container);
      const picture = within(choice).getByRole('img').getAttribute('alt')!;
      expect(completed.has(picture)).toBe(false); completed.add(picture);
      endAudio(container); await click(choice); await advance(1200);
    }
    expect(completed.size).toBe(6);
    expect(screen.getByRole('heading', { name: 'Dev review complete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /begin lesson|learn more/i })).not.toBeInTheDocument();
    expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
    expect(planLessonChunk).not.toHaveBeenCalled();
    expect(records).toEqual([]);
    vi.useRealTimers();
    await click(screen.getByRole('button', { name: /^finish$/i }));
    await start();
    expect(screen.getByRole('button', { name: /begin lesson/i })).toBeInTheDocument();
  });

  it('keeps existing history when leaving a dev review and restores normal due reviews', async () => {
    records = legacy(2);
    const original = structuredClone(records);
    const { container } = render(<App now={fixedNow} random={() => 0.5}/>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dev review' })).toBeEnabled());
    await click(screen.getByRole('button', { name: 'Dev review' }));
    await click(heardChoice(container));
    await click(screen.getByRole('button', { name: /kikimashta home/i }));
    expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
    expect(records).toEqual(original);
    await start();
    expect(screen.getByText('2 words')).toBeInTheDocument();
    await click(screen.getByRole('button', { name: /begin review/i }));
    await click(heardChoice(container));
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(3);
  });

  it('introduces ten new words before a mini-quiz of those words and records initial-learning context', async () => {
    const { container } = render(<App now={fixedNow} random={() => 0.5}/>);
    await start();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await click(await screen.findByRole('button', { name: /begin lesson/i }));
    const items = practicePool.items.slice(0, 10);
    for (let i = 0; i < items.length; i++) {
      expect(screen.getByRole('img')).toHaveAttribute('alt', items[i]!.image.alt);
      expect(items[i]!.audio.map(recording => '/' + recording.src)).toContain(container.querySelector('audio')!.getAttribute('src'));
      expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
      await click(screen.getByRole('button', { name: i === 9 ? /mini-quiz/i : /next word/i }));
    }
    const choices = screen.getAllByRole('button', { name: /choose picture/i });
    expect(choices).toHaveLength(4);
    expect(choices.every(button => items.some(item => item.image.alt === within(button).getByRole('img').getAttribute('alt')))).toBe(true);
    await click(heardChoice(container));
    expect(records).toHaveLength(1);
    expect(records[0]!.context).toMatchObject({ phase: 'lesson', exercise: 'audio-picture', replays: 0, schedulerVersion: 'fsrs-6-v1' });
    expect(items.some(item => item.id === records[0]!.itemId)).toBe(true);
  });

  it('keeps the due-word snapshot while requiring missed words to be answered correctly', async () => {
    let clock = fixedNow();
    records = [...legacy(2), { ...legacy(3)[2]!, answeredAt: clock + 1000 }];
    const { container } = render(<App now={() => clock} random={() => 0.5}/>);
    await start();
    expect(await screen.findByText('2 words')).toBeInTheDocument();
    await click(screen.getByRole('button', { name: /begin review/i }));
    vi.useFakeTimers();
    clock += 60_000;
    for (let i = 0; i < 2; i++) {
      await click(heardChoice(container, false));
      await click(screen.getByRole('button', { name: /continue|see results/i }));
    }
    expect(screen.queryByRole('heading', { name: /nice reviewing/i })).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2');
    expect(screen.getByRole('status', { name: 'Mistakes' })).toHaveTextContent('2 incorrect answers');
    for (let i = 0; i < 2; i++) {
      endAudio(container); await click(heardChoice(container)); await advance(1200);
    }
    expect(screen.getByRole('heading', { name: /nice reviewing/i })).toBeInTheDocument();
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(4);
    const saved = records.filter(attempt => attempt.context);
    expect(saved.every(attempt => attempt.context?.phase === 'review')).toBe(true);
    expect(saved.some(attempt => attempt.itemId === legacy(3)[2]!.itemId)).toBe(false);
    expect(saved.filter(attempt => attempt.context?.retryOf).map(attempt => attempt.context!.retryOf).sort()).toEqual(saved.filter(attempt => !attempt.correct).map(attempt => attempt.id).sort());
    expect(screen.getByRole('button', { name: /begin lesson/i })).toBeInTheDocument();
  });

  it('finishes corrective retries before offering another lesson chunk', async () => {
    const { container } = render(<App now={fixedNow} random={() => 0.5}/>);
    await start(); await click(await screen.findByRole('button', { name: /begin lesson/i }));
    for (let i = 0; i < 10; i++) await click(screen.getByRole('button', { name: i === 9 ? /mini-quiz/i : /next word/i }));
    vi.useFakeTimers();
    const missed = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const source = container.querySelector('audio')!.getAttribute('src');
      const target = practicePool.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
      expect(practicePool.items.slice(0, 10).some(item => item.id === target.id)).toBe(true);
      if (!missed.has(target.id)) {
        missed.add(target.id);
        await click(heardChoice(container, false));
        await click(screen.getByRole('button', { name: /^continue$/i }));
      } else {
        endAudio(container); await click(heardChoice(container)); await advance(1200);
      }
    }
    expect(missed.size).toBe(10);
    expect(screen.getByRole('heading', { name: /nice round/i })).toBeInTheDocument();
    await click(screen.getByRole('button', { name: /learn more/i }));
    expect(screen.getByRole('img')).toHaveAttribute('alt', practicePool.items[10]!.image.alt);
    expect(records).toHaveLength(20);
    expect(records.filter(attempt => !attempt.correct)).toHaveLength(10);
    expect(records.filter(attempt => attempt.context?.retryOf)).toHaveLength(10);
  });

  it('keeps a final missed word in the quiz through repeated mistakes and resets the card each time', async () => {
    const { container } = await review({ count: 1 });
    vi.useFakeTimers();
    const firstGrid = container.querySelector('.choices');
    for (let i = 1; i <= 6; i++) {
      await click(heardChoice(container, false));
      expect(screen.getByRole('status', { name: 'Mistakes' })).toHaveTextContent(`${i} incorrect answer${i === 1 ? '' : 's'}`);
      expect(container.querySelectorAll('.mistake-icon')).toHaveLength(Math.min(i, 5));
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1');
      await click(screen.getByRole('button', { name: /^continue$/i }));
      expect(screen.queryByRole('heading', { name: /nice reviewing/i })).not.toBeInTheDocument();
      expect(container.querySelector('.choices')).not.toBe(firstGrid);
    }
    expect(container.querySelector('.mistake-overflow')).toHaveTextContent('+1');
    const attempts = records.filter(attempt => attempt.context);
    expect(attempts.slice(1).every(attempt => attempt.context?.retryOf === attempts[0]!.id)).toBe(true);
    endAudio(container); await click(heardChoice(container)); await advance(1200);
    expect(screen.getByRole('heading', { name: /nice reviewing/i })).toBeInTheDocument();
    expect(records.filter(attempt => attempt.context)).toHaveLength(7);
    expect(records.at(-1)!.context?.retryOf).toBe(attempts[0]!.id);
  });

  it('shows only Finish when the forecast admits no new words', async () => {
    vi.mocked(planLessonChunk).mockResolvedValue({ items: [], forecast: { ...forecast, reviewsPerDay: 35 }, projectedForecast: forecast, reason: 'at-max' });
    render(<App now={fixedNow}/>);
    await start();
    expect(await screen.findByRole('heading', { name: /all set for now/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /begin lesson/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: /review density/i })).toHaveTextContent('High');
    await click(screen.getByRole('button', { name: /^finish$/i }));
    expect(screen.getByRole('heading', { name: 'kikimashta' })).toBeInTheDocument();
  });

  it('blocks new intake when history is unavailable and can retry loading', async () => {
    vi.mocked(ProgressStore.prototype.history).mockRejectedValueOnce(new Error('Unavailable'));
    render(<App now={fixedNow}/>);
    expect(await screen.findByRole('alert')).toHaveTextContent(/history couldn't load/i);
    expect(screen.getByRole('button', { name: /^start/i })).toBeDisabled();
    await click(screen.getByRole('button', { name: /retry loading/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('persists a qualitative range, accepts matching levels, and ignores invalid saved preferences', async () => {
    const user = userEvent.setup();
    localStorage.setItem('kikimashta-density-range-v1', JSON.stringify({ min: 'intense', max: 'minimal' }));
    const view = render(<App now={fixedNow}/>);
    expect(within(screen.getByRole('listbox', { name: 'Minimum' })).getByRole('option', { name: 'Light' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('listbox', { name: 'Maximum' })).getByRole('option', { name: 'Moderate' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('listbox', { name: 'Minimum' }));
    await user.keyboard('{ArrowDown}');
    expect(JSON.parse(localStorage.getItem('kikimashta-density-range-v1')!)).toEqual({ min: 'moderate', max: 'moderate' });
    view.unmount(); render(<App now={fixedNow}/>);
    expect(within(screen.getByRole('listbox', { name: 'Minimum' })).getByRole('option', { name: 'Moderate' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('listbox', { name: 'Maximum' })).getByRole('option', { name: 'Moderate' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('quiz safeguards', () => {
  it.each([true, false])('retains the right pictures after a correct=%s answer', async correct => {
    const { container } = await review();
    const targetPicture = within(heardChoice(container)).getByRole('img').getAttribute('alt')!;
    const selected = heardChoice(container, correct);
    await click(selected);
    const retained = screen.getAllByRole('button', { name: /choose picture/i });
    expect(retained).toHaveLength(correct ? 1 : 2); expect(retained).toContain(selected);
    expect(screen.getByRole('img', { name: targetPicture })).toBeInTheDocument();
    retained.forEach(button => expect(button).toBeDisabled());
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(1);
    await click(screen.getByRole('button', { name: /kikimashta home/i }));
    await start(); await click(await screen.findByRole('button', { name: /begin review/i }));
    expect(screen.getAllByRole('button', { name: /choose picture/i })).toHaveLength(4);
    expect(container.querySelector('.answer-departures')).not.toBeInTheDocument();
    expect(container.querySelector('.quiz-starburst')).not.toBeInTheDocument();
  });

  it('records only one answer after rapid taps and keeps the selected voice for replay', async () => {
    const { container } = await review();
    const source = container.querySelector('audio')!.getAttribute('src');
    await click(screen.getByRole('button', { name: /replay word/i }));
    expect(container.querySelector('audio')).toHaveAttribute('src', source);
    const choice = heardChoice(container, false);
    await act(async () => { fireEvent.click(choice); fireEvent.click(choice); });
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(1);
    expect(records.at(-1)!.context).toMatchObject({ replays: 1, phase: 'review', recordingSrc: source!.slice(1) });
  });

  it('blocks answers after an audio failure and retries the same recording', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Blocked'));
    const { container } = await review();
    expect(await screen.findByRole('alert')).toHaveTextContent(/sound couldn't play/i);
    screen.getAllByRole('button', { name: /choose picture/i }).forEach(button => expect(button).toBeDisabled());
    const source = container.querySelector('audio')!.getAttribute('src');
    await click(screen.getByRole('button', { name: /replay word/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelector('audio')).toHaveAttribute('src', source);
    screen.getAllByRole('button', { name: /choose picture/i }).forEach(button => expect(button).toBeEnabled());
  });

  it('ignores an old rejected play request after a newer replay succeeds', async () => {
    const stale = deferred<void>();
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(stale.promise);
    await review();
    await click(screen.getByRole('button', { name: /replay word/i }));
    await act(async () => { stale.reject(new Error('Old request')); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    screen.getAllByRole('button', { name: /choose picture/i }).forEach(button => expect(button).toBeEnabled());
  });

  it('keeps a missed answer available for replay until Continue is pressed', async () => {
    const { container } = await review();
    vi.useFakeTimers();
    endAudio(container); await click(heardChoice(container, false));
    const source = container.querySelector('audio')!.getAttribute('src');
    await advance(10_000);
    expect(container.querySelector('audio')).toHaveAttribute('src', source);
    expect(screen.getAllByRole('button', { name: /choose picture/i })).toHaveLength(2);
    await click(screen.getByRole('button', { name: /replay word/i }));
    expect(container.querySelector('audio')).toHaveAttribute('src', source);
    await click(screen.getByRole('button', { name: /^continue$/i }));
    expect(screen.getAllByRole('button', { name: /choose picture/i })).toHaveLength(4);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows a failed save, keeps the question in place, and retries the same attempt', async () => {
    vi.mocked(ProgressStore.prototype.record).mockRejectedValueOnce(new Error('Unavailable'));
    const { container } = await review();
    await click(heardChoice(container, false));
    expect(await screen.findByRole('alert')).toHaveTextContent(/hasn't been saved/i);
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeDisabled();
    const first = vi.mocked(ProgressStore.prototype.record).mock.calls[0]![0];
    await click(screen.getByRole('button', { name: /retry saving/i }));
    expect(vi.mocked(ProgressStore.prototype.record).mock.calls[1]![0]).toEqual(first);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeEnabled();
  });

  it('keeps Start disabled after exiting until an in-flight answer has been saved', async () => {
    const pending = deferred<void>();
    vi.mocked(ProgressStore.prototype.record).mockReturnValueOnce(pending.promise);
    const { container } = await review();
    await click(heardChoice(container, false));
    await click(screen.getByRole('button', { name: /kikimashta home/i }));
    expect(screen.getByRole('button', { name: /^saving/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dev review' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'kikimashta' })).toBeInTheDocument();
    await act(async () => { pending.resolve(); });
    await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Dev review' })).toBeEnabled();
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(1);
  });

  it('waits for saving and the full correct-answer beat before advancing', async () => {
    const pending = deferred<void>();
    vi.mocked(ProgressStore.prototype.record).mockReturnValueOnce(pending.promise);
    const { container } = await review();
    vi.useFakeTimers();
    endAudio(container);
    await click(heardChoice(container));
    const source = container.querySelector('audio')!.getAttribute('src');
    await advance(5000);
    expect(container.querySelector('audio')).toHaveAttribute('src', source);
    await act(async () => { pending.resolve(); });
    await advance(1199); expect(container.querySelector('audio')).toHaveAttribute('src', source);
    await advance(1); expect(container.querySelector('audio')!.getAttribute('src')).not.toBe(source);
  });

  it('holds advancement through replay, and a hidden page requires resuming', async () => {
    const { container } = await review();
    vi.useFakeTimers();
    endAudio(container); await click(heardChoice(container));
    const source = container.querySelector('audio')!.getAttribute('src');
    await advance(1000); await click(screen.getByRole('button', { name: /replay word/i }));
    await advance(5000); expect(container.querySelector('audio')).toHaveAttribute('src', source);
    endAudio(container);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    await advance(5000); expect(container.querySelector('audio')).toHaveAttribute('src', source);
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeEnabled();
    await click(screen.getByRole('button', { name: /^continue$/i }));
    expect(container.querySelector('audio')!.getAttribute('src')).not.toBe(source);
  });

  it('clears feedback colors and pending automatic transitions when exiting', async () => {
    const { container } = await review();
    vi.useFakeTimers();
    const color = () => document.documentElement.style.getPropertyValue('--screen-background');
    expect(color()).toBe(themeColors.pictureQuiz);
    endAudio(container); await click(heardChoice(container));
    expect(color()).toBe(quizFeedbackColors.correct);
    await click(screen.getByRole('button', { name: /kikimashta home/i }));
    await advance(5000);
    expect(color()).toBe(themeColors.home);
    expect(container.querySelector('.app')).not.toHaveAttribute('data-answer');
    expect(screen.getByRole('heading', { name: 'kikimashta' })).toBeInTheDocument();
  });
});
