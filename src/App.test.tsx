import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ProgressStore } from './progress/store';

beforeEach(() => {
  vi.spyOn(ProgressStore.prototype, 'history').mockResolvedValue([]);
  vi.spyOn(ProgressStore.prototype, 'record').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

function deferredSave() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('practice interactions', () => {
  it('introduces the first word with a picture and playable audio', async () => {
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await user.click(screen.getByRole('button', { name: /^start/i }));

    expect(screen.getByRole('heading', { name: /lesson time!/i })).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining('images/'));
    expect(container.querySelector('audio')).toHaveAttribute('src', expect.stringMatching(/audio\/.+\.mp3$/));
    await user.click(screen.getByRole('button', { name: /replay word/i }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it('saves one answer when a picture receives rapid repeated taps', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));
    const choices = screen.getAllByRole('button', { name: /choose picture/i });
    expect(choices).toHaveLength(4);

    fireEvent.click(choices[0]!);
    fireEvent.click(choices[0]!);

    await waitFor(() => expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/got it!|try this one\./i)).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /choose picture/i })) expect(button).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /next sound/i }));
    expect(screen.getByRole('progressbar', { name: /session progress/i })).toHaveAttribute('aria-valuenow', '1');
  });

  it('blocks answers when playback fails and lets the user retry the audio', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Playback blocked'));
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/sound couldn't play/i);
    for (const button of screen.getAllByRole('button', { name: /choose picture/i })) expect(button).toBeDisabled();
    expect(ProgressStore.prototype.record).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /replay word/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /choose picture/i })) expect(button).toBeEnabled();
  });

  it('shows a failed save honestly and offers a retry before advancing', async () => {
    vi.mocked(ProgressStore.prototype.record).mockRejectedValueOnce(new Error('Storage failed'));
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));
    await user.click(screen.getAllByRole('button', { name: /choose picture/i })[0]!);

    expect(await screen.findByRole('alert')).toHaveTextContent(/hasn't been saved/i);
    expect(screen.getByRole('button', { name: /next sound/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /retry saving/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /next sound/i })).toBeEnabled();
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(2);
  });

  it('keeps an old save rejection from changing a new round or unlocking its pending answer', async () => {
    const oldSave = deferredSave();
    const currentSave = deferredSave();
    vi.mocked(ProgressStore.prototype.record)
      .mockImplementationOnce(() => oldSave.promise)
      .mockImplementationOnce(() => currentSave.promise);
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));
    await user.click(screen.getAllByRole('button', { name: /choose picture/i })[0]!);
    await user.click(screen.getByRole('button', { name: /kikimashta home/i }));
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));
    await user.click(screen.getAllByRole('button', { name: /choose picture/i })[0]!);

    await act(async () => { oldSave.reject(new Error('Previous round failed to save')); });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    await act(async () => { currentSave.resolve(); });
    await user.click(screen.getByRole('button', { name: /next sound/i }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(ProgressStore.prototype.record).toHaveBeenCalledTimes(2);
  });

  it('retries the same failed answer only once during rapid taps and counts one stored answer', async () => {
    const retry = deferredSave();
    vi.mocked(ProgressStore.prototype.record)
      .mockRejectedValueOnce(new Error('Storage failed'))
      .mockImplementationOnce(() => retry.promise);
    const user = userEvent.setup();
    render(<App/>);
    await user.click(screen.getByRole('button', { name: /skip to quiz/i }));
    await user.click(screen.getAllByRole('button', { name: /choose picture/i })[0]!);
    await user.dblClick(await screen.findByRole('button', { name: /retry saving/i }));

    const record = vi.mocked(ProgressStore.prototype.record);
    expect(record).toHaveBeenCalledTimes(2);
    const savedAnswer = record.mock.calls[0]![0];
    expect(record.mock.calls[1]![0]).toEqual(savedAnswer);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    vi.mocked(ProgressStore.prototype.history).mockResolvedValue([savedAnswer]);
    await act(async () => { retry.resolve(); });
    expect(screen.getByRole('button', { name: /next sound/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /kikimashta home/i }));
    expect(await screen.findByText('1 answer saved on this device')).toBeInTheDocument();
  });
});
