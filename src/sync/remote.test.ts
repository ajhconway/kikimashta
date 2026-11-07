import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { PracticeAttempt } from '../types';
import type { NoteEvent } from './types';
import { SupabaseRemote } from './remote';

const userId = 'bound-user';
function attempt(index: number): PracticeAttempt {
  return { id: `legacy-${String(index).padStart(4, '0')}`, sessionId: 'old-session', itemId: 'cat', language: 'ja-JP',
    choiceIds: ['cat', 'dog'], selectedId: 'cat', correct: true, startedAt: 1000, answeredAt: 1500, responseMs: 500 };
}
function note(index: number): NoteEvent {
  return { id: `note-${index}`, language: 'ja-JP', itemId: 'cat', text: '', updatedAt: 1500 + index };
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}
function fixture(implementation: typeof fetch) {
  const fetcher = vi.fn(implementation);
  const client = createClient('https://test.supabase.co', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetcher },
  });
  return { remote: new SupabaseRemote(client, userId), fetcher, client };
}

describe('Supabase account-bound transport', () => {
  it('round-trips writing attempts and corrective metadata through the API unchanged', async () => {
    const saved = new Map<string, PracticeAttempt>();
    const { remote } = fixture(async (_input, init) => {
      if (init?.method === 'POST') {
        const rows = JSON.parse(String(init.body)) as { attempt_id: string; payload: PracticeAttempt }[];
        for (const row of rows) if (!saved.has(row.attempt_id)) saved.set(row.attempt_id, row.payload);
        return new Response(null, { status: 201 });
      }
      return json([...saved.values()].map(payload => ({ user_id: userId, attempt_id: payload.id, payload })));
    });
    const writing: PracticeAttempt = { ...attempt(0), context: { phase: 'review', exercise: 'audio-text',
      recordingSrc: 'audio/cat.mp3', replays: 1, schedulerVersion: 'fsrs-6-v1', retryOf: 'original-miss' } };
    await remote.uploadAttempts([writing]);
    await remote.uploadAttempts([{ ...writing, correct: false }]);
    expect(await remote.attempts()).toEqual([writing]);
  });

  it('reads all pages in stable ID order, filters by owner, and starts a fresh scan on each call', async () => {
    const attempts = Array.from({ length: 405 }, (_, index) => attempt(index));
    attempts[201] = { ...attempts[201]!, language: 'es-ES', context: { phase: 'review', exercise: 'audio-picture', recordingSrc: 'audio/cat.mp3',
      replays: 2, schedulerVersion: 'fsrs-6-v1', retryOf: 'original-miss' } };
    const rows = attempts.map(payload => ({ user_id: userId, attempt_id: payload.id, payload }));
    const { remote, fetcher } = fixture(async input => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      return json(rows.slice(offset, offset + limit));
    });
    expect(await remote.attempts()).toEqual(attempts);
    expect(await remote.attempts()).toEqual(attempts);
    const requests = fetcher.mock.calls.map(([input]) => new URL(String(input)));
    expect(requests.map(url => url.searchParams.get('offset'))).toEqual(['0', '200', '400', '0', '200', '400']);
    for (const url of requests) {
      expect(url.pathname).toBe('/rest/v1/practice_attempts');
      expect(url.searchParams.get('user_id')).toBe(`eq.${userId}`);
      expect(url.searchParams.get('limit')).toBe('200');
      expect(url.searchParams.get('order')).toBe('attempt_id.asc');
      expect(url.searchParams.get('select')).toBe('user_id,attempt_id,payload');
    }
  });

  it('deduplicates IDs repeated across offset pages without discarding other records', async () => {
    const records = Array.from({ length: 201 }, (_, index) => attempt(index));
    const rows = records.map(payload => ({ user_id: userId, attempt_id: payload.id, payload }));
    const { remote } = fixture(async input => {
      const offset = Number(new URL(String(input)).searchParams.get('offset'));
      return json(offset === 0 ? rows.slice(0, 200) : rows.slice(199));
    });
    expect(await remote.attempts()).toEqual(records);
  });

  it('uploads batches with immutable conflict handling and no client-created timestamps', async () => {
    const saved = new Map<string, PracticeAttempt>();
    const { remote, fetcher } = fixture(async (_input, init) => {
      const rows = JSON.parse(String(init?.body)) as { user_id: string; attempt_id: string; payload: PracticeAttempt }[];
      for (const row of rows) if (!saved.has(row.attempt_id)) saved.set(row.attempt_id, row.payload);
      return new Response(null, { status: 201 });
    });
    const attempts = Array.from({ length: 401 }, (_, index) => attempt(index));
    await remote.uploadAttempts(attempts);
    await remote.uploadAttempts([{ ...attempts[0]!, correct: false }]);
    expect(saved.size).toBe(401);
    expect(saved.get(attempts[0]!.id)).toEqual(attempts[0]);
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).length)).toEqual([200, 200, 1, 1]);
    for (const [input, init] of fetcher.mock.calls) {
      const url = new URL(String(input));
      expect(url.searchParams.get('on_conflict')).toBe('user_id,attempt_id');
      expect(new Headers(init?.headers).get('prefer')).toContain('resolution=ignore-duplicates');
      const rows = JSON.parse(String(init?.body)) as Record<string, unknown>[];
      expect(rows.every(row => row.user_id === userId && Object.keys(row).sort().join(',') === 'attempt_id,payload,user_id')).toBe(true);
    }
  });

  it('uploads and downloads all immutable note events, including deletions and other languages', async () => {
    const saved = new Map<string, NoteEvent>();
    const { remote, fetcher } = fixture(async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === 'POST') {
        const rows = JSON.parse(String(init.body)) as { user_id: string; event_id: string; payload: NoteEvent }[];
        for (const row of rows) if (!saved.has(row.event_id)) saved.set(row.event_id, row.payload);
        return new Response(null, { status: 201 });
      }
      const offset = Number(url.searchParams.get('offset'));
      return json([...saved.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(offset, offset + 200)
        .map(payload => ({ user_id: userId, event_id: payload.id, payload })));
    });
    const notes = Array.from({ length: 201 }, (_, index) => note(index));
    notes[200] = { ...notes[200]!, language: 'es-ES', text: 'A clearer picture' };
    await remote.uploadNotes(notes);
    expect(await remote.notes()).toEqual([...notes].sort((a, b) => a.id.localeCompare(b.id)));
    const uploads = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(uploads.map(([, init]) => JSON.parse(String(init?.body)).length)).toEqual([200, 1]);
    for (const [input, init] of uploads) {
      expect(new URL(String(input)).searchParams.get('on_conflict')).toBe('user_id,event_id');
      expect(new Headers(init?.headers).get('prefer')).toContain('resolution=ignore-duplicates');
      expect(JSON.parse(String(init?.body))[0]).not.toHaveProperty('created_at');
    }
    const reads = fetcher.mock.calls.filter(([, init]) => init?.method === 'GET');
    expect(reads.map(([input]) => new URL(String(input)).searchParams.get('offset'))).toEqual(['0', '200']);
    for (const [input] of reads) {
      const url = new URL(String(input));
      expect(url.searchParams.get('user_id')).toBe(`eq.${userId}`);
      expect(url.searchParams.get('order')).toBe('event_id.asc');
    }
  });

  it('does not issue empty uploads and validates every payload before the first batch', async () => {
    const { remote, fetcher } = fixture(async () => new Response(null, { status: 201 }));
    await remote.uploadAttempts([]); await remote.uploadNotes([]);
    expect(fetcher).not.toHaveBeenCalled();
    const malformed = [...Array.from({ length: 200 }, (_, index) => attempt(index)), { ...attempt(201), correct: 'yes' }] as unknown as PracticeAttempt[];
    await expect(remote.uploadAttempts(malformed)).rejects.toThrow(/attempt/i);
    await expect(remote.uploadNotes([{ ...note(0), text: null }] as unknown as NoteEvent[])).rejects.toThrow(/note/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects API errors and interrupted transfers rather than reporting success', async () => {
    const denied = fixture(async () => json({ code: '42501', message: 'Forbidden' }, 403));
    await expect(denied.remote.attempts()).rejects.toMatchObject({ message: 'Forbidden' });
    await expect(denied.remote.uploadNotes([note(0)])).rejects.toMatchObject({ message: 'Forbidden' });
    const offline = fixture(async () => { throw new Error('offline'); });
    await expect(offline.remote.uploadAttempts([attempt(0)])).rejects.toMatchObject({ message: expect.stringContaining('offline') });
  });

  it.each([
    [{ user_id: 'other-user', attempt_id: 'legacy-0000', payload: attempt(0) }],
    [{ user_id: userId, attempt_id: 'wrong-key', payload: attempt(0) }],
    [{ user_id: userId, attempt_id: 'legacy-0000', payload: { ...attempt(0), correct: 'yes' } }],
    [null],
    null,
  ])('rejects corrupt or foreign practice rows before returning them (%j)', async rows => {
    const { remote } = fixture(async () => json(rows));
    await expect(remote.attempts()).rejects.toBeDefined();
  });

  it('rejects foreign notes, mismatched event IDs and missing account bindings', async () => {
    const foreign = fixture(async () => json([{ user_id: 'other-user', event_id: 'note-0', payload: note(0) }]));
    await expect(foreign.remote.notes()).rejects.toThrow(/another account/i);
    const mismatch = fixture(async () => json([{ user_id: userId, event_id: 'wrong', payload: note(0) }]));
    await expect(mismatch.remote.notes()).rejects.toThrow(/identity/i);
    expect(() => new SupabaseRemote(mismatch.client, '')).toThrow(/account/i);
  });
});
