import { selectWordPractice } from './practice-selection';
import { expectReadableHomeText } from './contrast';
import { expect, test, silenceMedia, type BrowserContext, type Page } from './fixtures';
import bank from '../content/ja.json' with { type: 'json' };
import type { PracticeAttempt } from '../src/types';

const endpoint = 'https://kikimashta-sync-test.supabase.co';
const alice = '10000000-0000-4000-8000-000000000001';
const bob = '20000000-0000-4000-8000-000000000002';
type Row = { user_id: string; attempt_id?: string; event_id?: string; payload: { id: string; text?: string } };

// Exercise the real SDK and browser databases, replacing only the HTTP service.
// The SQL fixture separately tests the database's actual access policies.
function cloud() {
  const tables = { practice_attempts: new Map<string, Row>(), card_note_events: new Map<string, Row>() };
  let unavailable = false;
  function session(email: string) {
    const id = email === 'bob@example.test' ? bob : alice;
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: id, email, role: 'authenticated', exp: expires })).toString('base64url'), 'test-signature'].join('.');
    return { access_token: token, refresh_token: 'refresh-' + id, token_type: 'bearer', expires_in: 3600, expires_at: expires,
      user: { id, email, aud: 'authenticated', role: 'authenticated', created_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {}, identities: [] } };
  }
  async function connect(context: BrowserContext) {
    await context.route(endpoint + '/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
      const reply = (status: number, body: unknown) => route.fulfill({ status, headers, body: JSON.stringify(body) });
      if (request.method() === 'OPTIONS') return reply(200, {});
      if (url.pathname === '/auth/v1/otp') return reply(200, {});
      if (url.pathname === '/auth/v1/verify') return reply(200, session(request.postDataJSON().email));
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      if (url.pathname === '/auth/v1/token') {
        if (unavailable) return route.abort('internetdisconnected');
        const id = request.postDataJSON().refresh_token?.slice('refresh-'.length);
        return reply(200, session(id === bob ? 'bob@example.test' : 'alice@example.test'));
      }
      const table = tables[url.pathname.split('/').at(-1) as keyof typeof tables];
      if (!table) return reply(404, { message: 'Unexpected test endpoint' });
      if (unavailable) return reply(503, { message: 'Test connection unavailable' });
      const token = request.headers().authorization?.split(' ')[1];
      const owner = token ? JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()).sub as string : null;
      if (!owner) return reply(401, { message: 'Authentication required' });
      if (request.method() === 'POST') {
        const incoming = request.postDataJSON() as Row[];
        if (incoming.some(row => row.user_id !== owner)) return reply(403, { message: 'Wrong account' });
        for (const row of incoming) {
          const key = owner + ':' + row.payload.id;
          if (!table.has(key)) table.set(key, row);
        }
        return reply(201, null);
      }
      const key = url.pathname.endsWith('practice_attempts') ? 'attempt_id' : 'event_id';
      const rows = [...table.values()].filter(row => row.user_id === owner && url.searchParams.get('user_id') === 'eq.' + owner)
        .sort((a, b) => a[key]! < b[key]! ? -1 : a[key] === b[key] ? 0 : 1);
      const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 200);
      return reply(200, rows.slice(offset, offset + limit));
    });
  }
  return { connect, tables, disconnect: () => { unavailable = true; }, reconnect: () => { unavailable = false; } };
}

async function signIn(page: Page, email = 'alice@example.test') {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.getByLabel('Email code').fill('12345678');
  await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
  await expect(page.getByLabel('Sync status')).toHaveText('Up to date');
}

async function syncNow(page: Page) {
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  const sync = page.getByRole('button', { name: 'Sync now', exact: true });
  await expect(sync).toBeEnabled();
  await sync.click();
  await expect(page.getByLabel('Sync status')).toHaveText('Up to date');
  await page.getByRole('button', { name: 'Close account' }).click();
}

