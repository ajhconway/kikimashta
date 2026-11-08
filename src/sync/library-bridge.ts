import { getAccountRuntime } from './runtime';

export async function getLibraryAccount() {
  const runtime = getAccountRuntime();
  if (!runtime) return null;
  await runtime.ready();
  const user = runtime.snapshot().user, notes = runtime.notes();
  if (!user || !notes) return null;
  return { userId: user.id, notes, progress: runtime.store(), changed: runtime.changed, subscribe: runtime.subscribe, currentUserId: () => runtime.snapshot().user?.id ?? null };
}
