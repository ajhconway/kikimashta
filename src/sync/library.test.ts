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
import { packPreferenceKey, selectedPracticeCards } from '../core/packs';
import { voicePreferenceKey, voicePreferenceKeyFor } from '../core/voices';
import spanish from '../../content/es-419.json';
import { practicePool } from '../core/practice';

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
  window.history.replaceState({}, '', '/');
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
  await deleteDB('kikimashta-v0');
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
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


  it('refreshes guest mastery on focus and BFCache restore without replacing cards or notes', async () => {
    vi.mocked(getLibraryAccount).mockResolvedValue(null);
    const writer = new ProgressStore();
    progressStores.push(writer);
    await loadLibrary();
    const picture = document.querySelector('[data-item-id="ja-dog"][data-exercise="audio-picture"]')!;
    const writing = document.querySelector('[data-item-id="ja-dog"][data-exercise="audio-text"]')!;
    expect(picture.querySelector('.card-mastery')).toHaveTextContent('Mastery: New');
    fireEvent.input(dogInput(), { target: { value: 'Keep this editor open' } });
    const first: PracticeAttempt = {
      id: 'guest-picture-lesson', sessionId: 'session', itemId: 'ja-dog', language: 'ja-JP',
      choiceIds: ['ja-dog'], selectedId: 'ja-dog', correct: true, startedAt: 1000, answeredAt: 2000, responseMs: 1000,
      context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: 'dog.mp3', replays: 0, schedulerVersion },
    };
    // Practice in another tab updates the same real IndexedDB database.
    await writer.merge(selectedPracticeCards(practicePool.items, ['ja-wanikani-2-pictures']).map(({ item }) => ({
      ...first, id: `guest-lesson-${item.id}`, itemId: item.id, selectedId: item.id, choiceIds: [item.id],
    })));
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(picture.querySelector('.card-mastery')).toHaveTextContent('Mastery: Learning'));
    expect(writing.querySelector('.card-mastery')).toHaveTextContent('Mastery: New');
    window.dispatchEvent(new Event('pagehide'));
    await writer.record({ ...first, id: 'guest-writing-lesson', context: { ...first.context!, exercise: 'audio-text' } });
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await waitFor(() => expect(writing.querySelector('.card-mastery')).toHaveTextContent('Mastery: Learning'));
    expect(document.querySelector('[data-item-id="ja-dog"][data-exercise="audio-picture"]')).toBe(picture);
    expect(dogInput()).toHaveValue('Keep this editor open');
    expect(document.querySelector('#pack option[value="ja-wanikani-2-pictures"]')).toHaveTextContent('Lowest: Learning · Average: Learning');
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


