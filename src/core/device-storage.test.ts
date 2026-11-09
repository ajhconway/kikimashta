import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { createDeviceStorage } from './device-storage';
import type { PracticeAttempt } from '../types';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    clear: () => values.clear(),
  };
}
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('isolates preference reads, logical enumeration, removal and clear to its namespace', () => {
  const source = memoryStorage();
  source.setItem('language', 'root'); source.setItem('other:language', 'other');
  const demo = createDeviceStorage(() => source, 'demo:');
  expect(demo.getItem('language')).toBeNull();
  demo.setItem('language', 'demo'); demo.setItem('feedback:word', 'note');
  expect(demo.length).toBe(2); expect([demo.key(0), demo.key(1)]).toEqual(['language', 'feedback:word']);
  expect(demo.key(2)).toBeNull(); expect(source.getItem('language')).toBe('root');
  demo.removeItem('language'); expect(source.getItem('demo:language')).toBeNull();
  demo.clear(); expect(source.getItem('language')).toBe('root'); expect(source.getItem('other:language')).toBe('other');
  expect(demo.length).toBe(0);
});

it('keeps the ordinary deployment keys unchanged and rejects invalid configured namespaces', async () => {
  vi.stubEnv('VITE_STORAGE_NAMESPACE', '');
  expect((await import('./device-storage')).scopedKey('kikimashta-v0')).toBe('kikimashta-v0');
  vi.resetModules(); vi.stubEnv('VITE_STORAGE_NAMESPACE', '../demo');
  await expect(import('./device-storage')).rejects.toThrow('Invalid device storage namespace');
});

const attempt = (id: string): PracticeAttempt => ({ id, sessionId: 'session', itemId: 'word', language: 'ja-JP', choiceIds: ['word'], selectedId: 'word', correct: true, startedAt: 0, answeredAt: 1, responseMs: 1 });
it('uses separate real IndexedDB databases for demo attempts and account notes', async () => {
  vi.stubEnv('VITE_STORAGE_NAMESPACE', ''); vi.resetModules();
  const { ProgressStore: RootProgress } = await import('../progress/store');
  const { NoteStore: RootNotes } = await import('../sync/notes');
  const root = new RootProgress('namespace-check-234');
  const rootNotes = new RootNotes('namespace-check-234');
  await root.record(attempt('root'));
  await rootNotes.merge([{ id: 'root-note', language: 'ja-JP', itemId: 'word', text: 'root note', updatedAt: 1 }]);
  vi.stubEnv('VITE_STORAGE_NAMESPACE', 'offline-demo'); vi.resetModules();
  const { ProgressStore: DemoProgress } = await import('../progress/store');
  const { NoteStore: DemoNotes } = await import('../sync/notes');
  const demo = new DemoProgress('namespace-check-234');
  const demoNotes = new DemoNotes('namespace-check-234');
  expect(await demo.all()).toEqual([]); expect(await demoNotes.events()).toEqual([]);
  await demo.record(attempt('demo'));
  await demoNotes.merge([{ id: 'demo-note', language: 'ja-JP', itemId: 'word', text: 'demo note', updatedAt: 2 }]);
  expect(await root.all()).toEqual([attempt('root')]); expect(await demo.all()).toEqual([attempt('demo')]);
  expect(rootNotes.read('ja-JP', 'word')).toBe('root note');
  expect(demoNotes.read('ja-JP', 'word')).toBe('demo note');
  expect(demoNotes.databaseName).toBe('kikimashta-scope:offline-demo:kikimashta-notes-namespace-check-234');
  await Promise.all([root.close(), rootNotes.close(), demo.close(), demoNotes.close()]);
});

it('selects the isolated SDK session key for offline restore, without using the root session', async () => {
  const storage = memoryStorage();
  storage.setItem('sb-project-auth-token', JSON.stringify({ user: { id: 'root-account' } }));
  storage.setItem('kikimashta-scope:offline-demo:sb-project-auth-token', JSON.stringify({ user: { id: 'demo-account' } }));
  vi.stubEnv('VITE_STORAGE_NAMESPACE', ''); vi.resetModules();
  const root = await import('../sync/client');
  expect(root.cloudSessionKey('https://project.supabase.co')).toBe('sb-project-auth-token');
  expect(root.cachedCloudUser('https://project.supabase.co', storage)?.id).toBe('root-account');
  vi.stubEnv('VITE_STORAGE_NAMESPACE', 'offline-demo'); vi.resetModules();
  const demo = await import('../sync/client');
  expect(demo.cloudSessionKey('https://project.supabase.co')).toBe('kikimashta-scope:offline-demo:sb-project-auth-token');
  expect(demo.cachedCloudUser('https://project.supabase.co', storage)?.id).toBe('demo-account');
  storage.removeItem(demo.cloudSessionKey('https://project.supabase.co'));
  expect(demo.cachedCloudUser('https://project.supabase.co', storage)).toBeNull();
  expect(storage.getItem('sb-project-auth-token')).not.toBeNull();
});