async function attempts(page: Page, name: string) {
  return page.evaluate(async databaseName => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      if (!db.objectStoreNames.contains('attempts')) return [];
      return await new Promise<PracticeAttempt[]>((resolve, reject) => {
        const request = db.transaction('attempts').objectStore('attempts').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, name);
}

async function firstNote(page: Page) {
  await page.goto('./vocabulary/');
  const card = page.getByRole('article', { name: '上 Pictures', exact: true }).and(page.locator('[data-exercise="audio-picture"]'));
  await card.locator('.card-feedback summary').click();
  return { input: card.getByLabel('Your notes'), status: card.locator('.feedback-status') };
}

test('email sign-in is optional and its dialog supports keyboard dismissal', async ({ page, context }) => {
  test.skip(process.env.VITE_SUPABASE_URL !== endpoint, 'Uses the explicitly configured CI test service.');
  const remote = cloud(); await remote.connect(context);
  const authenticationRequests: string[] = [];
  page.on('request', request => { if (request.url().startsWith(endpoint + '/auth/')) authenticationRequests.push(request.url()); });
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeEnabled();
  const trigger = page.getByRole('button', { name: 'Sign in', exact: true });
  await trigger.click();
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  expect(authenticationRequests).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('button', { name: /^Start/ })).toBeEnabled();
});

test('accounts converge across browser storage, retry offline answers, and sync note deletion', async ({ page, context, browser, quietAudio }, info) => {
  await selectWordPractice(page);
  test.skip(process.env.VITE_SUPABASE_URL !== endpoint, 'Uses the explicitly configured CI test service.');
  test.setTimeout(60_000);
  const remote = cloud();
  await remote.connect(context);
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeEnabled();
  const word = bank.items.find(item => item.id === 'ja-dog')!;
  const legacy: PracticeAttempt = { id: 'legacy-sync', sessionId: 'old-session', itemId: word.id, language: bank.language,
    choiceIds: bank.items.slice(0, 4).map(item => item.id), selectedId: word.id, correct: true,
    startedAt: Date.now() - 86_400_000, answeredAt: Date.now() - 86_400_000, responseMs: 0 };
  await page.evaluate(async attempt => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('attempts', 'readwrite'); tx.objectStore('attempts').put(attempt);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
    localStorage.setItem('kikimashta:card-feedback:v1:ja:ja-v-c0f58bfab324', 'Guest note');
  }, legacy);
  await page.reload();
  await signIn(page);
  expect(await attempts(page, 'kikimashta-account-' + alice)).toEqual([]);
  expect(remote.tables.practice_attempts.size).toBe(0);
  expect(remote.tables.card_note_events.size).toBe(0);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: "Copy this device's progress", exact: true }).click();
  await expect(page.getByText('Copied into this account.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close account' }).click();
  await expect.poll(async () => (await attempts(page, 'kikimashta-account-' + alice)).length).toBe(1);
  expect(await attempts(page, 'kikimashta-v0')).toEqual([legacy]);

  const second = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: info.project.use.viewport });
  try {
    if (quietAudio) await silenceMedia(second);
    await remote.connect(second);
    const other = await second.newPage();
    await selectWordPractice(other);
    await other.goto('./'); await signIn(other);
    await expect.poll(async () => (await attempts(other, 'kikimashta-account-' + alice)).length).toBe(1);
    expect(await attempts(other, 'kikimashta-account-' + alice)).toEqual([legacy]);

    // A real answer must remain in this account's IndexedDB during a failed upload.
    remote.disconnect();
    await other.getByRole('button', { name: /^Start/ }).click();
    await other.getByRole('button', { name: /Begin review/ }).click();
    await expect.poll(async () => {
      const source = await other.locator('audio').getAttribute('src');
      return word.audio.some(clip => source?.endsWith(clip.src));
    }, { message: 'The review uses the imported word' }).toBe(true);
    await other.getByRole('button', { name: /Choose picture/ }).filter({ has: other.getByAltText(word.image.alt, { exact: true }) }).click();
    await expect.poll(async () => (await attempts(other, 'kikimashta-account-' + alice)).length).toBe(2);
    await other.getByRole('button', { name: 'Kikimashta home' }).click();
    await expect(other.getByLabel('Sync status')).toHaveText('Needs sync');
    expectReadableHomeText([await other.getByLabel('Sync status').evaluate(element => getComputedStyle(element).color)]);
    expect(remote.tables.practice_attempts.size).toBe(1);
    remote.reconnect(); await syncNow(other); await syncNow(page);
    await expect.poll(async () => (await attempts(page, 'kikimashta-account-' + alice)).length).toBe(2);
    expect(remote.tables.practice_attempts.size).toBe(2);
    await page.reload();
    await expect.poll(async () => (await attempts(page, 'kikimashta-account-' + alice)).length).toBe(2);

    const note = await firstNote(page);
    await expect(note.input).toHaveValue('Guest note');
    await note.input.fill('Account note 日本語');
    await expect(note.status).toHaveText('Saved on this device.');
    await expect.poll(() => remote.tables.card_note_events.size).toBe(2);
    const downloaded = await firstNote(other);
    await expect(downloaded.input).toHaveValue('Account note 日本語');
    await downloaded.input.fill('');
    await expect(downloaded.status).toHaveText('Feedback cleared.');
    await expect.poll(() => remote.tables.card_note_events.size).toBe(3);
    await page.reload();
    const cleared = page.getByRole('article', { name: '上 Pictures', exact: true }).and(page.locator('[data-exercise="audio-picture"]'));
    await cleared.locator('.card-feedback summary').click();
    await expect(cleared.getByLabel('Your notes')).toHaveValue('');

    await other.goto('./');
    await other.getByRole('button', { name: 'Account', exact: true }).click();
    await other.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(other, 'bob@example.test');
    expect(await attempts(other, 'kikimashta-account-' + bob)).toEqual([]);
    const unrelated = await firstNote(other);
    await expect(unrelated.input).toHaveValue('');
    expect(await attempts(page, 'kikimashta-v0')).toEqual([legacy]);
  } finally { await second.close(); }
});


