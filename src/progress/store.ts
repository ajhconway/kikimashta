import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PracticeAttempt, WordProgress } from '../types';

interface ProgressDatabase extends DBSchema {
  attempts: { key: string; value: PracticeAttempt; indexes: { language: string } };
}

export class ProgressStore {
  private connection?: Promise<IDBPDatabase<ProgressDatabase>>;
  constructor(private readonly name = 'kikimashta-v0') {}
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
    const db = await this.database();
    const tx = db.transaction('attempts', 'readwrite');
    const write = (async () => {
      if (!await tx.store.get(attempt.id)) await tx.store.add(attempt);
    })();
    await Promise.all([write, tx.done]);
  }
  async history(language: string): Promise<PracticeAttempt[]> {
    return (await this.database()).getAllFromIndex('attempts', 'language', language);
  }
  async summary(language: string): Promise<WordProgress[]> {
    const words = new Map<string, WordProgress>();
    for (const attempt of await this.history(language)) {
      const previous = words.get(attempt.itemId) ?? { itemId: attempt.itemId, language, attempts: 0, correct: 0, lastPracticedAt: 0 };
      words.set(attempt.itemId, {
        ...previous, attempts: previous.attempts + 1, correct: previous.correct + Number(attempt.correct),
        lastPracticedAt: Math.max(previous.lastPracticedAt, attempt.answeredAt),
      });
    }
    return [...words.values()];
  }
  async close(): Promise<void> { if (this.connection) (await this.connection).close(); this.connection = undefined; }
}
