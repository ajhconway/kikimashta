import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { deleteDB } from 'idb';
import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PracticeAttempt } from '../types';
import { ProgressStore } from '../progress/store';
import { NoteStore } from './notes';
import type { NoteEvent, SyncRemote } from './types';
import { AccountRuntime } from './runtime';

const { remotes } = vi.hoisted(() => ({ remotes: new Map<string, SyncRemote>() }));
vi.mock('./remote', () => ({ SupabaseRemote: vi.fn(function (_client: SupabaseClient, id: string) {
  const remote = remotes.get(id);
  if (!remote) throw new Error('Missing test account transport.');
  return remote;
}) }));

let sequence = 0;
const runtimes: AccountRuntime[] = [];
const extraStores: ProgressStore[] = [];
const databases = new Set<string>();
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function session(id: string): Session {
  const user: User = { id, email: `${id}@example.com`, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  return { user, access_token: 'fixture', refresh_token: 'fixture', expires_in: 3600, token_type: 'bearer' };
}
type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;
function auth(initial: Session | null, options: { initial?: Promise<{ data: { session: Session | null }; error: null }>; emitInitial?: boolean } = {}) {
  let listener: AuthListener | null = null;
  const unsubscribed = vi.fn();
  const emit = (event: AuthChangeEvent, value: Session | null) => { listener?.(event, value); };
  const adapter = {
    onAuthStateChange: vi.fn((callback: AuthListener) => {
      listener = callback;
      if (options.emitInitial !== false) queueMicrotask(() => emit('INITIAL_SESSION', initial));
      return { data: { subscription: { unsubscribe: () => { unsubscribed(); listener = null; } } } };
    }),
    getSession: vi.fn(() => options.initial ?? Promise.resolve({ data: { session: initial }, error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ data: { user: initial?.user ?? null }, error: null })),
    signOut: vi.fn(async () => { emit('SIGNED_OUT', null); return { error: null }; }),
    stopAutoRefresh: vi.fn(),
  };
  return { client: { auth: adapter } as unknown as SupabaseClient, adapter, emit, unsubscribed };
}
function attempt(id = 'legacy-local'): PracticeAttempt {
  return { id, sessionId: 'old-session', itemId: 'cat', language: 'ja-JP', choiceIds: ['cat', 'dog'], selectedId: 'cat',
    correct: true, startedAt: 1000, answeredAt: 1500, responseMs: 500 };
}
function server(id = `account-${sequence++}`) {
  databases.add(`kikimashta-account-${id}`); databases.add(`kikimashta-notes-${id}`);
  const attempts = new Map<string, PracticeAttempt>();
  const notes = new Map<string, NoteEvent>();
  const remote: SyncRemote = {
    attempts: vi.fn(async () => [...attempts.values()]), notes: vi.fn(async () => [...notes.values()]),
    uploadAttempts: vi.fn(async incoming => { for (const value of incoming) if (!attempts.has(value.id)) attempts.set(value.id, structuredClone(value)); }),
    uploadNotes: vi.fn(async incoming => { for (const value of incoming) if (!notes.has(value.id)) notes.set(value.id, structuredClone(value)); }),
  };
  remotes.set(id, remote);
  return { id, remote, attempts, notes };
}
function runtime(client: SupabaseClient) {
  const value = new AccountRuntime(client); runtimes.push(value); return value;
}
function store(name = 'kikimashta-v0') {
  const value = new ProgressStore(name); extraStores.push(value); databases.add(name); return value;
}
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); localStorage.clear(); databases.add('kikimashta-v0'); remotes.clear(); });
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(value => value.dispose()));
  await Promise.all(extraStores.splice(0).map(value => value.close()));
  await Promise.all([...databases].map(name => deleteDB(name)));
  databases.clear(); localStorage.clear(); vi.unstubAllGlobals();
});

