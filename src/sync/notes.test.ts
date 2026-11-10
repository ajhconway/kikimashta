import 'fake-indexeddb/auto';
import { deleteDB, openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoteStore } from './notes';
import type { NoteEvent } from './types';

const stores: NoteStore[] = [];
let sequence = 0;
function open(account = `notes-test-${sequence++}`, now = () => 1000) {
  const store = new NoteStore(account, { now, id: () => `event-${sequence++}` });
  stores.push(store);
  return store;
}
const event = (overrides: Partial<NoteEvent> = {}): NoteEvent => ({ id: 'event-a', language: 'ja', itemId: 'cat', text: 'A softer ending.', updatedAt: 1000, ...overrides });
afterEach(async () => {
  const names = new Set(stores.map(store => store.databaseName));
  await Promise.all(stores.splice(0).map(store => store.close()));
  await Promise.all([...names].map(name => deleteDB(name)));
});

describe('account card notes', () => {
  it('reads existing notes from the unchanged production account database', async () => {
    const account = 'legacy-production-notes', name = `kikimashta-notes-${account}`;
    const legacy = await openDB(name, 1, { upgrade(db) { db.createObjectStore('events', { keyPath: 'id' }); } });
    await legacy.put('events', event()); legacy.close();
    const current = open(account); await current.load();
    expect(current.databaseName).toBe(name);
    expect(current.read('ja', 'cat')).toBe('A softer ending.');
  });

  it('retains edits across reopening and orders rapid writes while keeping languages separate', async () => {
    const first = open();
    await first.write('ja', 'cat', 'First');
    await first.write('ja', 'cat', 'Second');
    await first.write('fr', 'cat', 'French');
    await first.close();
    const reopened = open(first.accountId);
    await reopened.load();
    expect(reopened.read('ja', 'cat')).toBe('Second');
    expect(reopened.read('fr', 'cat')).toBe('French');
    const saved = await reopened.events();
    expect(saved).toHaveLength(3);
    expect(new Set(saved.map(item => item.updatedAt)).size).toBe(3);
  });

  it('retains a cleared note as a tombstone when old edits arrive later', async () => {
    const source = open();
    const destination = open();
    await source.merge([event()]);
    await source.write('ja', 'cat', '');
    const edits = await source.events();
    await destination.merge([...edits].reverse());
    await destination.merge([event()]);
    expect(destination.read('ja', 'cat')).toBe('');
    expect(await destination.events()).toHaveLength(2);
  });

  it('resolves concurrent ties deterministically and lets later edits win regardless of delivery order', async () => {
    const first = open();
    const second = open();
    const edits = [event({ id: 'edit-a', text: 'A' }), event({ id: 'edit-b', text: 'B' })];
    await first.merge(edits);
    await second.merge([...edits].reverse());
    expect(first.read('ja', 'cat')).toBe('B');
    expect(second.read('ja', 'cat')).toBe('B');
    await first.write('ja', 'cat', 'New edit after observing both');
    await second.merge(await first.events());
    expect(second.read('ja', 'cat')).toBe('New edit after observing both');
  });

  it('keeps immutable event IDs once and does not expose mutable cache objects', async () => {
    const store = open();
    await Promise.all([store.merge([event()]), store.merge([event()])]);
    await store.merge([event({ text: 'Changed payload for the same event', updatedAt: 9000 })]);
    const saved = await store.events();
    expect(saved).toEqual([event()]);
    saved[0]!.text = 'Caller changed this copy';
    expect(store.read('ja', 'cat')).toBe('A softer ending.');
  });

  it('rejects an invalid batch before writing any edits', async () => {
    const store = open();
    await store.merge([event()]);
    await expect(store.merge([event({ id: 'valid', itemId: 'dog' }), event({ id: '', itemId: 'dog' })])).rejects.toThrow(/invalid/i);
    expect(await store.events()).toEqual([event()]);
    expect(store.read('ja', 'dog')).toBe('');
  });

  it('leaves saved cache unchanged after an aborted write and can save a later retry', async () => {
    const store = open();
    await store.merge([event()]);
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      const request = add.apply(this, args);
      this.transaction.abort();
      return request;
    });
    await expect(store.write('ja', 'cat', 'Unsaved')).rejects.toMatchObject({ name: 'AbortError' });
    expect(store.read('ja', 'cat')).toBe('A softer ending.');
    expect(await store.events()).toEqual([event()]);
    await store.write('ja', 'cat', 'Retry');
    expect(store.read('ja', 'cat')).toBe('Retry');
  });

  it('rolls back the entire merge when a later request throws synchronously', async () => {
    const store = open();
    await store.merge([event()]);
    const add = IDBObjectStore.prototype.add;
    let requests = 0;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      if (++requests === 2) throw new DOMException('Request could not be created', 'DataError');
      return add.apply(this, args);
    });
    await expect(store.merge([
      event({ id: 'new-a', itemId: 'dog' }), event({ id: 'new-b', itemId: 'apple' }),
    ])).rejects.toThrow('Request could not be created');
    expect(await store.events()).toEqual([event()]);
    expect(store.read('ja', 'dog')).toBe('');
    expect(store.read('ja', 'apple')).toBe('');
  });

  it('isolates account databases and observes edits saved by another instance', async () => {
    const first = open();
    const otherTab = open(first.accountId);
    const secondAccount = open();
    await first.write('ja', 'cat', 'Private to this account');
    await otherTab.events();
    await secondAccount.load();
    expect(otherTab.read('ja', 'cat')).toBe('Private to this account');
    expect(secondAccount.read('ja', 'cat')).toBe('');
    expect(await secondAccount.events()).toEqual([]);
  });
});
