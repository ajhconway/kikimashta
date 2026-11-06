import type { SupabaseClient } from '@supabase/supabase-js';
import type { PracticeAttempt } from '../types';
import { validateAttempt, validateNote } from './engine';
import type { NoteEvent, SyncRemote } from './types';

const batchSize = 200;
type Table = 'practice_attempts' | 'card_note_events';
type Key = 'attempt_id' | 'event_id';

/** One remote instance belongs to one authenticated account for its entire life. */
export class SupabaseRemote implements SyncRemote {
  constructor(private readonly client: SupabaseClient, private readonly userId: string) {
    if (typeof userId !== 'string' || !userId.trim()) throw new Error('A synchronized account is required.');
  }

  async uploadAttempts(attempts: readonly PracticeAttempt[]): Promise<void> {
    return this.upload('practice_attempts', 'attempt_id', attempts.map(validateAttempt));
  }
  async uploadNotes(notes: readonly NoteEvent[]): Promise<void> {
    return this.upload('card_note_events', 'event_id', notes.map(validateNote));
  }
  async attempts(): Promise<PracticeAttempt[]> {
    return this.read('practice_attempts', 'attempt_id', validateAttempt);
  }
  async notes(): Promise<NoteEvent[]> {
    return this.read('card_note_events', 'event_id', validateNote);
  }

  private async upload<T extends { id: string }>(table: Table, key: Key, payloads: readonly T[]): Promise<void> {
    for (let offset = 0; offset < payloads.length; offset += batchSize) {
      const rows = payloads.slice(offset, offset + batchSize).map(payload => ({
        user_id: this.userId, [key]: payload.id, payload,
      }));
      const { error } = await this.client.from(table).upsert(rows, {
        onConflict: `user_id,${key}`, ignoreDuplicates: true,
      });
      if (error) throw error;
    }
  }

  private async read<T extends { id: string }>(table: Table, key: Key, validate: (value: unknown) => T): Promise<T[]> {
    const records = new Map<string, T>();
    // Full scans intentionally restart at zero. Inserts during an offset scan
    // can shift pages; duplicate IDs are harmless and later syncs converge.
    // The project's API row limit must be at least our requested 200 rows.
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await this.client.from(table).select(`user_id,${key},payload`)
        .eq('user_id', this.userId).order(key, { ascending: true }).range(offset, offset + batchSize - 1);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Invalid synchronized collection.');
      for (const value of data as unknown[]) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid synchronized row.');
        const row = value as Record<string, unknown>;
        if (row.user_id !== this.userId) throw new Error('Synchronized row belongs to another account.');
        const payload = validate(row.payload);
        if (row[key] !== payload.id) throw new Error('Synchronized row identity does not match its payload.');
        if (!records.has(payload.id)) records.set(payload.id, payload);
      }
      if (data.length < batchSize) return [...records.values()];
    }
  }
}
