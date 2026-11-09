import { scopedKey } from '../core/device-storage';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PracticeAttempt } from '../types';

interface ProgressDatabase extends DBSchema {
  attempts: { key: string; value: PracticeAttempt; indexes: { language: string } };
}

export class ProgressStore {
  private connection?: Promise<IDBPDatabase<ProgressDatabase>>;
  private readonly name: string;
  constructor(name = 'kikimashta-v0') { this.name = scopedKey(name); }
  private database() {
    this.connection ??= openDB<ProgressDatabase>(this.name, 1, {
      upgrade(db) {
        const attempts = db.createObjectStore('attempts', { keyPath: 'id' });
        attempts.createIndex('language', 'language');
      },
    }).catch((error: unknown) => {
      this.connection = undefined;
      throw error;
    });
    return this.connection;
  }
  async record(attempt: PracticeAttempt): Promise<void> {
    return this.merge([attempt]);
  }
  /** Union incoming immutable attempts in one transaction; existing IDs win. */
  async merge(attempts: readonly PracticeAttempt[]): Promise<void> {
    const snapshot = structuredClone([...attempts]);
    if (!snapshot.length) return;
    const db = await this.database();
    const tx = db.transaction('attempts', 'readwrite');
    const write = (async () => {
      try {
        for (const attempt of snapshot) {
          if (!await tx.store.get(attempt.id)) await tx.store.add(attempt);
        }
      } catch (error) {
        // A synchronous IDB failure does not necessarily abort earlier writes.
        try { tx.abort(); } catch { /* The request may already have aborted it. */ }
        throw error;
      }
    })();
    await Promise.all([write, tx.done]);
  }
  async all(): Promise<PracticeAttempt[]> {
    return (await this.database()).getAll('attempts');
  }
  async history(language: string): Promise<PracticeAttempt[]> {
    return (await this.database()).getAllFromIndex('attempts', 'language', language);
  }
  async close(): Promise<void> { if (this.connection) (await this.connection).close(); this.connection = undefined; }
}