describe('account runtime lifecycle', () => {
  it('leaves guest progress private until an explicit, repeatable copy and imports notes at timestamp zero', async () => {
    const guest = store();
    await guest.record(attempt());
    const key = 'kikimashta:card-feedback:v1:ja-JP:cat';
    localStorage.setItem(key, 'Guest note');
    const account = server();
    const current = runtime(auth(session(account.id)).client);
    await current.ready(); await current.sync();
    expect(await current.store().all()).toEqual([]);
    expect(account.attempts.size).toBe(0);
    expect(account.notes.size).toBe(0);
    await current.copyGuestProgress(); await current.copyGuestProgress();
    expect(await current.store().all()).toEqual([attempt()]);
    expect(account.attempts.size).toBe(1);
    expect(account.attempts.get('legacy-local')).toEqual(attempt());
    expect([...account.notes.values()]).toEqual([{ id: expect.stringMatching(/^guest:[0-9a-f]{64}$/), language: 'ja-JP', itemId: 'cat', text: 'Guest note', updatedAt: 0 }]);
    expect(current.notes()!.read('ja-JP', 'cat')).toBe('Guest note');
    expect(await guest.all()).toEqual([attempt()]);
    expect(localStorage.getItem(key)).toBe('Guest note');
  });

  it('converges differing guest notes from independent devices and lets account edits or deletions win', async () => {
    const key = 'kikimashta:card-feedback:v1:ja-JP:cat';
    const account = server();
    async function disconnectDevice(value: AccountRuntime) {
      await value.sync(); await value.dispose();
      runtimes.splice(runtimes.indexOf(value), 1);
      // Simulate a fresh browser's account databases; the shared remote remains.
      await deleteDB(`kikimashta-account-${account.id}`);
      await deleteDB(`kikimashta-notes-${account.id}`);
    }
    localStorage.setItem(key, 'Guest note from device A');
    const first = runtime(auth(session(account.id)).client);
    await first.ready(); await first.copyGuestProgress();
    const firstSnapshot = await first.notes()!.events();
    expect(firstSnapshot).toHaveLength(1);
    await disconnectDevice(first);

    localStorage.setItem(key, 'Different guest note from device B');
    const second = runtime(auth(session(account.id)).client);
    await second.ready(); await second.copyGuestProgress(); await second.copyGuestProgress();
    const secondSnapshot = await second.notes()!.events();
    expect(secondSnapshot).toHaveLength(2);
    expect(new Set(secondSnapshot.map(event => event.id)).size).toBe(2);
    expect(secondSnapshot.every(event => /^guest:[0-9a-f]{64}$/.test(event.id) && event.updatedAt === 0)).toBe(true);
    expect(secondSnapshot.map(event => event.text).sort()).toEqual(['Different guest note from device B', 'Guest note from device A']);
    const winner = second.notes()!.read('ja-JP', 'cat');
    expect(account.notes.size).toBe(2);
    await disconnectDevice(second);

    // Restore A's earlier repository, then deliver the shared history in the
    // opposite order. Both device snapshots must choose the same winning text.
    const restored = new NoteStore(account.id);
    await restored.merge(firstSnapshot); await restored.close();
    vi.mocked(account.remote.notes).mockImplementation(async () => [...account.notes.values()].reverse());
    localStorage.setItem(key, 'Guest note from device A');
    const returning = runtime(auth(session(account.id)).client);
    await returning.ready(); await returning.sync();
    expect(returning.notes()!.read('ja-JP', 'cat')).toBe(winner);
    expect(await returning.notes()!.events()).toHaveLength(2);
    await returning.copyGuestProgress();
    expect(account.notes.size).toBe(2);
    await returning.notes()!.write('ja-JP', 'cat', 'Signed-in account edit');
    await returning.sync(); await returning.copyGuestProgress();
    expect(returning.notes()!.read('ja-JP', 'cat')).toBe('Signed-in account edit');
    await returning.notes()!.write('ja-JP', 'cat', '');
    await returning.sync();
    localStorage.setItem(key, 'Different guest note from device B');
    await returning.copyGuestProgress();
    expect(returning.notes()!.read('ja-JP', 'cat')).toBe('');
    expect(account.notes.size).toBe(4);
  });

  it('keeps account stores separate and ignores an old account download after switching', async () => {
    const a = server(), b = server();
    const pendingA = deferred<PracticeAttempt[]>();
    a.attempts.set('from-a', attempt('from-a')); b.attempts.set('from-b', attempt('from-b'));
    a.notes.set('note-a', { id: 'note-a', language: 'ja-JP', itemId: 'cat', text: 'Private A', updatedAt: 2000 });
    b.notes.set('note-b', { id: 'note-b', language: 'ja-JP', itemId: 'cat', text: 'Private B', updatedAt: 3000 });
    vi.mocked(a.remote.attempts).mockReturnValueOnce(pendingA.promise);
    const identity = auth(session(a.id));
    const current = runtime(identity.client);
    await current.ready();
    await waitFor(() => expect(a.remote.attempts).toHaveBeenCalled());
    identity.emit('SIGNED_IN', session(b.id));
    await waitFor(() => expect(current.snapshot()).toMatchObject({ user: { id: b.id }, loading: false }));
    pendingA.resolve([attempt('from-a')]);
    await current.sync();
    expect(await current.store().all()).toEqual([attempt('from-b')]);
    expect(current.notes()!.read('ja-JP', 'cat')).toBe('Private B');
    expect((await current.notes()!.events()).map(note => note.id)).toEqual(['note-b']);
    expect(current.snapshot().user!.id).toBe(b.id);
    identity.emit('SIGNED_IN', session(a.id));
    await waitFor(() => expect(current.snapshot()).toMatchObject({ user: { id: a.id }, loading: false }));
    await current.sync();
    expect(await current.store().all()).toEqual([attempt('from-a')]);
    expect(current.notes()!.read('ja-JP', 'cat')).toBe('Private A');
    expect((await current.notes()!.events()).map(note => note.id)).toEqual(['note-a']);
    expect(await store(`kikimashta-account-${b.id}`).all()).toEqual([attempt('from-b')]);
  });

  it('waits for notes loading when auth and verification select the same account', async () => {
    const account = server();
    const release = deferred<void>();
    const load = NoteStore.prototype.load;
    vi.spyOn(NoteStore.prototype, 'load').mockImplementation(async function (this: NoteStore) {
      if (this.accountId === account.id) await release.promise;
      return load.call(this);
    });
    const identity = auth(session(account.id));
    const current = runtime(identity.client);
    let ready = false, verified = false;
    void current.ready().then(() => { ready = true; });
    await waitFor(() => expect(current.snapshot().user?.id).toBe(account.id));
    const verification = current.verifyCode('person@example.com', '123456').then(() => { verified = true; });
    await Promise.resolve(); await Promise.resolve();
    expect(ready).toBe(false); expect(verified).toBe(false);
    expect(current.snapshot().loading).toBe(true);
    release.resolve();
    await current.ready(); await verification; await current.sync();
    expect(ready).toBe(true); expect(verified).toBe(true);
    expect(current.snapshot().loading).toBe(false);
    expect(identity.adapter.verifyOtp).toHaveBeenCalledWith({ email: 'person@example.com', token: '123456', type: 'email' });
  });

  it('does not let a stale initial session overwrite a newer auth event', async () => {
    const oldSession = deferred<{ data: { session: Session | null }; error: null }>();
    const account = server();
    const identity = auth(null, { initial: oldSession.promise, emitInitial: false });
    const current = runtime(identity.client);
    identity.emit('SIGNED_IN', session(account.id));
    oldSession.resolve({ data: { session: null }, error: null });
    await current.ready(); await current.sync();
    expect(current.snapshot()).toMatchObject({ loading: false, user: { id: account.id } });
  });

  it('queues another pass for local changes made during a running transfer', async () => {
    const account = server();
    const identity = auth(session(account.id));
    const current = runtime(identity.client);
    await current.ready(); await current.sync();
    const entered = deferred<void>(), release = deferred<void>();
    const upload = account.remote.uploadAttempts;
    vi.mocked(upload).mockImplementationOnce(async incoming => {
      for (const value of incoming) account.attempts.set(value.id, value);
      entered.resolve(); await release.promise;
    });
    await current.store().record(attempt('first'));
    const running = current.sync();
    await entered.promise;
    await current.store().record(attempt('during-sync'));
    await current.notes()!.write('ja-JP', 'cat', 'Written during sync');
    current.changed();
    release.resolve();
    await running;
    expect(account.attempts.get('during-sync')).toEqual(attempt('during-sync'));
    expect([...account.notes.values()].map(note => note.text)).toEqual(['Written during sync']);
    expect(await current.store().all()).toEqual([attempt('during-sync'), attempt('first')]);
    expect(current.snapshot().status).toBe('synced');
  });

  it('retains local progress after a network failure and syncs it on retry', async () => {
    const account = server();
    await store(`kikimashta-account-${account.id}`).record(attempt());
    vi.mocked(account.remote.uploadAttempts).mockRejectedValueOnce(new Error('Offline'));
    const current = runtime(auth(session(account.id)).client);
    await current.ready();
    await waitFor(() => expect(current.snapshot().status).toBe('error'));
    expect(await current.store().all()).toEqual([attempt()]);
    expect(current.snapshot().error).toMatch(/saved on this device/i);
    await current.sync();
    expect(account.attempts.get('legacy-local')).toEqual(attempt());
    expect(current.snapshot()).toMatchObject({ status: 'synced', error: null });
  });

  it('returns to the guest store on sign-out and delegates email code requests', async () => {
    const account = server();
    const guest = store(); await guest.record(attempt('guest'));
    const identity = auth(session(account.id));
    const current = runtime(identity.client);
    await current.ready(); await current.sync();
    await current.store().record(attempt('account-only')); await current.sync();
    await current.sendCode('person@example.com');
    expect(identity.adapter.signInWithOtp).toHaveBeenCalledWith({ email: 'person@example.com' });
    await current.signOut();
    expect(identity.adapter.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(current.snapshot().user).toBeNull();
    expect(current.notes()).toBeNull();
    expect(await current.store().all()).toEqual([attempt('guest')]);
    expect(account.attempts.has('guest')).toBe(false);
  });

  it('ignores a pending initial response after disposal and unsubscribes auth', async () => {
    const initial = deferred<{ data: { session: Session | null }; error: null }>();
    const account = server();
    const identity = auth(null, { initial: initial.promise, emitInitial: false });
    const current = runtime(identity.client);
    await current.dispose();
    initial.resolve({ data: { session: session(account.id) }, error: null });
    await current.ready();
    expect(current.snapshot().user).toBeNull();
    expect(account.remote.uploadAttempts).not.toHaveBeenCalled();
    expect(identity.unsubscribed).toHaveBeenCalledTimes(1);
    expect(identity.adapter.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('cancels an auth callback already queued when the runtime is disposed', async () => {
    const account = server();
    const identity = auth(null);
    const current = runtime(identity.client);
    await current.ready();
    identity.emit('SIGNED_IN', session(account.id));
    await current.dispose();
    await Promise.resolve();
    expect(current.snapshot().user).toBeNull();
    expect(current.notes()).toBeNull();
    expect(account.remote.uploadAttempts).not.toHaveBeenCalled();
  });
});
