import 'fake-indexeddb/auto';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { deleteDB } from 'idb';
import { afterEach, expect, it, vi } from 'vitest';
import { ProgressStore } from '../progress/store';
import type { PracticeAttempt } from '../types';
import { AccountRuntime } from './runtime';
import { cloudSessionKey } from './client';

const url = 'https://offline-signout.supabase.co';
const accountId = 'offline-signout-account';
const accountDatabase = `kikimashta-account-${accountId}`;
const runtimes: AccountRuntime[] = [];
const clients: SupabaseClient[] = [];
const stores: ProgressStore[] = [];

function attempt(id: string): PracticeAttempt {
  return { id, sessionId: 'saved-session', itemId: 'ja-dog', language: 'ja-JP', choiceIds: ['ja-dog'],
    selectedId: 'ja-dog', correct: true, startedAt: 1000, answeredAt: 1500, responseMs: 500 };
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(runtimes.splice(0).map(runtime => runtime.dispose()));
  await Promise.all(clients.splice(0).map(client => client.auth.dispose()));
  await Promise.all(stores.splice(0).map(store => store.close()));
  await Promise.all(['kikimashta-v0', accountDatabase, `kikimashta-notes-${accountId}`].map(name => deleteDB(name)));
  localStorage.clear(); vi.restoreAllMocks();
});

it('the pinned SDK signs out an expired offline session and preserves other project and practice data', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  // Control only refresh backoff; IndexedDB keeps its real asynchronous scheduler.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const key = cloudSessionKey(url);
  const otherKey = 'sb-other-project-auth-token';
  const expired: Session = { access_token: 'expired-access-token', refresh_token: 'saved-refresh-token', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) - 3600, token_type: 'bearer',
    user: { id: accountId, email: 'account@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
  localStorage.setItem(key, JSON.stringify(expired));
  localStorage.setItem(otherKey, 'other-project-session');
  localStorage.setItem('kikimashta-practice-voices-v1', '["otani"]');
  const guest = new ProgressStore(); stores.push(guest); await guest.record(attempt('guest-only'));
  const account = new ProgressStore(accountDatabase); stores.push(account); await account.record(attempt('account-only'));
  const transport = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Offline'));
  function client() {
    const value = createClient(url, 'sb_publishable_test', { global: { fetch: transport },
      auth: { storage: localStorage, storageKey: key, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } });
    clients.push(value); return value;
  }
  const current = new AccountRuntime(client(), { id: expired.user.id, email: expired.user.email! }); runtimes.push(current); await current.ready();
  expect(current.snapshot().user?.id).toBe(accountId);
  expect(await current.store().all()).toEqual([attempt('account-only')]);
  const signingOut = current.signOut();
  await vi.advanceTimersByTimeAsync(31_000);
  await expect(signingOut).resolves.toBeUndefined();
  expect(transport).toHaveBeenCalled();
  expect(transport.mock.calls.every(([request]) => String(request).includes('/auth/v1/token?grant_type=refresh_token'))).toBe(true);
  expect(localStorage.getItem(key)).toBeNull();
  expect(localStorage.getItem(otherKey)).toBe('other-project-session');
  expect(localStorage.getItem('kikimashta-practice-voices-v1')).toBe('["otani"]');
  expect(current.snapshot().user).toBeNull();
  expect(current.notes()).toBeNull();
  expect(await current.store().all()).toEqual([attempt('guest-only')]);
  expect(await account.all()).toEqual([attempt('account-only')]);
  await current.dispose(); runtimes.splice(runtimes.indexOf(current), 1);
  const reloaded = new AccountRuntime(client()); runtimes.push(reloaded); await reloaded.ready();
  expect(reloaded.snapshot().user).toBeNull();
  expect(await reloaded.store().all()).toEqual([attempt('guest-only')]);
});
