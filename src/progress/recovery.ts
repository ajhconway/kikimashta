import type { PracticeAttempt } from '../types';
import type { ProgressStore } from './store';

interface RecoverySnapshot {
  pendingId: string | null;
  failed: PracticeAttempt | null;
  revision: number;
}

/** One account's in-memory recovery survives keyed practice-screen remounts. */
export class AnswerRecovery {
  private state: RecoverySnapshot = { pendingId: null, failed: null, revision: 0 };
  private listeners = new Set<() => void>();
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(change: Partial<RecoverySnapshot>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  discard = () => { this.update({ failed: null }); };
  async save(store: Pick<ProgressStore, 'record'>, attempt: PracticeAttempt): Promise<boolean> {
    if (this.state.pendingId !== null) return false;
    const original = structuredClone(attempt);
    this.update({ pendingId: original.id, failed: null });
    try { await store.record(original); }
    catch {
      this.update({ pendingId: null, failed: original });
      return false;
    }
    this.update({ pendingId: null, revision: this.state.revision + 1 });
    return true;
  }
}

/** The registry belongs to the unkeyed app shell, never to a global account. */
export function createRecoveryRegistry() {
  const accounts = new Map<string, AnswerRecovery>();
  return (accountId: string) => {
    let recovery = accounts.get(accountId);
    if (!recovery) { recovery = new AnswerRecovery(); accounts.set(accountId, recovery); }
    return recovery;
  };
}
