import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ProgressStore } from './progress/store';
import { practiceCards, cardKey } from './core/cards';
import { practicePool } from './core/practice';
const fullPool = practicePool;
import { cardPacks, selectedPracticeCards, packPreferenceKey } from './core/packs';
import { forecastDensity, planLessonChunk } from './core/density';
import { advanceSchedule, schedulerVersion } from './core/scheduler';
import { quizTimeLimit } from './core/quiz-timer';
import type { Exercise, PracticeAttempt } from './types';
import { intensityColors, quizFeedbackColors, themeColors } from './themes';

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
  return screen.getAllByRole('button', { name: /choose (picture|writing)/i }).find(button =>
    Boolean(within(button).queryByRole('img', { name: target.image.alt }) || within(button).queryByText(target.text, { exact: true })) === correct,
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
  it('holds the system fallback through replay after a font loads, then uses a font on the retry', async () => {
    const original = Object.getOwnPropertyDescriptor(document, 'fonts');
    const faces = ['Noto Sans JP', 'Noto Serif JP', 'Zen Maru Gothic', 'Klee One'].map(name => ({ family: 'Kikimashta ' + name, weight: name === 'Zen Maru Gothic' ? '500' : '600', status: 'unloaded' }));
    Object.defineProperty(document, 'fonts', { configurable: true, value: Object.assign(faces, { load: vi.fn().mockRejectedValue(new Error('Font unavailable')) }) });
    try {
      records = legacy(1).map(attempt => ({ ...attempt, context: { phase: 'lesson', exercise: 'audio-text', recordingSrc: 'audio/cat.mp3', replays: 0, schedulerVersion: 'fsrs-6-v1' } }));
      const { container } = render(<App now={fixedNow} random={() => 0}/>);
      await start();
      await click(screen.getByRole('button', { name: /begin review/i }));
      const fonts = () => Array.from(container.querySelectorAll('.choices .written-answer'), label => label.getAttribute('data-font'));
      expect(fonts()).toEqual(['system', 'system', 'system', 'system']);
      faces.forEach(face => { face.status = 'loaded'; });
      await click(screen.getByRole('button', { name: 'Replay word' }));
      expect(fonts()).toEqual(['system', 'system', 'system', 'system']);
      await click(heardChoice(container, false));
      await click(screen.getByRole('button', { name: /^continue$/i }));
      expect(fonts()).toEqual(['zen-maru', 'zen-maru', 'zen-maru', 'zen-maru']);
    } finally {
      if (original) Object.defineProperty(document, 'fonts', original);
      else Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('starts a random dev review with no due words, retries misses, and leaves saved progress untouched', async () => {
    const { container } = render(<App now={fixedNow} random={() => 0.5}/>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dev review' })).toBeEnabled());
    await click(screen.getByRole('button', { name: 'Dev review' }));
    vi.useFakeTimers();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '6');
    expect(screen.getAllByRole('button', { name: /choose (picture|writing)/i })).toHaveLength(4);
    await click(heardChoice(container, false));
    expect(screen.getByRole('status', { name: 'Mistakes' })).toHaveTextContent('1 incorrect answer');
    await click(screen.getByRole('button', { name: /^continue$/i }));
    const completed = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const choice = heardChoice(container);
      for (const label of container.querySelectorAll('.choices .written-answer')) expect(['noto-serif', 'zen-maru', 'klee']).toContain(label.getAttribute('data-font'));
      const picture = container.querySelector('.practice.quiz')!.getAttribute('data-exercise') + '/' + container.querySelector('audio')!.getAttribute('src');
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
    expect(screen.getByText('2 cards')).toBeInTheDocument();
    await click(screen.getByRole('button', { name: /begin review/i }));
    await click(heardChoice(container));
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(3);
  });

  it('introduces ten shuffled picture and writing cards, then quizzes exactly those cards', async () => {
    const { container } = render(<App now={fixedNow} random={() => 0.5}/>);
    await start();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await click(await screen.findByRole('button', { name: /begin lesson/i }));
    const expected = practiceCards(practicePool.items.slice(0, 5));
    const introduced: string[] = [];
    for (let i = 0; i < 10; i++) {
      const source = container.querySelector('audio')!.getAttribute('src');
      const item = practicePool.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
      const exercise = container.querySelector('.preview')!.getAttribute('data-exercise')!;
      introduced.push(JSON.stringify([item.language, item.id, exercise]));
      if (exercise === 'audio-text') {
        expect(container.querySelector('.preview-picture img')).toBeNull();
        expect(within(container.querySelector('.preview-picture') as HTMLElement).getByText(item.text)).toHaveAttribute('lang', item.language);
        expect(container.querySelector('.preview-picture .written-answer')).toHaveAttribute('data-font', 'noto-sans');
      } else expect(screen.getByRole('img')).toHaveAttribute('alt', item.image.alt);
      expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
      await click(screen.getByRole('button', { name: i === 9 ? /mini-quiz/i : /next card/i }));
    }
    expect(introduced.sort()).toEqual(expected.map(cardKey).sort());
    vi.useFakeTimers();
    for (let i = 0; i < 10; i++) {
      const exercise = container.querySelector('.quiz')!.getAttribute('data-exercise')!;
      const choices = screen.getAllByRole('button', { name: /choose (picture|writing)/i });
      expect(choices).toHaveLength(4);
      expect(choices.every(button => button.querySelector('img') !== null)).toBe(exercise === 'audio-picture');
      if (exercise === 'audio-text') for (const label of container.querySelectorAll('.choices .written-answer')) expect(label).toHaveAttribute('data-font', 'noto-sans');
      endAudio(container); await click(heardChoice(container)); await advance(1200);
    }
    expect(screen.getByRole('heading', { name: /nice round/i })).toBeInTheDocument();
    expect(records.map(attempt => JSON.stringify([attempt.language, attempt.itemId, attempt.context!.exercise])).sort()).toEqual(introduced);
    expect(records.every(attempt => attempt.context?.phase === 'lesson' && attempt.context.schedulerVersion === schedulerVersion)).toBe(true);
  });

  it('mixes both due exercise cards for the same word without introducing other targets', async () => {
    const picture = { ...legacy(1)[0]!, context: { phase: 'review' as const, exercise: 'audio-picture' as const, recordingSrc: 'audio/cat.mp3', replays: 0, schedulerVersion: 'fsrs-6-v1' } };
    const writing = { ...picture, id: 'writing-attempt', context: { ...picture.context, exercise: 'audio-text' as const } };
    records = [picture, writing];
    const { container } = render(<App now={fixedNow} random={() => 0.5}/>);
    await start();
    expect(screen.getByText('2 cards')).toBeInTheDocument();
    await click(screen.getByRole('button', { name: /begin review/i }));
    vi.useFakeTimers();
    for (let i = 0; i < 2; i++) {
      const exercise = container.querySelector('.quiz')!.getAttribute('data-exercise');
      expect(container.querySelectorAll('.choices img')).toHaveLength(exercise === 'audio-picture' ? 4 : 0);
      endAudio(container); await click(heardChoice(container)); await advance(1200);
    }
    expect(records.slice(2).map(attempt => attempt.context!.exercise).sort()).toEqual(['audio-picture', 'audio-text']);
    expect(records.slice(2).every(attempt => attempt.itemId === picture.itemId)).toBe(true);
  });

  it('keeps the due-word snapshot while requiring missed words to be answered correctly', async () => {
    let clock = fixedNow();
    records = [...legacy(2), { ...legacy(3)[2]!, answeredAt: clock + 1000 }];
    const { container } = render(<App now={() => clock} random={() => 0.5}/>);
    await start();
    expect(await screen.findByText('2 cards')).toBeInTheDocument();
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
    for (let i = 0; i < 10; i++) await click(screen.getByRole('button', { name: i === 9 ? /mini-quiz/i : /next card/i }));
    vi.useFakeTimers();
    const missed = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const source = container.querySelector('audio')!.getAttribute('src');
      const target = practicePool.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
      expect(practicePool.items.slice(0, 5).some(item => item.id === target.id)).toBe(true);
      const key = container.querySelector('.quiz')!.getAttribute('data-exercise') + '/' + target.id;
      for (const label of container.querySelectorAll('.choices .written-answer')) expect(label).toHaveAttribute('data-font', 'noto-sans');
      if (!missed.has(key)) {
        missed.add(key);
        await click(heardChoice(container, false));
        await click(screen.getByRole('button', { name: /^continue$/i }));
      } else {
        endAudio(container); await click(heardChoice(container)); await advance(1200);
      }
    }
    expect(missed.size).toBe(10);
    expect(screen.getByRole('heading', { name: /nice round/i })).toBeInTheDocument();
    await click(screen.getByRole('button', { name: /learn more/i }));
    const nextSource = container.querySelector('audio')!.getAttribute('src');
    expect(practicePool.items.slice(5, 10).some(item => item.audio.some(clip => nextSource?.endsWith(clip.src)))).toBe(true);
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

  it.each([
    [{ min: 'moderate', max: 'moderate' }, { min: 'moderate', max: 'moderate' }],
    [{ min: 'intense', max: 'minimal' }, { min: 'light', max: 'moderate' }],
  ])('uses saved bounds or defaults without exposing home wheels: %j', async (saved, expected) => {
    localStorage.setItem('kikimashta-density-range-v1', JSON.stringify(saved));
    render(<App now={fixedNow}/>);
    await start();
    expect(planLessonChunk).toHaveBeenCalledWith(expect.objectContaining({ range: expected }));
    expect(localStorage.getItem('kikimashta-density-range-v1')).toBe(JSON.stringify(saved));
  });

  it.each([
    [0, 'Minimal', 'minimal', 'pace/kiku-minimal-v1.png'],
    [5, 'Light', 'light', 'kikimashta-cat-v1.png'],
    [15, 'Moderate', 'moderate', 'pace/kiku-moderate-v1.png'],
    [30, 'High', 'high', 'pace/kiku-high-v1.png'],
    [60, 'Intense', 'intense', 'pace/kiku-intense-v2.png'],
  ] as const)('shows Kiku and a full-screen intensity color at %s', async (value, label, level, image) => {
    vi.mocked(forecastDensity).mockResolvedValue({ ...forecast, reviewsPerDay: value });
    const view = render(<App now={fixedNow}/>);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Review density' })).toHaveTextContent(label));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Review density' }).querySelector('img')).toHaveAttribute('src', '/brand/' + image);
    expect(document.documentElement.style.getPropertyValue('--screen-background')).toBe(intensityColors[level]);
    view.unmount();
    expect(document.documentElement.style.getPropertyValue('--screen-background')).toBe('');
  });

});