describe('Spanish card library', () => {
  it('browses the practice bank, searches both languages and saves guest notes under Spanish identity', async () => {
    window.history.replaceState({}, '', '/vocabulary/?language=es-419&pack=es-419-travel-1-pictures');
    vi.mocked(getLibraryAccount).mockResolvedValue(null);
    localStorage.setItem('kikimashta:card-feedback:v1:ja:es-419-travel-coffee', 'Unrelated Japanese note');
    await vi.importActual('../../vocabulary/library.js');
    await waitFor(() => expect(document.querySelectorAll('.card')).toHaveLength(Math.min(24, spanish.items.length)));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Latin American Spanish cards');
    expect(screen.getByLabelText('Card pack')).toHaveValue('es-419-travel-1-pictures');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(document.querySelectorAll('.word-text[lang="es-419"]')).toHaveLength(Math.min(24, spanish.items.length));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.input(screen.getByLabelText('Search words'), { target: { value: 'Coffee' } });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('café');
    const coffeeVoice = spanish.items.find(item => item.id === 'es-419-travel-coffee')!.audio[0]!.voiceName;
    expect(screen.getByRole('button', { name: `${coffeeVoice}: Coffee` })).toBeEnabled();
    fireEvent.input(screen.getByLabelText('Your notes'), { target: { value: 'Review the accent' } });
    expect(localStorage.getItem('kikimashta:card-feedback:v1:es-419:es-419-travel-coffee')).toBe('Review the accent');
    expect(localStorage.getItem('kikimashta:card-feedback:v1:ja:es-419-travel-coffee')).toBe('Unrelated Japanese note');
    fireEvent.input(screen.getByLabelText('Search words'), { target: { value: 'cafe' } });
    expect(document.querySelectorAll('.card')).toHaveLength(1);
    expect(screen.getByLabelText('Your notes')).toHaveValue('Review the accent');
  });

  it('reads and writes signed-in notes with the Spanish language identity', async () => {
    window.history.replaceState({}, '', '/vocabulary/?language=es-419');
    const { bridge } = account();
    await bridge.notes.write('es-419', 'es-419-travel-hotel', 'Spanish account note');
    await bridge.progress.record({ id: 'spanish-picture', sessionId: 'spanish', itemId: 'es-419-travel-hotel', language: 'es-419',
      choiceIds: ['es-419-travel-hotel'], selectedId: 'es-419-travel-hotel', correct: true, startedAt: 1000, answeredAt: 2000, responseMs: 1000,
      context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: 'spanish.mp3', replays: 0, schedulerVersion } });
    vi.mocked(getLibraryAccount).mockResolvedValue(bridge);
    await vi.importActual('../../vocabulary/library.js');
    await waitFor(() => expect(document.getElementById('feedback-es-419-travel-hotel-audio-picture')).toHaveValue('Spanish account note'));
    fireEvent.input(document.getElementById('feedback-es-419-travel-hotel-audio-picture')!, { target: { value: 'Edited Spanish note' } });
    await waitFor(() => expect(bridge.notes.read('es-419', 'es-419-travel-hotel')).toBe('Edited Spanish note'));
    expect(bridge.notes.read('ja', 'es-419-travel-hotel')).toBe('');
    expect(document.querySelectorAll('.card')).toHaveLength(Math.min(24, spanish.items.length));
    expect(document.querySelectorAll('.card-writing')).toHaveLength(0);
    expect(document.querySelector('[data-item-id="es-419-travel-hotel"] .card-mastery')).toHaveTextContent('Mastery: Learning');
  });
});

describe('practice pack selection in the library (#146)', () => {
  it('loads existing selection and saves changes independently of browsing', async () => {
    vi.mocked(getLibraryAccount).mockResolvedValue(null);
    localStorage.setItem(packPreferenceKey, JSON.stringify(['ja-wanikani-2-writing']));
    await loadLibrary();
    const writing = screen.getByRole('checkbox', { name: 'WaniKani level 2 · Writing' });
    const pictures = screen.getByRole('checkbox', { name: 'WaniKani level 2 · Pictures' });
    expect(writing).toBeChecked();
    expect(pictures).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('Card pack'), { target: { value: 'ja-wanikani-1-pictures' } });
    expect(localStorage.getItem(packPreferenceKey)).toBe(JSON.stringify(['ja-wanikani-2-writing']));
    fireEvent.click(pictures);
    expect(JSON.parse(localStorage.getItem(packPreferenceKey)!)).toEqual(['ja-wanikani-2-pictures', 'ja-wanikani-2-writing']);
    fireEvent.click(writing);
    fireEvent.click(pictures);
    expect(localStorage.getItem(packPreferenceKey)).toBe('[]');
    expect(screen.getByText('No packs selected. Select a pack to start practicing.')).toBeInTheDocument();
  });

  it('reports failed preference saves and restores the persisted selection', async () => {
    vi.mocked(getLibraryAccount).mockResolvedValue(null);
    await loadLibrary();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    const pictures = screen.getByRole('checkbox', { name: 'WaniKani level 2 · Pictures' });
    fireEvent.click(pictures);
    expect(pictures).toBeChecked();
    expect(screen.getByText('Your pack selection could not be saved on this device. Try again.')).toBeVisible();
  });
});


