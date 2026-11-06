import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { validateNote } from './engine';
import type { NoteEvent } from './types';

interface NoteDatabase extends DBSchema {
  events: { key: string; value: NoteEvent };
}
interface NoteOptions { now?: () => number; id?: () => string }

/** Account-local immutable edits; an empty winning edit means the note is cleared. */
export class NoteStore {
  readonly databaseName: string;
  private connection?: Promise<IDBPDatabase<NoteDatabase>>;
  private loading?: Promise<void>;
  private loaded = false;
  private readonly latest = new Map<string, NoteEvent>();
  private latestTimestamp = 0;
  private readonly now: () => number;
  private readonly id: () => string;

  constructor(readonly accountId: string, options: NoteOptions = {}) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) throw new Error('Invalid note account.');
    this.databaseName = `kikimashta-notes-${accountId}`;
    this.now = options.now ?? Date.now;
    this.id = options.id ?? (() => crypto.randomUUID());
  }

  private database() {
    this.connection ??= openDB<NoteDatabase>(this.databaseName, 1, {
      upgrade(database) { database.createObjectStore('events', { keyPath: 'id' }); },
    }).catch((error: unknown) => { this.connection = undefined; throw error; });
    return this.connection;
  }

  private apply(events: readonly NoteEvent[]) {
    for (const event of events) {
      const key = JSON.stringify([event.language, event.itemId]);
      const previous = this.latest.get(key);
      if (!previous || event.updatedAt > previous.updatedAt || (event.updatedAt === previous.updatedAt && event.id > previous.id)) {
        this.latest.set(key, structuredClone(event));
      }
      this.latestTimestamp = Math.max(this.latestTimestamp, event.updatedAt);
    }
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loading ??= (async () => {
      const events = (await (await this.database()).getAll('events')).map(validateNote);
      this.apply(events);
      this.loaded = true;
    })().finally(() => { this.loading = undefined; });
    return this.loading;
  }

  read(language: string, itemId: string): string {
    return this.latest.get(JSON.stringify([language, itemId]))?.text ?? '';
  }

  async events(): Promise<NoteEvent[]> {
    const events = (await (await this.database()).getAll('events')).map(validateNote);
    this.apply(events);
    this.loaded = true;
    return structuredClone(events);
  }

  async merge(incoming: readonly NoteEvent[]): Promise<void> {
    const events = structuredClone(incoming.map(validateNote));
    await this.load();
    const transaction = (await this.database()).transaction('events', 'readwrite');
    const received: NoteEvent[] = [];
    const write = (async () => {
      try {
        for (const event of events) {
          const previous = await transaction.store.get(event.id);
          if (!previous) await transaction.store.add(event);
          received.push(previous ? validateNote(previous) : event);
        }
      } catch (error) {
        // Synchronous request failures do not necessarily abort IndexedDB.
        // Explicitly roll back earlier writes in the same incoming batch.
        try { transaction.abort(); } catch { /* The transaction already failed. */ }
        throw error;
      }
    })();
    await Promise.all([write, transaction.done]);
    this.apply(received);
  }

  async write(language: string, itemId: string, text: string): Promise<void> {
    await this.load();
    // Keep successive local edits ordered even within one millisecond or after
    // observing a device whose clock is ahead. Concurrent unseen edits use ID ties.
    const updatedAt = Math.max(this.now(), this.latestTimestamp + 1);
    const event = validateNote({ id: this.id(), language, itemId, text, updatedAt });
    this.latestTimestamp = updatedAt;
    await this.merge([event]);
  }

  async close(): Promise<void> {
    if (this.connection) (await this.connection).close();
    this.connection = undefined;
    this.loaded = false;
  }
}
