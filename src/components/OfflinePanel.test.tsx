import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { OfflinePanel } from './OfflinePanel';
import { offlineRequest, downloadSize } from '../offline/client';
vi.mock('../offline/client', () => ({ offlineRequest: vi.fn(), downloadSize: vi.fn() }));
const empty = { ready: false, completed: 0, total: 4, bytes: 0 };
const urls = ['audio/word.mp3'];
beforeEach(() => {
  vi.mocked(offlineRequest).mockReset().mockResolvedValue(empty);
  vi.mocked(downloadSize).mockResolvedValue(1024 * 1024);
});
it('only declares readiness after completed download and reports its size', async () => {
  const onReady = vi.fn();
  render(<OfflinePanel urls={urls} online onReady={onReady}/>);
  await waitFor(() => expect(downloadSize).toHaveBeenCalledWith(urls));
  expect(screen.getByText(/1.0 MB/)).toBeInTheDocument();
  let finish!: (value: typeof empty) => void;
  vi.mocked(offlineRequest).mockImplementationOnce(async (_type, _urls, progress) => {
    progress?.({ ...empty, completed: 2 });
    return new Promise(resolve => { finish = resolve; });
  });
  fireEvent.click(screen.getByText('Download selected packs'));
  await screen.findByText('Preparing 2 of 4 files…');
  expect(onReady).not.toHaveBeenCalledWith(true);
  await act(async () => finish({ ...empty, ready: true, completed: 4 }));
  expect(onReady).toHaveBeenLastCalledWith(true);
});
it('keeps failed downloads unavailable and permits retry without deleting progress', async () => {
  const onReady = vi.fn();
  render(<OfflinePanel urls={urls} online onReady={onReady}/>);
  await waitFor(() => expect(offlineRequest).toHaveBeenCalledWith('STATUS', urls));
  vi.mocked(offlineRequest).mockResolvedValueOnce({ ...empty, error: 'Storage is full.' });
  fireEvent.click(screen.getByText('Download selected packs'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Storage is full.');
  expect(onReady).toHaveBeenLastCalledWith(false);
  expect(screen.getByText('Download selected packs')).toBeEnabled();
  fireEvent.click(screen.getByText('Remove all downloads'));
  await waitFor(() => expect(offlineRequest).toHaveBeenCalledWith('REMOVE', urls, expect.any(Function)));
});
it('prevents new downloads without a connection', async () => {
  render(<OfflinePanel urls={urls} online={false} onReady={vi.fn()}/>);
  expect(screen.getByText('Download selected packs')).toBeDisabled();
  await waitFor(() => expect(offlineRequest).toHaveBeenCalledWith('STATUS', urls));
});
