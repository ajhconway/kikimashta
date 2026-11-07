import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PracticeAttempt } from '../types';
import { ProgressStore } from './store';

let sequence = 0;
const stores: ProgressStore[] = [];
const databaseNames: string[] = [];

function openStore(name = `progress-test-${sequence++}`) {
  const store = new ProgressStore(name);
  stores.push(store);
  if (!databaseNames.includes(name)) databaseNames.push(name);
  return store;
}

function attempt(overrides: Partial<PracticeAttempt> = {}): PracticeAttempt {
  return {
    id: 'attempt-1', sessionId: 'session-1', itemId: 'cat', language: 'ja-JP',
    choiceIds: ['cat', 'dog'], selectedId: 'cat', correct: true,
    startedAt: 1000, answeredAt: 1500, responseMs: 500, ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close()));
  await Promise.all(databaseNames.splice(0).map(name => deleteDB(name)));
});

describe('local progress', () => {
  it('keeps writing and picture progress separate after reopening while preserving legacy attempts', async () => {
    const name = `progress-test-${sequence++}`;
    const first = openStore(name);
    const legacy = attempt();
    const writing = attempt({ id: 'writing', correct: false, selectedId: 'dog', answeredAt: 2000,
      context: { phase: 'lesson', exercise: 'audio-text', recordingSrc: 'audio/cat.mp3', replays: 0, schedulerVersion: 'fsrs-6-v1' } });
    const picture = attempt({ id: 'picture', answeredAt: 2500,
      context: { ...writing.context!, exercise: 'audio-picture' } });
    await first.merge([legacy, writing, picture]);
    await first.close();
    const reopened = openStore(name);
    expect(await reopened.summary('ja-JP')).toEqual([
      { itemId: 'cat', language: 'ja-JP', exercise: 'audio-picture', attempts: 2, correct: 2, lastPracticedAt: 2500 },
      { itemId: 'cat', language: 'ja-JP', exercise: 'audio-text', attempts: 1, correct: 0, lastPracticedAt: 2000 },
    ]);
    expect(await reopened.all()).toEqual([legacy, picture, writing]);
    expect(legacy.context).toBeUndefined();
  });

  it('atomically merges all languages without replacing immutable attempts or changing the v1 database', async () => {
    const name = `progress-test-${sequence++}`;
    const first = openStore(name);
    const legacy = attempt();
    const correction = attempt({ id: 'correction', context: { phase: 'review', exercise: 'audio-picture', recordingSrc: 'audio/cat.mp3',
      replays: 1, schedulerVersion: 'fsrs-6-v1', retryOf: legacy.id } });
    const spanish = attempt({ id: 'spanish', language: 'es-ES' });
    await first.record(legacy);
    await first.merge([attempt({ correct: false }), correction, correction, spanish]);
    expect(await first.all()).toEqual([legacy, correction, spanish]);
    await first.close();
    const reopened = openStore(name);
    expect(await reopened.all()).toEqual([legacy, correction, spanish]);
    const request = indexedDB.open(name);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(database.version).toBe(1);
    database.close();
  });

  it('keeps concurrent local writes and the first copy of overlapping incoming IDs', async () => {
    const store = openStore();
    const remote = attempt({ id: 'remote' });
    const local = attempt({ id: 'local' });
    await Promise.all([
      store.merge([remote, attempt({ id: remote.id, correct: false })]),
      store.record(local),
      store.merge([remote]),
    ]);
    expect(await store.all()).toEqual([local, remote]);
  });

  it('rolls back the entire merge on a synchronous mid-batch failure and permits retry', async () => {
    const store = openStore();
    const incoming = [attempt({ id: 'a' }), attempt({ id: 'b' })];
    const originalAdd = IDBObjectStore.prototype.add;
    let writes = 0;
    const failure = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>
    ) {
      if (++writes === 2) throw new DOMException('Bad incoming record', 'DataError');
      return originalAdd.apply(this, args);
    });
    await expect(store.merge(incoming)).rejects.toMatchObject({ name: 'DataError' });
    expect(await store.all()).toEqual([]);
    failure.mockRestore();
    await store.merge(incoming);
    expect(await store.all()).toEqual(incoming);
  });

  it('retains complete attempts when a store is closed and opened again', async () => {
    const name = `progress-test-${sequence++}`;
    const first = openStore(name);
    const saved = attempt();
    await first.record(saved);
    await first.close();

    const reopened = openStore(name);
    expect(await reopened.history('ja-JP')).toEqual([saved]);
  });

  it('records an attempt only once even when deliveries overlap', async () => {
    const store = openStore();
    const saved = attempt();
    await Promise.all([store.record(saved), store.record(saved)]);
    await store.record(attempt({ correct: false }));

    expect(await store.history('ja-JP')).toEqual([saved]);
    expect(await store.summary('ja-JP')).toEqual([
      { itemId: 'cat', language: 'ja-JP', exercise: 'audio-picture', attempts: 1, correct: 1, lastPracticedAt: 1500 },
    ]);
  });

  it('keeps languages separate and summarizes out-of-order practice correctly', async () => {
    const store = openStore();
    await store.record(attempt({ id: 'later', answeredAt: 3000 }));
    await store.record(attempt({ id: 'earlier', answeredAt: 2000, correct: false, selectedId: 'dog' }));
    await store.record(attempt({ id: 'spanish', language: 'es-ES', answeredAt: 4000 }));

    expect(await store.summary('ja-JP')).toEqual([
      { itemId: 'cat', language: 'ja-JP', exercise: 'audio-picture', attempts: 2, correct: 1, lastPracticedAt: 3000 },
    ]);
    expect(await store.summary('es-ES')).toEqual([
      { itemId: 'cat', language: 'es-ES', exercise: 'audio-picture', attempts: 1, correct: 1, lastPracticedAt: 4000 },
    ]);
    expect(await store.history('fr-FR')).toEqual([]);
  });

  it('reports an opening failure and allows a later retry', async () => {
    const store = openStore();
    vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('Storage temporarily unavailable', 'UnknownError');
    });
    await expect(store.record(attempt())).rejects.toThrow(/unavailable/i);
    await expect(store.record(attempt())).resolves.toBeUndefined();
    expect(await store.history('ja-JP')).toHaveLength(1);
  });

  it('handles an aborted write without saving a partial record and allows retry', async () => {
    const store = openStore();
    const saved = attempt();
    const originalAdd = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(function (
      this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>
    ) {
      const request = originalAdd.apply(this, args);
      this.transaction.abort();
      return request;
    });

    await expect(store.record(saved)).rejects.toMatchObject({ name: 'AbortError' });
    expect(await store.history('ja-JP')).toEqual([]);
    await expect(store.record(saved)).resolves.toBeUndefined();
    expect(await store.history('ja-JP')).toEqual([saved]);
  });
});
