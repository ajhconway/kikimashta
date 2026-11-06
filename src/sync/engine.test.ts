import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PracticeAttempt } from '../types';
import { ProgressStore } from '../progress/store';
import type { NoteEvent, SyncLocal, SyncRemote } from './types';
import { synchronize, validateAttempt, validateNote } from './engine';

let sequence = 0;
const stores: { name: string; store: ProgressStore }[] = [];
function attempt(id: string, extra: Partial<PracticeAttempt> = {}): PracticeAttempt {
  return { id, sessionId: 'legacy-session', itemId: 'cat', language: 'ja-JP', choiceIds: ['cat', 'dog'],
    selectedId: 'cat', correct: true, startedAt: 1000, answeredAt: 1500, responseMs: 500, ...extra };
}
function note(id: string, text: string, updatedAt = 2000): NoteEvent {
  return { id, language: 'ja-JP', itemId: 'cat', text, updatedAt };
}
function merge<T extends { id: string }>(target: Map<string, T>, incoming: readonly T[]) {
  for (const item of incoming) if (!target.has(item.id)) target.set(item.id, structuredClone(item));
}
function fixture() {
  const name = `sync-test-${sequence++}`;
  const store = new ProgressStore(name);
  stores.push({ name, store });
  const localNotes = new Map<string, NoteEvent>();
  const remoteAttempts = new Map<string, PracticeAttempt>();
  const remoteNotes = new Map<string, NoteEvent>();
  const local: SyncLocal = {
    attempts: () => store.all(), notes: async () => [...localNotes.values()],
    mergeAttempts: vi.fn(incoming => store.merge(incoming)),
    mergeNotes: vi.fn(async incoming => { merge(localNotes, incoming); }),
  };
  const remote: SyncRemote = {
    attempts: vi.fn(async () => [...remoteAttempts.values()]),
    notes: vi.fn(async () => [...remoteNotes.values()]),
    uploadAttempts: vi.fn(async incoming => { merge(remoteAttempts, incoming); }),
    uploadNotes: vi.fn(async incoming => { merge(remoteNotes, incoming); }),
  };
  return { store, local, remote, localNotes, remoteAttempts, remoteNotes };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
afterEach(async () => {
  for (const { name, store } of stores.splice(0)) { await store.close(); await deleteDB(name); }
});

describe('account-bound synchronization', () => {
  it('unions overlapping attempts and immutable note edits/deletions without changing legacy or retry context', async () => {
    const f = fixture();
    const first = attempt('legacy');
    const corrective = attempt('correction', { context: { phase: 'review', exercise: 'audio-picture', recordingSrc: 'audio/cat.mp3',
      replays: 2, schedulerVersion: 'fsrs-6-v1', retryOf: first.id } });
    await f.store.merge([first, corrective]);
    merge(f.remoteAttempts, [first, attempt('other-device', { language: 'es-ES' })]);
    const oldNote = note('note-old', 'Needs a clearer picture');
    const deletion = note('note-delete', '', 3000);
    merge(f.localNotes, [oldNote]);
    merge(f.remoteNotes, [oldNote, deletion]);
    await Promise.all([synchronize(f.local, f.remote), synchronize(f.local, f.remote)]);
    expect((await f.store.all()).map(item => item.id).sort()).toEqual(['correction', 'legacy', 'other-device']);
    expect(f.remoteAttempts.size).toBe(3);
    expect(f.remoteAttempts.get('correction')).toEqual(corrective);
    expect((await f.store.all()).find(item => item.id === first.id)).toEqual(first);
    expect([...f.localNotes.values()].sort((a, b) => a.updatedAt - b.updatedAt).at(-1)).toEqual(deletion);
    expect(f.localNotes.size).toBe(2);
    expect(f.remoteNotes.size).toBe(2);
  });

  it('retries a partial upload without fetching early, duplicating records, or losing local data', async () => {
    const f = fixture();
    await f.store.record(attempt('local'));
    merge(f.localNotes, [note('local-note', 'Keep this')]);
    merge(f.remoteAttempts, [attempt('remote')]);
    vi.mocked(f.remote.uploadNotes).mockRejectedValueOnce(new Error('Connection interrupted'));
    await expect(synchronize(f.local, f.remote)).rejects.toThrow(/interrupted/i);
    expect(f.remoteAttempts.size).toBe(2);
    expect(f.remote.attempts).not.toHaveBeenCalled();
    expect(f.local.mergeAttempts).not.toHaveBeenCalled();
    expect(await f.store.all()).toEqual([attempt('local')]);
    await synchronize(f.local, f.remote);
    expect(f.remoteAttempts.size).toBe(2);
    expect(f.remoteNotes.size).toBe(1);
    expect(await f.store.all()).toEqual([attempt('local'), attempt('remote')]);
  });

  it('preserves attempts and note edits created while snapshots are uploading', async () => {
    const f = fixture();
    const entered = deferred(), release = deferred();
    await f.store.record(attempt('before'));
    vi.mocked(f.remote.uploadAttempts).mockImplementationOnce(async incoming => {
      merge(f.remoteAttempts, incoming); entered.resolve(); await release.promise;
    });
    const sync = synchronize(f.local, f.remote);
    await entered.promise;
    await f.store.record(attempt('during'));
    const deletion = note('during-delete', '');
    merge(f.localNotes, [deletion]);
    release.resolve();
    await sync;
    expect(await f.store.all()).toEqual([attempt('before'), attempt('during')]);
    expect(f.localNotes.get(deletion.id)).toEqual(deletion);
    expect(f.remoteAttempts.has('during')).toBe(false);
    await synchronize(f.local, f.remote);
    expect(f.remoteAttempts.get('during')).toEqual(attempt('during'));
    expect(f.remoteNotes.get(deletion.id)).toEqual(deletion);
  });

  it('validates both downloaded collections before writing either collection locally', async () => {
    const f = fixture();
    merge(f.remoteAttempts, [attempt('valid-remote')]);
    vi.mocked(f.remote.notes).mockResolvedValueOnce([{ ...note('bad-note', 'text'), itemId: 17 }] as unknown as NoteEvent[]);
    await expect(synchronize(f.local, f.remote)).rejects.toThrow(/note/i);
    expect(f.local.mergeAttempts).not.toHaveBeenCalled();
    expect(f.local.mergeNotes).not.toHaveBeenCalled();
    expect(await f.store.all()).toEqual([]);
    vi.mocked(f.remote.attempts).mockResolvedValueOnce([{ ...attempt('bad-attempt'), answeredAt: 'yesterday' }] as unknown as PracticeAttempt[]);
    await expect(synchronize(f.local, f.remote)).rejects.toThrow(/attempt/i);
    expect(f.local.mergeAttempts).not.toHaveBeenCalled();
  });

  it('recovers when the first local collection was merged before a later merge failed', async () => {
    const f = fixture();
    merge(f.remoteAttempts, [attempt('remote')]);
    merge(f.remoteNotes, [note('remote-note', '')]);
    vi.mocked(f.local.mergeNotes).mockRejectedValueOnce(new Error('Local notes temporarily unavailable'));
    await expect(synchronize(f.local, f.remote)).rejects.toThrow(/temporarily/i);
    expect(await f.store.all()).toEqual([attempt('remote')]);
    await synchronize(f.local, f.remote);
    expect(await f.store.all()).toEqual([attempt('remote')]);
    expect(f.localNotes.get('remote-note')!.text).toBe('');
  });

  it('rejects malformed collection responses and local data before an unsafe transfer', async () => {
    const f = fixture();
    vi.mocked(f.remote.attempts).mockResolvedValueOnce(null as unknown as PracticeAttempt[]);
    await expect(synchronize(f.local, f.remote)).rejects.toThrow(/payload/i);
    expect(f.local.mergeAttempts).not.toHaveBeenCalled();
    f.local.attempts = async () => [attempt('bad-local', { responseMs: Infinity })];
    vi.mocked(f.remote.uploadAttempts).mockClear();
    await expect(synchronize(f.local, f.remote)).rejects.toThrow(/attempt/i);
    expect(f.remote.uploadAttempts).not.toHaveBeenCalled();
  });
});

describe('sync payload validation', () => {
  it('requires whole, safe millisecond values accepted by the database schema', () => {
    for (const invalid of [0.5, -1, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
      for (const field of ['startedAt', 'answeredAt', 'responseMs']) {
        expect(() => validateAttempt({ ...attempt('invalid-time'), [field]: invalid })).toThrow(/attempt/i);
      }
      expect(() => validateNote({ ...note('invalid-time', ''), updatedAt: invalid })).toThrow(/note/i);
    }
    expect(validateNote(note('guest-import', '', 0)).updatedAt).toBe(0);
  });

  it('accepts legacy string IDs and deletion events without coercing invalid values', () => {
    expect(validateAttempt(attempt('old-format-id'))).toEqual(attempt('old-format-id'));
    expect(validateNote(note('deletion-id', ''))).toEqual(note('deletion-id', ''));
    for (const value of [null, [], { ...attempt(''), id: '' }, { ...attempt('bad'), correct: 'true' },
      { ...attempt('bad'), choiceIds: ['cat', 1] }, { ...attempt('bad'), startedAt: NaN }]) {
      expect(() => validateAttempt(value)).toThrow(/attempt/i);
    }
    const context = { phase: 'review', exercise: 'audio-picture', recordingSrc: 'audio/cat.mp3', replays: 0, schedulerVersion: 'fsrs-6-v1' };
    for (const invalid of [{ ...context, phase: ['review'] }, { ...context, replays: '1' }, { ...context, retryOf: '' }]) {
      expect(() => validateAttempt({ ...attempt('bad-context'), context: invalid })).toThrow(/context/i);
    }
    for (const value of [{ ...note('bad', ''), text: null }, { ...note('bad', ''), updatedAt: Infinity }, { ...note('bad', ''), language: 12 }]) {
      expect(() => validateNote(value)).toThrow(/note/i);
    }
  });
});
