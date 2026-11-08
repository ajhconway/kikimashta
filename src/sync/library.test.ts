import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLibraryAccount } from './library-bridge';
import { NoteStore } from './notes';
import { ProgressStore } from '../progress/store';
import type { PracticeAttempt } from '../types';
import { advanceSchedule, schedulerVersion } from '../core/scheduler';

vi.mock('./library-bridge', () => ({ getLibraryAccount: vi.fn() }));

const shell = readFileSync('vocabulary/index.html', 'utf8');
const cards = [
  { id: 'ja-dog', text: '犬', reading: 'いぬ', meaning: 'Dog', sourceLevel: 2, image: { src: '../images/dog.svg', alt: 'Dog' }, audio: [], concept: 'A dog', visualGroup: 'dog' },
  { id: 'ja-apple', text: 'リンゴ', reading: 'りんご', meaning: 'Apple', sourceLevel: 1, image: { src: '../images/apple.svg', alt: 'Apple' }, audio: [], concept: 'An apple', visualGroup: 'apple' },
];
const stores: NoteStore[] = [];
const progressStores: ProgressStore[] = [];
const windowListeners: Parameters<Window['addEventListener']>[] = [];
let sequence = 0;

function account() {
  const userId = `library-test-${sequence++}`;
  const notes = new NoteStore(userId, { now: () => 1000, id: () => `event-${sequence++}` });
  stores.push(notes);
  const progress = new ProgressStore(`library-progress-${userId}`);
  progressStores.push(progress);
  const listeners = new Set<() => void>();
  let currentUserId: string | null = userId;
  const bridge = {
    userId, notes, progress, changed: vi.fn(), currentUserId: () => currentUserId,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return {
    bridge,
    emit: () => { for (const listener of listeners) listener(); },
    switchTo: (id: string | null) => { currentUserId = id; for (const listener of listeners) listener(); },
  };
}

async function loadLibrary() {
  // Import the browser entry as Vite does; its only external boundaries are the
  // account bridge and manifest fetch, not its feedback UI or DOM interactions.
  await vi.importActual('../../vocabulary/library.js');
  await waitFor(() => expect(document.querySelectorAll('.card')).toHaveLength(cards.length * 2));
}
function dogInput() { return document.getElementById('feedback-ja-dog-audio-picture') as HTMLTextAreaElement; }
function dogStatus() { return document.getElementById('feedback-status-ja-dog-audio-picture')!; }

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = shell.match(/<body>([\s\S]*)<\/body>/)![1]!;
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((...args: Parameters<Window['addEventListener']>) => {
    windowListeners.push(args);
    add(...args);
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cards }) })));
});
afterEach(async () => {
  window.dispatchEvent(new Event('pagehide'));
  await Promise.all(progressStores.splice(0).map(store => store.close()));
  for (const args of windowListeners.splice(0)) window.removeEventListener(...args);
  await Promise.all(stores.map(store => store.close()));
  await Promise.all(stores.splice(0).map(store => deleteDB(store.databaseName)));
  vi.unstubAllGlobals();
});

describe('account-aware vocabulary feedback UI', () => {
  it('waits for identity and keeps account feedback separate from existing guest notes', async () => {
    const { bridge } = account();
    await bridge.notes.write('ja', 'ja-dog', 'Account-only feedback');
    localStorage.setItem('kikimashta:card-feedback:v1:ja:ja-dog', 'Guest feedback');
    let resolveAccount!: (value: typeof bridge) => void;
    vi.mocked(getLibraryAccount).mockReturnValue(new Promise(resolve => { resolveAccount = resolve; }));
    await vi.importActual('../../vocabulary/library.js');
    expect(document.querySelectorAll('.card')).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    resolveAccount(bridge);
    await waitFor(() => expect(dogInput()).toHaveValue('Account-only feedback'));
    fireEvent.input(dogInput(), { target: { value: 'Changed account note' } });
    expect(dogStatus()).toHaveTextContent('Saving…');
    await waitFor(() => expect(dogStatus()).toHaveTextContent('Saved on this device.'));
    expect(bridge.notes.read('ja', 'ja-dog')).toBe('Changed account note');
    expect(bridge.changed).toHaveBeenCalledOnce();
    expect(localStorage.getItem('kikimashta:card-feedback:v1:ja:ja-dog')).toBe('Guest feedback');
  });

  it('updates clean visible notes from sync without replacing an editable failed draft', async () => {
    const { bridge, emit } = account();
    await bridge.notes.load();
    vi.mocked(getLibraryAccount).mockResolvedValue(bridge);
    await loadLibrary();
    await bridge.notes.merge([{ id: 'remote-a', language: 'ja', itemId: 'ja-dog', text: 'Changed on another device', updatedAt: 2000 }]);
    emit();
    expect(dogInput()).toHaveValue('Changed on another device');
    vi.spyOn(bridge.notes, 'write').mockRejectedValue(new Error('Storage unavailable'));
    fireEvent.input(dogInput(), { target: { value: 'An unsaved local draft' } });
    await waitFor(() => expect(dogStatus()).toHaveTextContent('Could not save'));
    await bridge.notes.merge([{ id: 'remote-b', language: 'ja', itemId: 'ja-dog', text: 'A newer remote edit', updatedAt: 3000 }]);
    emit();
    expect(dogInput()).toHaveValue('An unsaved local draft');
    expect(screen.getByRole('button', { name: 'Export feedback (1)' })).toBeEnabled();
  });

  it('preserves failed drafts after an account change and prevents writes under the new identity', async () => {
    const { bridge, switchTo, emit } = account();
    await bridge.notes.load();
    vi.mocked(getLibraryAccount).mockResolvedValue(bridge);
    const save = vi.spyOn(bridge.notes, 'write').mockRejectedValue(new Error('Storage unavailable'));
    await loadLibrary();
    fireEvent.input(dogInput(), { target: { value: 'Keep this draft for export' } });
    await waitFor(() => expect(dogStatus()).toHaveTextContent('Could not save'));
    let resolveHistory!: (value: PracticeAttempt[]) => void;
    vi.spyOn(bridge.progress, 'history').mockReturnValue(new Promise(resolve => { resolveHistory = resolve; }));
    // A late sync read must not restore the previous account's mastery.
    emit();
    switchTo('different-account');
    expect(screen.getByText(/Export your unsaved feedback, then reload/)).toBeVisible();
    expect(screen.getByText('These notes belong to the previous account.')).toBeVisible();
    expect(dogInput()).toHaveValue('Keep this draft for export');
    resolveHistory([]);
    await waitFor(() => expect(document.querySelector('.card-mastery')).toHaveTextContent('Mastery: unavailable'));
    fireEvent.input(dogInput(), { target: { value: 'A draft on the old page' } });
    await waitFor(() => expect(dogStatus()).toHaveTextContent('Could not save'));
    expect(save).toHaveBeenCalledOnce();
    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
  });

  it('keeps guest feedback browser-local when no account is active', async () => {
    vi.mocked(getLibraryAccount).mockResolvedValue(null);
    await loadLibrary();
    fireEvent.input(dogInput(), { target: { value: 'Guest note' } });
    expect(dogStatus()).toHaveTextContent('Saved on this device.');
    expect(localStorage.getItem('kikimashta:card-feedback:v1:ja:ja-dog')).toBe('Guest note');
    expect(screen.getByText('Feedback stays in this browser. Export it to share or back it up.')).toBeVisible();
  });
});