describe('global practice voices in the library (#148)', () => {
  it('restores voices, saves changes, and prevents an empty selection', async () => {
    vi.mocked(getLibraryAccount).mockResolvedValue(null);
    localStorage.setItem(voicePreferenceKey, JSON.stringify(['lime']));
    await loadLibrary();
    const lime = screen.getByRole('checkbox', { name: 'Lime' });
    const otani = screen.getByRole('checkbox', { name: 'Otani' });
    expect(lime).toBeChecked();
    expect(otani).not.toBeChecked();
    fireEvent.click(lime);
    expect(lime).toBeChecked();
    expect(screen.getByText('Keep at least one voice selected for practice.')).toBeVisible();
    fireEvent.click(otani);
    expect(JSON.parse(localStorage.getItem(voicePreferenceKey)!)).toEqual(['otani', 'lime']);
    fireEvent.click(lime);
    expect(JSON.parse(localStorage.getItem(voicePreferenceKey)!)).toEqual(['otani']);
    expect(screen.getByText('Selected: Otani.')).toBeInTheDocument();
  });

  it('keeps the saved voice selection when preference storage fails', async () => {
    vi.mocked(getLibraryAccount).mockResolvedValue(null);
    await loadLibrary();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    const lime = screen.getByRole('checkbox', { name: 'Lime' });
    fireEvent.click(lime);
    expect(lime).toBeChecked();
    expect(screen.getByText('Your voice selection could not be saved on this device. Try again.')).toBeVisible();
  });
});


it('shows Spanish pack mastery in the library from Spanish-only picture history', async () => {
  window.history.replaceState({}, '', '/vocabulary/?language=es-419');
  const { bridge } = account();
  for (const item of spanish.items) await bridge.progress.record({
    id: item.id, sessionId: 'spanish-lesson', itemId: item.id, language: 'es-419',
    choiceIds: [item.id], selectedId: item.id, correct: true, startedAt: 900, answeredAt: 1000, responseMs: 100,
    context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: item.audio[0]!.src, replays: 0, schedulerVersion },
  });
  vi.mocked(getLibraryAccount).mockResolvedValue(bridge);
  await vi.importActual('../../vocabulary/library.js');
  await waitFor(() => expect(document.querySelectorAll('.card')).toHaveLength(Math.min(24, spanish.items.length)));
  expect(document.getElementById('pack-mastery-es-419-travel-1-pictures')).toHaveTextContent('Lowest: Learning · Average: Learning');
  expect(screen.getByRole('group', { name: 'Practice voices' })).toBeVisible();
});

it('shows Spanish regional voices, preserves Japanese selection and prevents an empty Spanish selection', async () => {
  window.history.replaceState({}, '', '/vocabulary/?language=es-419');
  vi.mocked(getLibraryAccount).mockResolvedValue(null);
  const spanishKey = voicePreferenceKeyFor('es-419');
  localStorage.setItem(voicePreferenceKey, JSON.stringify(['lime']));
  localStorage.setItem(spanishKey, JSON.stringify(['juan']));
  await vi.importActual('../../vocabulary/library.js');
  await waitFor(() => expect(document.querySelectorAll('.card')).toHaveLength(Math.min(24, spanish.items.length)));
  const juan = screen.getByRole('checkbox', { name: 'Juan' });
  const pamela = screen.getByRole('checkbox', { name: 'Pamela' });
  expect(juan).toBeChecked();
  expect(juan).toHaveAccessibleDescription('Mexico City, Mexico');
  expect(screen.getByRole('checkbox', { name: 'Albeiro O' })).toHaveAccessibleDescription('Bogotá, Colombia');
  expect(screen.getByRole('checkbox', { name: 'Agustina' })).toHaveAccessibleDescription('Buenos Aires, Argentina');
  expect(screen.getByRole('checkbox', { name: 'Veronica' })).toHaveAccessibleDescription('Puerto Rico · Caribbean Spanish');
  expect(screen.queryByRole('checkbox', { name: 'Cesar' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Lime' })).not.toBeInTheDocument();
  fireEvent.click(juan);
  expect(juan).toBeChecked();
  expect(screen.getByText('Keep at least one voice selected for practice.')).toBeVisible();
  fireEvent.click(pamela);
  fireEvent.click(juan);
  expect(JSON.parse(localStorage.getItem(spanishKey)!)).toEqual(['pamela']);
  expect(JSON.parse(localStorage.getItem(voicePreferenceKey)!)).toEqual(['lime']);
  expect(screen.getByText('Selected: Pamela.')).toBeInTheDocument();
});
