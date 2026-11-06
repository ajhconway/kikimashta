import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ProgressStore } from '../progress/store';
import { createCloudClient } from './client';
import { synchronize } from './engine';
import { NoteStore } from './notes';
import { SupabaseRemote } from './remote';
import type { NoteEvent } from './types';

export interface AccountSnapshot {
  loading: boolean;
  user: { id: string; email: string } | null;
  status: 'idle' | 'syncing' | 'synced' | 'error';
  error: string | null;
  revision: number;
}

async function guestNoteId(key: string, text: string): Promise<string> {
  const source = new TextEncoder().encode(JSON.stringify([key, text]));
  const digest = await crypto.subtle.digest('SHA-256', source);
  return 'guest:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class EmailCodeRateLimitError extends Error {}

export class AccountRuntime {
  private state: AccountSnapshot = { loading: true, user: null, status: 'idle', error: null, revision: 0 };
  private listeners = new Set<() => void>();
  private progress = new ProgressStore();
  private noteRepository: NoteStore | null = null;
  private generation = 0;
  private running: Promise<void> | null = null;
  private queued = false;
  private initialized: Promise<void>;
  private targetUserId: string | null | undefined;
  private switching: Promise<void> | null = null;
  private unsubscribeAuth: () => void;
  private authEvents = 0;
  private disposed = false;
  constructor(private client: SupabaseClient) {
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (this.disposed) return;
      this.authEvents++;
      // Never run another Supabase request while its auth callback holds a lock.
      queueMicrotask(() => { if (!this.disposed) void this.switchUser(session?.user ?? null); });
    });
    this.unsubscribeAuth = () => data.subscription.unsubscribe();
    this.initialized = client.auth.getSession().then(async ({ data, error }) => {
      if (this.disposed) return;
      if (this.authEvents) { await Promise.resolve(); await this.switching; return; }
      if (error) { this.update({ loading: false, error: 'Sign in again to resume sync.' }); return; }
      await this.switchUser(data.session?.user ?? null);
    }).catch(() => { if (!this.disposed) this.update({ loading: false, error: 'Sign in again to resume sync.' }); });
    window.addEventListener('online', this.changed);
    window.addEventListener('focus', this.changed);
  }
  ready = () => this.initialized;
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  store = () => this.progress;
  notes = () => this.noteRepository;
  private update(change: Partial<AccountSnapshot>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  private switchUser(user: User | null): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const id = user?.id ?? null;
    if (this.targetUserId === id) return this.switching ?? Promise.resolve();
    this.targetUserId = id;
    const generation = ++this.generation;
    this.queued = false;
    const progress = new ProgressStore(id ? `kikimashta-account-${id}` : 'kikimashta-v0');
    const notes = id ? new NoteStore(id) : null;
    const old = this.progress, oldNotes = this.noteRepository;
    this.progress = progress; this.noteRepository = notes;
    void old.close().catch(() => {});
    void oldNotes?.close().catch(() => {});
    this.update({ loading: true, user: user ? { id: user.id, email: user.email ?? '' } : null, status: 'idle', error: null, revision: this.state.revision + 1 });
    const switching = (notes?.load() ?? Promise.resolve()).then(() => {
      if (generation !== this.generation) return;
      this.update({ loading: false });
      if (id) this.changed();
    }).catch(() => {
      if (generation === this.generation) this.update({ loading: false, status: 'error', error: 'Account notes could not load. Reload to retry.' });
    }).finally(() => { if (this.switching === switching) this.switching = null; });
    this.switching = switching;
    return switching;
  }
  changed = () => { void this.sync(); };
  sync = async (): Promise<void> => {
    if (this.disposed || !this.state.user || this.state.loading) return;
    this.queued = true;
    if (this.running) return this.running;
    this.running = this.drain();
    try { await this.running; } finally { this.running = null; if (this.queued) this.changed(); }
  };
  private async drain() {
    while (this.queued && this.state.user && !this.state.loading) {
      this.queued = false;
      const user = this.state.user, generation = this.generation, store = this.progress, notes = this.noteRepository!;
      this.update({ status: 'syncing', error: null });
      try {
        await synchronize({ attempts: () => store.all(), notes: () => notes.events(),
          mergeAttempts: values => generation === this.generation ? store.merge(values) : Promise.resolve(),
          mergeNotes: values => generation === this.generation ? notes.merge(values) : Promise.resolve() }, new SupabaseRemote(this.client, user.id));
        if (generation === this.generation) this.update({ status: 'synced', error: null, revision: this.state.revision + 1 });
      } catch {
        if (generation === this.generation) this.update({ status: 'error', error: 'Saved on this device. Sync will retry when connected.' });
      }
    }
  }
  async sendCode(email: string) {
    const { error } = await this.client.auth.signInWithOtp({ email });
    if (error?.status === 429) throw new EmailCodeRateLimitError();
    if (error) throw new Error(error.message);
  }
  async verifyCode(email: string, token: string) {
    const { data, error } = await this.client.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw new Error(error.message);
    await this.switchUser(data.user);
  }
  async signOut() {
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw new Error(error.message);
    await this.switchUser(null);
  }
  async copyGuestProgress() {
    const id = this.state.user?.id, generation = this.generation, progress = this.progress, notes = this.noteRepository;
    if (this.disposed || !id || !notes) return;
    const guest = new ProgressStore();
    try {
      const attempts = await guest.all();
      const events: NoteEvent[] = [];
      const prefix = 'kikimashta:card-feedback:v1:';
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (!key.startsWith(prefix)) continue;
        const tail = key.slice(prefix.length), separator = tail.indexOf(':');
        if (separator < 1) continue;
        const language = tail.slice(0, separator), itemId = tail.slice(separator + 1), text = localStorage.getItem(key) ?? '';
        // Identical imports deduplicate across devices, while different texts
        // remain distinct immutable events. Account edits supersede either.
        events.push({ id: await guestNoteId(key, text), language, itemId, text, updatedAt: 0 });
      }
      if (generation !== this.generation) return;
      await progress.merge(attempts); await notes.merge(events);
      if (generation === this.generation) { this.update({ revision: this.state.revision + 1 }); await this.sync(); }
    } finally { await guest.close(); }
  }
  async dispose() {
    this.disposed = true;
    this.generation++; this.queued = false;
    window.removeEventListener('online', this.changed); window.removeEventListener('focus', this.changed);
    this.unsubscribeAuth(); this.client.auth.stopAutoRefresh(); this.listeners.clear();
    await this.progress.close();
    await this.noteRepository?.close();
  }
}

let singleton: AccountRuntime | null | undefined;
export function getAccountRuntime(): AccountRuntime | null {
  if (singleton !== undefined) return singleton;
  try { const client = createCloudClient(); singleton = client ? new AccountRuntime(client) : null; }
  catch { singleton = null; }
  return singleton;
}