describe('quiz safeguards', () => {
  it.each([true, false])('retains the right pictures after a correct=%s answer', async correct => {
    const { container } = await review();
    const targetPicture = within(heardChoice(container)).getByRole('img').getAttribute('alt')!;
    const selected = heardChoice(container, correct);
    await click(selected);
    const retained = screen.getAllByRole('button', { name: /choose (picture|writing)/i });
    expect(retained).toHaveLength(correct ? 1 : 2); expect(retained).toContain(selected);
    expect(screen.getByRole('img', { name: targetPicture })).toBeInTheDocument();
    retained.forEach(button => expect(button).toBeDisabled());
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(1);
    await click(screen.getByRole('button', { name: /kikimashta home/i }));
    await start(); await click(await screen.findByRole('button', { name: /begin review/i }));
    expect(screen.getAllByRole('button', { name: /choose (picture|writing)/i })).toHaveLength(4);
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
    screen.getAllByRole('button', { name: /choose (picture|writing)/i }).forEach(button => expect(button).toBeDisabled());
    const source = container.querySelector('audio')!.getAttribute('src');
    await click(screen.getByRole('button', { name: /replay word/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelector('audio')).toHaveAttribute('src', source);
    screen.getAllByRole('button', { name: /choose (picture|writing)/i }).forEach(button => expect(button).toBeEnabled());
  });

  it('ignores an old rejected play request after a newer replay succeeds', async () => {
    const stale = deferred<void>();
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(stale.promise);
    await review();
    await click(screen.getByRole('button', { name: /replay word/i }));
    await act(async () => { stale.reject(new Error('Old request')); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    screen.getAllByRole('button', { name: /choose (picture|writing)/i }).forEach(button => expect(button).toBeEnabled());
  });

  it('keeps a missed answer available for replay until Continue is pressed', async () => {
    const { container } = await review();
    vi.useFakeTimers();
    endAudio(container); await click(heardChoice(container, false));
    const source = container.querySelector('audio')!.getAttribute('src');
    await advance(10_000);
    expect(container.querySelector('audio')).toHaveAttribute('src', source);
    expect(screen.getAllByRole('button', { name: /choose (picture|writing)/i })).toHaveLength(2);
    await click(screen.getByRole('button', { name: /replay word/i }));
    expect(container.querySelector('audio')).toHaveAttribute('src', source);
    await click(screen.getByRole('button', { name: /^continue$/i }));
    expect(screen.getAllByRole('button', { name: /choose (picture|writing)/i })).toHaveLength(4);
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
    expect(color()).toBe(intensityColors.minimal);
    expect(container.querySelector('.app')).not.toHaveAttribute('data-answer');
    expect(screen.getByRole('heading', { name: 'kikimashta' })).toBeInTheDocument();
  });
});

describe('practice pack selection', () => {
  it('restricts lessons and dev review to the selected level and writing format', async () => {
    const pack = cardPacks.find(pack => pack.id === 'ja-wanikani-2-writing')!;
    localStorage.setItem(packPreferenceKey, JSON.stringify([pack.id]));
    const { container } = render(<App now={fixedNow} random={() => 0.5}/>);
    await start();
    expect(vi.mocked(planLessonChunk).mock.calls.at(-1)![0].candidates).toEqual(selectedPracticeCards(fullPool.items, [pack.id]));
    await click(screen.getByRole('button', { name: /begin lesson/i }));
    expect(container.querySelector('.preview')).toHaveAttribute('data-exercise', 'audio-text');
    await click(screen.getByRole('button', { name: /kikimashta home/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dev review' })).toBeEnabled());
    await click(screen.getByRole('button', { name: 'Dev review' }));
    expect(container.querySelector('.quiz')).toHaveAttribute('data-exercise', 'audio-text');
    const source = container.querySelector('audio')!.getAttribute('src');
    expect(fullPool.items.some(item => pack.itemIds.includes(item.id) && item.audio.some(clip => source?.endsWith(clip.src)))).toBe(true);
  });

  it('reviews only enabled cards and preserves disabled history', async () => {
    const pack = cardPacks.find(pack => pack.id === 'ja-wanikani-2-writing')!;
    const item = selectedPracticeCards(fullPool.items, [pack.id])[0]!.item;
    records = [{ ...legacy(1)[0]!, itemId: item.id }, {
      ...legacy(1)[0]!, id: 'writing', itemId: item.id,
      context: { phase: 'review', exercise: 'audio-text', recordingSrc: item.audio[0]!.src, replays: 0, schedulerVersion: 'fsrs-6-v1' },
    }];
    const original = structuredClone(records);
    localStorage.setItem(packPreferenceKey, JSON.stringify([pack.id]));
    const { container } = render(<App now={fixedNow} random={() => 0.5}/>);
    await start();
    expect(screen.getByText('1 card')).toBeInTheDocument();
    await click(screen.getByRole('button', { name: /begin review/i }));
    expect(container.querySelector('.quiz')).toHaveAttribute('data-exercise', 'audio-text');
    expect(records).toEqual(original);
    expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
  });

  it('disables practice for an empty selection and saves a newly enabled pack', async () => {
    localStorage.setItem(packPreferenceKey, '[]');
    render(<App now={fixedNow}/>);
    await screen.findByText('Select a pack to start practicing.');
    expect(screen.getByRole('button', { name: /^start/i })).toBeDisabled();
    await click(screen.getByText('Card packs · 0 selected'));
    const checkbox = screen.getByRole('checkbox', { name: 'WaniKani level 1 · Pictures' });
    await waitFor(() => expect(checkbox).toBeEnabled());
    await click(checkbox);
    await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
    expect(JSON.parse(localStorage.getItem(packPreferenceKey)!)).toEqual(['ja-wanikani-1-pictures']);
  });
});


async function timedReview(exercise: Exercise = 'audio-picture', count = 1) {
  const item = practicePool.items[0]!;
  const first: PracticeAttempt = { ...legacy(1)[0]!, id: 'learn', answeredAt: 1000,
    context: { phase: 'lesson', exercise, recordingSrc: item.audio[0]!.src, replays: 0, schedulerVersion: 'fsrs-6-v1' } };
  const learning = await advanceSchedule(undefined, first);
  const second = { ...first, id: 'graduate', answeredAt: learning.dueAt };
  records = practicePool.items.slice(0, count).flatMap((item, i) => [first, second].map(attempt => ({ ...attempt, id: attempt.id + '-' + i, itemId: item.id, selectedId: item.id })));
  const established = await advanceSchedule(learning, second);
  const limit = quizTimeLimit(established)!;
  expect(limit).toBeGreaterThan(0);
  const view = render(<App random={() => 0.5}/>);
  await start(); vi.useFakeTimers();
  await click(screen.getByRole('button', { name: /begin review/i }));
  return { ...view, limit };
}
function loadPictures(container: HTMLElement) {
  for (const image of container.querySelectorAll('.choices img')) fireEvent.load(image);
}
describe('adaptive quiz countdown', () => {
  it('waits for audio, card entry, and pictures; expiry keeps choices open and late correct completes without a retry', async () => {
    const { container, limit } = await timedReview();
    await advance(600);
    expect(container.querySelector('.quiz-timer-fill')).not.toBeInTheDocument();
    endAudio(container);
    await advance(1000);
    expect(container.querySelector('.quiz-timer-fill')).not.toBeInTheDocument();
    await act(async () => loadPictures(container)); await advance(0);
    const timer = container.querySelector('.quiz-timer-fill')!;
    expect(timer).toHaveStyle({ transform: 'scaleY(0)' });
    await advance(limit / 2);
    expect(screen.queryByText(/correct answer still counts as partial success/i)).not.toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Replay word' }));
    await advance(limit / 2);
    expect(screen.getByText(/correct answer still counts as partial success/i)).toBeInTheDocument();
    expect(heardChoice(container)).toBeEnabled();
    expect(records).toHaveLength(2);
    endAudio(container); await click(heardChoice(container));
    expect(records[2]).toMatchObject({ correct: true, outcome: 'partial', timer: { limitMs: limit }, context: { replays: 1, schedulerVersion } });
    expect(records[2]!.answeredAt - records[2]!.timer!.startedAt).toBe(limit);
    expect(container.querySelector('.app')).toHaveAttribute('data-answer', 'partial');
    expect(container.querySelector('.quiz-companion')).toHaveClass('is-partial');
    expect(screen.getByLabelText('Partial success')).toBeInTheDocument();
    expect(container.querySelector('.quiz-starburst')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    await advance(1200);
    expect(screen.getByRole('heading', { name: 'Nice reviewing!' })).toBeInTheDocument();
    expect(screen.getByText('1 partial success')).toBeInTheDocument();
  });

  it('starts only after short audio and the card entrance, records an on-time writing answer, and cancels the timer', async () => {
    const { container, limit } = await timedReview('audio-text');
    endAudio(container);
    await advance(479);
    expect(container.querySelector('.quiz-timer-fill')).not.toBeInTheDocument();
    await advance(1); await advance(0);
    expect(container.querySelector('.quiz-timer-fill')).toHaveStyle({ transform: 'scaleY(0)' });
    await advance(500); await click(heardChoice(container));
    expect(records[2]).toMatchObject({ outcome: 'success', timer: { limitMs: limit }, context: { exercise: 'audio-text' } });
    expect(container.querySelector('.quiz-timer-fill')).not.toBeInTheDocument();
    await advance(1200);
    expect(screen.getByRole('heading', { name: 'Nice reviewing!' })).toBeInTheDocument();
  });

  it('keeps an expired wrong answer a failure and makes its corrective retry untimed', async () => {
    const { container, limit } = await timedReview('audio-text');
    endAudio(container); await advance(480); await advance(0); await advance(limit);
    await click(heardChoice(container, false));
    expect(records[2]).toMatchObject({ correct: false, outcome: 'failure' });
    await click(screen.getByRole('button', { name: /^continue$/i }));
    endAudio(container); await advance(480 + limit);
    expect(container.querySelector('.quiz-timer-fill')).not.toBeInTheDocument();
    await click(heardChoice(container));
    expect(records[3]).toMatchObject({ outcome: 'success', context: { retryOf: records[2]!.id } });
    expect(records[3]).not.toHaveProperty('timer');
  });

  it('recovers from initial audio failure, and clears a running timer on Home', async () => {
    const { container, limit } = await timedReview('audio-text');
    fireEvent.error(container.querySelector('audio')!); await advance(480 + limit);
    expect(container.querySelector('.quiz-timer-fill')).not.toBeInTheDocument();
    expect(heardChoice(container)).toBeDisabled();
    await click(screen.getByRole('button', { name: 'Replay word' }));
    endAudio(container); await advance(50);
    expect(container.querySelector('.quiz-timer-fill')).toBeInTheDocument();
    await click(screen.getByRole('button', { name: /kikimashta home/i }));
    await advance(limit);
    expect(container.querySelector('.quiz-timer-fill')).not.toBeInTheDocument();
    expect(records).toHaveLength(2);
  });
});


it('starts a fresh countdown for each consecutive timed question', async () => {
  const { container } = await timedReview('audio-text', 2);
  endAudio(container); await advance(480); await advance(0); await advance(1000);
  await click(heardChoice(container));
  const first = records[4]!;
  expect(first.outcome).toBe('success');
  await advance(1200);
  expect(container.querySelector('.quiz-timer-fill')).not.toBeInTheDocument();
  endAudio(container); await advance(480); await advance(0);
  expect(container.querySelector('.quiz-timer-fill')).toHaveStyle({ transform: 'scaleY(0)' });
  await click(heardChoice(container));
  expect(records[5]!.outcome).toBe('success');
  expect(records[5]!.timer!.startedAt).toBeGreaterThan(first.answeredAt);
});

it('samples dev-review timers per question, retains the choice on replay, and never saves partial successes', async () => {
  let draw = .9;
  const { container } = render(<App random={() => draw}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Dev review' })).toBeEnabled());
  vi.useFakeTimers();
  await click(screen.getByRole('button', { name: 'Dev review' }));
  loadPictures(container); endAudio(container); await advance(480); await advance(0);
  expect(screen.getByText('1.5 second timer started.')).toBeInTheDocument();
  draw = 0;
  await advance(1500); await click(screen.getByRole('button', { name: 'Replay word' }));
  endAudio(container); await advance(1500);
  expect(screen.getByText(/correct answer still counts as partial success/i)).toBeInTheDocument();
  await click(heardChoice(container));
  expect(screen.getByLabelText('Partial success')).toBeInTheDocument();
  await advance(1200);
  loadPictures(container); endAudio(container); await advance(10000);
  expect(container.querySelector('.quiz-timer-fill')).not.toBeInTheDocument();
  draw = .3;
  await click(heardChoice(container)); await advance(1200);
  loadPictures(container); endAudio(container); await advance(480); await advance(0);
  expect(screen.getByText('10 second timer started.')).toBeInTheDocument();
  expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
  expect(records).toEqual([]);
});

it('catches up expiry from the wall clock when visibility changes after suspended callbacks', async () => {
  const { container, limit } = await timedReview('audio-text');
  endAudio(container); await advance(480); await advance(0);
  expect(container.querySelector('.quiz-timer-fill')).toHaveStyle({ transform: 'scaleY(0)' });
  vi.setSystemTime(Date.now() + limit);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(screen.getByText(/correct answer still counts as partial success/i)).toBeInTheDocument();
  expect(container.querySelector('.quiz-timer-fill')).toHaveStyle({ transform: 'scaleY(1)' });
  await click(heardChoice(container));
  expect(records[2]).toMatchObject({ correct: true, outcome: 'partial' });
});

describe('interval mastery feedback', () => {
  it('shows an upward arrow only after saving', async () => {
    const pending = deferred<void>();
    const { container } = await review({ count: 1 });
    vi.mocked(ProgressStore.prototype.record).mockImplementationOnce(attempt => pending.promise.then(() => { records.push(attempt); }));
    await click(heardChoice(container));
    expect(screen.queryByLabelText(/Mastery increased/)).not.toBeInTheDocument();
    await act(async () => pending.resolve());
    expect(screen.getByLabelText('Mastery increased to Learning')).toHaveTextContent('↑ Learning');
  });

  it('refreshes pack mastery when an answer finishes saving after returning Home', async () => {
    const pack = cardPacks.find(pack => pack.id === 'ja-wanikani-1-pictures')!;
    const cards = selectedPracticeCards(practicePool.items, [pack.id]);
    const old = legacy(1)[0]!;
    records = cards.map(({ item, exercise }, index) => ({
      ...old, id: 'pack-history-' + index, itemId: item.id, selectedId: item.id,
      ...(index === 0 ? {} : {
        startedAt: fixedNow() - 2000, answeredAt: fixedNow() - 1000, responseMs: 1000,
        context: { phase: 'lesson' as const, exercise, recordingSrc: item.audio[0]!.src, replays: 0, schedulerVersion },
      }),
    }));
    localStorage.setItem(packPreferenceKey, JSON.stringify([pack.id]));
    const { container } = render(<App now={fixedNow} random={() => 0.5}/>);
    await start();
    expect(screen.getByText('1 card')).toBeInTheDocument();
    await click(screen.getByRole('button', { name: /begin review/i }));
    const pending = deferred<void>();
    vi.mocked(ProgressStore.prototype.record).mockImplementationOnce(attempt => pending.promise.then(() => { records.push(attempt); }));
    await click(heardChoice(container));
    await click(screen.getByRole('button', { name: 'Kikimashta home' }));
    await click(screen.getByText(/Card packs ·/));
    const packLabel = screen.getByRole('checkbox', { name: pack.title }).closest('label')!;
    // Let Home finish its first history read while the answer is still unwritten.
    await waitFor(() => expect(within(packLabel).getByText('Lowest: New · Average: New')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    await act(async () => pending.resolve());
    await waitFor(() => expect(within(packLabel).getByText('Lowest: Learning · Average: Learning')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled();
  });

  it('shows a downward arrow after a lapse and no change on its corrective retry', async () => {
    const { container } = await timedReview();
    await click(heardChoice(container, false));
    expect(screen.getByLabelText('Mastery decreased to Learning')).toHaveTextContent('↓ Learning');
    await click(screen.getByRole('button', { name: /^continue$/i }));
    await click(heardChoice(container));
    expect(screen.queryByLabelText(/Mastery (increased|decreased)/)).not.toBeInTheDocument();
  });

  it('does not show a mastery change for an unsaved dev answer', async () => {
    const { container } = render(<App now={fixedNow} random={() => 0.5}/>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dev review' })).toBeEnabled());
    await click(screen.getByRole('button', { name: 'Dev review' }));
    await click(heardChoice(container));
    expect(screen.queryByLabelText(/Mastery (increased|decreased)/)).not.toBeInTheDocument();
  });
});