describe('library mastery and separate exercise cards (#135)', () => {
  it('shows separate mastery per exercise from persisted history and refreshes after sync', async () => {
    const { bridge, emit } = account();
    vi.mocked(getLibraryAccount).mockResolvedValue(bridge);
    const first: PracticeAttempt = {
      id: 'picture-lesson', sessionId: 'session', itemId: 'ja-dog', language: 'ja-JP',
      choiceIds: ['ja-dog'], selectedId: 'ja-dog', correct: true, startedAt: 1000, answeredAt: 2000, responseMs: 1000,
      context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: 'dog.mp3', replays: 0, schedulerVersion },
    };
    await bridge.progress.record(first);
    await loadLibrary();
    const picture = document.querySelector('[data-item-id="ja-dog"][data-exercise="audio-picture"]')!;
    const writing = document.querySelector('[data-item-id="ja-dog"][data-exercise="audio-text"]')!;
    expect(picture).toHaveAccessibleName('犬 Pictures');
    expect(writing).toHaveAccessibleName('犬 Writing');
    expect(picture.querySelector('.card-mastery')).toHaveTextContent('Mastery: Learning');
    expect(writing.querySelector('.card-mastery')).toHaveTextContent('Mastery: New');
    const scheduled = await advanceSchedule(undefined, first);
    await bridge.progress.record({ ...first, id: 'writing-lesson', context: { ...first.context!, exercise: 'audio-text' } });
    await bridge.progress.record({ ...first, id: 'picture-review', answeredAt: scheduled.dueAt, context: { ...first.context!, phase: 'review' } });
    emit();
    await waitFor(() => expect(writing.querySelector('.card-mastery')).toHaveTextContent('Mastery: Learning'));
    await waitFor(() => expect(picture.querySelector('.card-mastery')).toHaveTextContent('Mastery: Familiar'));
    expect(picture.querySelector('.pack-labels')).toHaveTextContent('Pictures');
    expect(picture.querySelector('.pack-labels')).not.toHaveTextContent('Writing');
    const ids = Array.from(document.querySelectorAll('[id]'), node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(document.querySelector('#pack option[value="ja-wanikani-2-pictures"]')).toHaveTextContent('Lowest: New · Average: New');
  });

  it('keeps two visible note editors synchronized and counts each vocabulary note once', async () => {
    vi.mocked(getLibraryAccount).mockResolvedValue(null);
    await loadLibrary();
    const editors = document.querySelectorAll<HTMLTextAreaElement>('[data-item-id="ja-dog"] textarea');
    expect(editors).toHaveLength(2);
    fireEvent.input(editors[0]!, { target: { value: 'One shared note' } });
    expect(editors[1]).toHaveValue('One shared note');
    expect(screen.getByRole('button', { name: 'Export feedback (1)' })).toBeEnabled();
  });

  it('shows unavailable when history fails instead of presenting all cards as New', async () => {
    const { bridge } = account();
    vi.spyOn(bridge.progress, 'history').mockRejectedValue(new Error('Storage failed'));
    vi.mocked(getLibraryAccount).mockResolvedValue(bridge);
    await loadLibrary();
    for (const badge of document.querySelectorAll('.card-mastery')) expect(badge).toHaveTextContent('Mastery: unavailable');
    expect(document.querySelector('#pack option[value="ja-wanikani-2-pictures"]')).toHaveTextContent('Mastery unavailable');
  });
});