test('downloaded practice reopens the same account with expired auth offline and syncs on reconnect', async ({ page, context }) => {
  test.skip(process.env.VITE_SUPABASE_URL !== endpoint, 'Uses the explicitly configured CI test service.');
  test.setTimeout(120_000);
  await selectWordPractice(page, ['ja-wanikani-2-pictures']);
  await page.addInitScript(() => localStorage.setItem('kikimashta-practice-voices-v1', JSON.stringify(['otani'])));
  const remote = cloud(); await remote.connect(context);
  await page.goto('./'); await signIn(page);
  const word = bank.items.find(item => item.id === 'ja-dog')!;
  const retained: PracticeAttempt = { id: 'offline-account-review', sessionId: 'earlier-session', itemId: word.id,
    language: bank.language, choiceIds: bank.items.slice(0, 4).map(item => item.id), selectedId: word.id,
    correct: true, startedAt: Date.now() - 86_400_000, answeredAt: Date.now() - 86_400_000, responseMs: 0 };
  await page.evaluate(async ({ attempt, name }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('attempts', { keyPath: 'id' });
        store.createIndex('language', 'language');
      };
    });
    const tx = db.transaction('attempts', 'readwrite'); tx.objectStore('attempts').put(attempt);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  }, { attempt: retained, name: 'kikimashta-account-' + alice });
  await page.reload(); await syncNow(page);
  await page.getByText('Offline practice', { exact: true }).click();
  await page.getByRole('button', { name: 'Download selected packs', exact: true }).click();
  await expect(page.getByText('Selected packs are downloaded for offline practice.', { exact: true })).toBeVisible({ timeout: 90_000 });
  await page.evaluate(() => {
    const key = 'sb-kikimashta-sync-test-auth-token';
    const session = JSON.parse(localStorage.getItem(key)!);
    session.expires_at = Math.floor(Date.now() / 1000) - 3600;
    localStorage.setItem(key, JSON.stringify(session));
  });
  remote.disconnect(); await context.setOffline(true); await page.reload();
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Start/ })).toBeEnabled();
  expect(await attempts(page, 'kikimashta-account-' + alice)).toEqual([retained]);
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.getByRole('button', { name: /Begin review/ }).click();
  await page.getByRole('button', { name: /Choose picture/ }).filter({ has: page.getByAltText(word.image.alt, { exact: true }) }).click();
  await expect.poll(async () => (await attempts(page, 'kikimashta-account-' + alice)).length).toBe(2);
  expect(remote.tables.practice_attempts.size).toBe(1);
  await page.getByRole('button', { name: 'Kikimashta home' }).click();
  remote.reconnect(); await context.setOffline(false);
  await expect(page.getByLabel('Sync status')).toHaveText('Up to date', { timeout: 45_000 });
  await syncNow(page);
  expect(remote.tables.practice_attempts.size).toBe(2);
  await page.reload();
  expect(await attempts(page, 'kikimashta-account-' + alice)).toHaveLength(2);
  expect(await attempts(page, 'kikimashta-v0')).toEqual([]);
});
