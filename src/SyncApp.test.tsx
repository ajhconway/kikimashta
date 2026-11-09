import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AccountSnapshot } from './sync/runtime';
import { ProgressStore } from './progress/store';
import { practicePool } from './core/practice';
import SyncApp from './SyncApp';

const runtime = vi.hoisted(() => ({
  snapshot: vi.fn(), subscribe: vi.fn(), store: vi.fn(), changed: vi.fn(),
  sendCode: vi.fn(), verifyCode: vi.fn(), signOut: vi.fn(), sync: vi.fn(), copyGuestProgress: vi.fn(),
}));
vi.mock('./sync/runtime', async importOriginal => ({
  ...await importOriginal<typeof import('./sync/runtime')>(), getAccountRuntime: () => runtime,
}));

const listeners = new Set<() => void>();
const stores: ProgressStore[] = [];
let currentStore: ProgressStore;
let state: AccountSnapshot;
let view: ReturnType<typeof render>;
function accountStore(id: string) {
  const store = new ProgressStore('recovery-account-' + id); stores.push(store); return store;
}
async function switchAccount(id: string) {
  await currentStore.close();
  currentStore = accountStore(id);
  await act(async () => {
    state = { ...state, user: { id, email: id + '@example.test' }, revision: state.revision + 1 };
    for (const listener of listeners) listener();
  });
}
async function click(button: HTMLElement) { await act(async () => { fireEvent.click(button); }); }
beforeEach(() => {
  localStorage.clear(); listeners.clear();
  currentStore = accountStore('a');
  state = { loading: false, user: { id: 'a', email: 'a@example.test' }, status: 'idle', error: null, revision: 0 };
  runtime.snapshot.mockImplementation(() => state);
  runtime.store.mockImplementation(() => currentStore);
  runtime.subscribe.mockImplementation(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(async () => {
  view?.unmount();
  await Promise.all(stores.splice(0).map(store => store.close()));
  await Promise.all(['a', 'b'].map(id => deleteDB('recovery-account-' + id)));
});

it.each(['before', 'after'] as const)('retains the original account answer when its write fails %s an account change', async timing => {
  const now = Date.now() - 86_400_000;
  const items = practicePool.items.slice(0, 4);
  await currentStore.merge(items.map(item => ({ id: 'seed-' + item.id, sessionId: 'legacy',
    itemId: item.id, language: item.language, choiceIds: items.map(choice => choice.id),
    selectedId: item.id, correct: true, startedAt: now, answeredAt: now, responseMs: 0 })));
  let reject!: (reason: Error) => void;
  const pending = new Promise<void>((_resolve, fail) => { reject = fail; });
  const record = vi.spyOn(currentStore, 'record').mockReturnValueOnce(pending);
  view = render(<SyncApp/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^start/i }));
  await click(screen.getByRole('button', { name: /begin review/i }));
  await click(screen.getAllByRole('button', { name: /choose picture/i })[0]!);
  const original = structuredClone(record.mock.calls[0]![0]);
  await click(screen.getByRole('button', { name: /kikimashta home/i }));
  if (timing === 'before') await act(async () => { reject(new Error('Unavailable')); });
  await switchAccount('b');
  if (timing === 'after') await act(async () => { reject(new Error('Unavailable')); });
  await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(await currentStore.all()).toEqual([]);
  await switchAccount('a');
  expect(await screen.findByRole('alert')).toHaveTextContent(/hasn't been saved/i);
  await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeDisabled());
  await click(screen.getByRole('button', { name: /retry saving/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
  expect((await currentStore.all()).filter(attempt => attempt.id === original.id)).toEqual([original]);
  expect(await currentStore.all()).toHaveLength(5);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start · \d+ reviews?/ })).toBeEnabled());
  await switchAccount('b');
  expect(await currentStore.all()).toEqual([]);
});

it('refreshes the original account when a pending write succeeds after switching away and back', async () => {
  const now = Date.now() - 86_400_000;
  const items = practicePool.items.slice(0, 4);
  await currentStore.merge(items.map(item => ({ id: 'seed-' + item.id, sessionId: 'legacy',
    itemId: item.id, language: item.language, choiceIds: items.map(choice => choice.id),
    selectedId: item.id, correct: true, startedAt: now, answeredAt: now, responseMs: 0 })));
  let resolve!: () => void;
  const pending = new Promise<void>(done => { resolve = done; });
  const originalRecord = currentStore.record.bind(currentStore);
  const record = vi.spyOn(currentStore, 'record').mockImplementationOnce(async attempt => {
    await pending;
    await originalRecord(attempt);
  });
  view = render(<SyncApp/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
  await click(screen.getByRole('button', { name: /^start/i }));
  await click(screen.getByRole('button', { name: /begin review/i }));
  await click(screen.getAllByRole('button', { name: /choose picture/i })[0]!);
  const original = structuredClone(record.mock.calls[0]![0]);
  await click(screen.getByRole('button', { name: /kikimashta home/i }));
  await switchAccount('b');
  await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
  expect(await currentStore.all()).toEqual([]);
  await switchAccount('a');
  await waitFor(() => expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled());
  await act(async () => { resolve(); });
  await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
  expect(await currentStore.all()).toHaveLength(5);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Start · \d+ reviews?/ })).toBeEnabled());
  expect((await currentStore.all()).filter(attempt => attempt.id === original.id)).toEqual([original]);
  await switchAccount('b');
  expect(await currentStore.all()).toEqual([]);
});
