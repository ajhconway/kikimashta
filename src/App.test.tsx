import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ProgressStore } from './progress/store';
import bank from '../content/ja.json';
import { quizFeedbackColors, themeColors } from './themes';

beforeEach(() => {
  vi.spyOn(ProgressStore.prototype, 'history').mockResolvedValue([]);
  vi.spyOn(ProgressStore.prototype, 'record').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => { vi.useRealTimers(); });

function heardChoice(container: HTMLElement, correct = true) {
  const source = container.querySelector('audio')!.getAttribute('src');
  const target = bank.items.find(item => item.audio.some(clip => source?.endsWith(clip.src)))!;
  return screen.getAllByRole('button', { name: /choose picture/i }).find(button =>
    Boolean(within(button).queryByRole('img', { name: target.image.alt })) === correct,
  )!;
}

async function timedQuiz() {
  vi.useFakeTimers();
  const view = render(<App random={() => 0.5}/>);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /skip to quiz/i })); });
  return view;
}

async function advanceTime(ms: number) {
  await act(async () => { vi.advanceTimersByTime(ms); });
}

function deferredSave() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('practice interactions', () => {
  it('introduces the first word with a picture and playable audio', async () => {
    const user = userEvent.setup();
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValue(0.999);
    const { container } = render(<App random={random}/>);
    await user.click(screen.getByRole('button', { name: /^start/i }));

    expect(screen.getByRole('heading', { name: /lesson time!/i })).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining('images/'));
    expect(container.querySelector('audio')).toHaveAttribute('src', '/' + bank.items[0]!.audio[0]!.src);
    await user.click(screen.getByRole('button', { name: /replay word/i }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(container.querySelector('audio')).toHaveAttribute('src', '/' + bank.items[0]!.audio[0]!.src);
    expect(random).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /next word/i }));
    expect(container.querySelector('audio')).toHaveAttribute('src', '/' + bank.items[1]!.audio[1]!.src);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('saves one answer when a picture receives rapid repeated taps', async () => {
    const user = userEvent.setup();
    const random = vi.fn(() => 0.5);
    const { container } = render(<App random={random}/>);
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));
    expect(screen.getAllByRole('button', { name: /choose picture/i })).toHaveLength(4);
    const choice = heardChoice(container, false);
    const recording = container.querySelector('audio')!.getAttribute('src');
    const randomCalls = random.mock.calls.length;

    fireEvent.click(choice);
    fireEvent.click(choice);

    await waitFor(() => expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/got it!|try this one\./i)).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /choose picture/i })) expect(button).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /replay word/i }));
    expect(container.querySelector('audio')).toHaveAttribute('src', recording);
    expect(random).toHaveBeenCalledTimes(randomCalls);
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(screen.getByRole('progressbar', { name: /session progress/i })).toHaveAttribute('aria-valuenow', '1');
  });

  it('blocks answers when playback fails and lets the user retry the audio', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Playback blocked'));
    const user = userEvent.setup();
    const random = vi.fn(() => 0.5);
    const { container } = render(<App random={random}/>);
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/sound couldn't play/i);
    for (const button of screen.getAllByRole('button', { name: /choose picture/i })) expect(button).toBeDisabled();
    expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
    const recording = container.querySelector('audio')!.getAttribute('src');
    const randomCalls = random.mock.calls.length;

    await user.click(screen.getByRole('button', { name: /replay word/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /choose picture/i })) expect(button).toBeEnabled();
    expect(container.querySelector('audio')).toHaveAttribute('src', recording);
    expect(random).toHaveBeenCalledTimes(randomCalls);
  });

  it('shows a failed save honestly and offers a retry before advancing', async () => {
    vi.mocked(ProgressStore.prototype.record).mockRejectedValueOnce(new Error('Storage failed'));
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));
    await user.click(heardChoice(container, false));

    expect(await screen.findByRole('alert')).toHaveTextContent(/hasn't been saved/i);
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /retry saving/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeEnabled();
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(2);
  });

  it('keeps an old save rejection from changing a new round or unlocking its pending answer', async () => {
    const oldSave = deferredSave();
    const currentSave = deferredSave();
    vi.mocked(ProgressStore.prototype.record)
      .mockImplementationOnce(() => oldSave.promise)
      .mockImplementationOnce(() => currentSave.promise);
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));
    await user.click(heardChoice(container, false));
    await user.click(screen.getByRole('button', { name: /kikimashta home/i }));
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));
    await user.click(heardChoice(container, false));

    await act(async () => { oldSave.reject(new Error('Previous round failed to save')); });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    await act(async () => { currentSave.resolve(); });
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(2);
  });

  it('retries the same failed answer only once during rapid taps and counts one stored answer', async () => {
    const retry = deferredSave();
    vi.mocked(ProgressStore.prototype.record)
      .mockRejectedValueOnce(new Error('Storage failed'))
      .mockImplementationOnce(() => retry.promise);
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));
    await user.click(heardChoice(container, false));
    await user.dblClick(await screen.findByRole('button', { name: /retry saving/i }));

    const record = vi.mocked(ProgressStore.prototype.record);
    expect(record).toHaveBeenCalledTimes(2);
    const savedAnswer = record.mock.calls[0]![0];
    expect(record.mock.calls[1]![0]).toEqual(savedAnswer);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    vi.mocked(ProgressStore.prototype.history).mockResolvedValue([savedAnswer]);
    await act(async () => { retry.resolve(); });
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /kikimashta home/i }));
    expect(await screen.findByText('1 answer saved on this device')).toBeInTheDocument();
  });

  it('advances a correct answer once after playback and a short beat, without imposing an answer deadline', async () => {
    const { container } = await timedQuiz();
    const original = container.querySelector('audio')!.getAttribute('src');
    await advanceTime(30_000);
    expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    await act(async () => { fireEvent.click(heardChoice(container)); });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    await advanceTime(5000);
    expect(container.querySelector('audio')).toHaveAttribute('src', original);
    fireEvent.ended(container.querySelector('audio')!);
    await advanceTime(1199);
    expect(screen.getByText('Got it!')).toBeInTheDocument();
    await advanceTime(1);
    expect(container.querySelector('audio')!.getAttribute('src')).not.toBe(original);
    for (const choice of screen.getAllByRole('button', { name: /choose picture/i })) expect(choice).toBeEnabled();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(1);
  });

  it('holds a correct answer during replay, then gives it a fresh beat before advancing', async () => {
    const { container } = await timedQuiz();
    const original = container.querySelector('audio')!.getAttribute('src');
    fireEvent.ended(container.querySelector('audio')!);
    await act(async () => { fireEvent.click(heardChoice(container)); });
    await advanceTime(500);
    fireEvent.click(screen.getByRole('button', { name: /replay word/i }));
    await advanceTime(5000);
    expect(container.querySelector('audio')).toHaveAttribute('src', original);
    expect(screen.getByText('Got it!')).toBeInTheDocument();
    fireEvent.ended(container.querySelector('audio')!);
    await advanceTime(1199);
    expect(container.querySelector('audio')).toHaveAttribute('src', original);
    await advanceTime(1);
    expect(container.querySelector('audio')!.getAttribute('src')).not.toBe(original);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(3);
    await advanceTime(5000);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('holds automatic advance for pending or failed saving, then advances after a successful retry', async () => {
    const pending = deferredSave();
    vi.mocked(ProgressStore.prototype.record).mockImplementationOnce(() => pending.promise);
    const { container } = await timedQuiz();
    const original = container.querySelector('audio')!.getAttribute('src');
    fireEvent.ended(container.querySelector('audio')!);
    await act(async () => { fireEvent.click(heardChoice(container)); });
    await advanceTime(5000);
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    await act(async () => { pending.reject(new Error('Storage failed')); });
    await advanceTime(5000);
    expect(container.querySelector('audio')).toHaveAttribute('src', original);
    expect(screen.getByRole('alert')).toHaveTextContent(/hasn't been saved/i);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /retry saving/i })); });
    await advanceTime(1200);
    expect(container.querySelector('audio')!.getAttribute('src')).not.toBe(original);
    const calls = vi.mocked(ProgressStore.prototype.record).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]![0]).toEqual(calls[0]![0]);
  });

  it('cancels a pending transition when leaving and starting a new round', async () => {
    const { container } = await timedQuiz();
    fireEvent.ended(container.querySelector('audio')!);
    await act(async () => { fireEvent.click(heardChoice(container)); });
    await advanceTime(500);
    fireEvent.click(screen.getByRole('button', { name: /kikimashta home/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip to quiz/i }));
    await advanceTime(5000);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByText('Got it!')).not.toBeInTheDocument();
    for (const choice of screen.getAllByRole('button', { name: /choose picture/i })) expect(choice).toBeEnabled();
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(1);
  });

  it('pauses a hidden quiz and leaves Continue available when returning', async () => {
    const { container } = await timedQuiz();
    const original = container.querySelector('audio')!.getAttribute('src');
    fireEvent.ended(container.querySelector('audio')!);
    await act(async () => { fireEvent.click(heardChoice(container)); });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    await advanceTime(5000);
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    await advanceTime(5000);
    expect(container.querySelector('audio')).toHaveAttribute('src', original);
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(container.querySelector('audio')!.getAttribute('src')).not.toBe(original);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it('treats a card context menu as a held button rather than an image action', async () => {
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));
    const choice = heardChoice(container);
    const image = within(choice).getByRole('img');
    expect(image).toHaveAttribute('draggable', 'false');
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    expect(fireEvent(image, menu)).toBe(false);
    expect(menu.defaultPrevented).toBe(true);
    expect(ProgressStore.prototype.record).not.toHaveBeenCalled();
    // Keyboard activation still uses the same native button path.
    choice.focus();
    await user.keyboard('{Enter}');
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('shows answer-specific backgrounds and resets them on the next question and exit', async () => {
    const { container } = await timedQuiz();
    const root = document.documentElement;
    const color = () => root.style.getPropertyValue('--screen-background');
    expect(color()).toBe(themeColors.pictureQuiz);
    fireEvent.ended(container.querySelector('audio')!);
    await act(async () => { fireEvent.click(heardChoice(container)); });
    expect(color()).toBe(quizFeedbackColors.correct);
    expect(container.querySelector('.app')).toHaveAttribute('data-answer', 'correct');
    await advanceTime(1200);
    expect(color()).toBe(themeColors.pictureQuiz);
    expect(container.querySelector('.app')).not.toHaveAttribute('data-answer');
    await act(async () => { fireEvent.click(heardChoice(container, false)); });
    expect(color()).toBe(quizFeedbackColors.incorrect);
    expect(container.querySelector('.app')).toHaveAttribute('data-answer', 'incorrect');
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(color()).toBe(themeColors.pictureQuiz);
    fireEvent.click(screen.getByRole('button', { name: /kikimashta home/i }));
    expect(color()).toBe(themeColors.home);
    expect(container.querySelector('.app')).not.toHaveAttribute('data-answer');
  });
});
