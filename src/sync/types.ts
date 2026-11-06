import type { PracticeAttempt } from '../types';

/** Immutable edits retain deletions (empty text) and deterministic conflict ordering. */
export interface NoteEvent {
  id: string;
  language: string;
  itemId: string;
  text: string;
  updatedAt: number;
}

/** Both ends are bound to one account before synchronization starts. */
export interface SyncData {
  attempts(): Promise<PracticeAttempt[]>;
  notes(): Promise<NoteEvent[]>;
}
export interface SyncLocal extends SyncData {
  mergeAttempts(attempts: readonly PracticeAttempt[]): Promise<void>;
  mergeNotes(notes: readonly NoteEvent[]): Promise<void>;
}
export interface SyncRemote extends SyncData {
  uploadAttempts(attempts: readonly PracticeAttempt[]): Promise<void>;
  uploadNotes(notes: readonly NoteEvent[]): Promise<void>;
}
