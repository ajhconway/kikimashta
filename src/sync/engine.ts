import type { PracticeAttempt } from '../types';
import { answerOutcome } from '../core/quiz-timer';
import type { NoteEvent, SyncLocal, SyncRemote } from './types';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function identity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function timestamp(value: unknown): value is number {
  return nonnegative(value) && Number.isFinite(new Date(value).getTime());
}

/** Legacy identities are strings, not necessarily UUIDs. Never coerce payloads. */
export function validateAttempt(value: unknown): PracticeAttempt {
  if (!object(value) || !['id', 'sessionId', 'itemId', 'language', 'selectedId'].every(key => identity(value[key])) ||
      !Array.isArray(value.choiceIds) || !value.choiceIds.length || !value.choiceIds.every(identity) ||
      typeof value.correct !== 'boolean' || !timestamp(value.startedAt) || !timestamp(value.answeredAt) || !nonnegative(value.responseMs)) {
    throw new Error('Invalid synchronized practice attempt.');
  }
  if (value.context !== undefined) {
    const context = value.context;
    if (!object(context) || (context.phase !== 'lesson' && context.phase !== 'review') ||
        (context.exercise !== 'audio-picture' && context.exercise !== 'audio-text') ||
        !identity(context.recordingSrc) || !Number.isInteger(context.replays) || !nonnegative(context.replays) ||
        !identity(context.schedulerVersion) || (context.retryOf !== undefined && !identity(context.retryOf))) {
      throw new Error('Invalid synchronized attempt context.');
    }
  }
  if (value.outcome !== undefined && (
    !['success', 'partial', 'failure'].includes(value.outcome as string) ||
    (value.correct ? value.outcome === 'failure' : value.outcome !== 'failure')
  )) throw new Error('Invalid synchronized answer outcome.');
  if (value.timer !== undefined) {
    const timer = value.timer;
    if (!object(timer) || !nonnegative(timer.limitMs) || timer.limitMs === 0 || !timestamp(timer.startedAt) ||
        timer.startedAt < value.startedAt || timer.startedAt > value.answeredAt) {
      throw new Error('Invalid synchronized quiz timer.');
    }
  }
  if (value.outcome === 'partial' && (!object(value.timer) ||
      value.answeredAt - (value.timer.startedAt as number) < (value.timer.limitMs as number))) {
    throw new Error('Partial success requires an expired quiz timer.');
  }
  if (value.outcome !== undefined && value.outcome !== answerOutcome(value.correct,
    value.timer as PracticeAttempt['timer'], value.answeredAt)) {
    throw new Error('Synchronized outcome does not match the timer.');
  }
  return value as unknown as PracticeAttempt;
}

/** Empty text is an immutable deletion event and must survive synchronization. */
export function validateNote(value: unknown): NoteEvent {
  if (!object(value) || !['id', 'language', 'itemId'].every(key => identity(value[key])) || typeof value.text !== 'string' || !timestamp(value.updatedAt)) {
    throw new Error('Invalid synchronized card note.');
  }
  return value as unknown as NoteEvent;
}

function validated<T>(payload: unknown, validate: (value: unknown) => T): T[] {
  if (!Array.isArray(payload)) throw new Error('Invalid synchronization payload.');
  return payload.map(validate);
}

/**
 * Both adapters are already bound to the same account. Snapshot uploads are
 * idempotent; merge only adds data, so local writes during the transfer survive.
 * A failed transfer may have partially reached the server and is safe to retry.
 */
export async function synchronize(local: SyncLocal, remote: SyncRemote): Promise<void> {
  const [localAttempts, localNotes] = await Promise.all([local.attempts(), local.notes()]);
  const attempts = structuredClone(validated(localAttempts, validateAttempt));
  const notes = structuredClone(validated(localNotes, validateNote));
  await remote.uploadAttempts(attempts);
  await remote.uploadNotes(notes);
  const [remoteAttempts, remoteNotes] = await Promise.all([remote.attempts(), remote.notes()]);
  // Validate both collections before writing either, so a corrupt note cannot
  // leave an otherwise valid downloaded attempt imported by a failed sync.
  const incomingAttempts = structuredClone(validated(remoteAttempts, validateAttempt));
  const incomingNotes = structuredClone(validated(remoteNotes, validateNote));
  await local.mergeAttempts(incomingAttempts);
  await local.mergeNotes(incomingNotes);
}
