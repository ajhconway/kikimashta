import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });
it('checking readiness and removing absent downloads do not install a worker', async () => {
  vi.stubEnv('PROD', true);
  const getRegistration = vi.fn().mockResolvedValue(undefined);
  const register = vi.fn();
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration, register } });
  const { offlineRequest } = await import('./client');
  expect(await offlineRequest('STATUS', ['audio/a.mp3'])).toMatchObject({ ready: false });
  expect(await offlineRequest('REMOVE', [])).toMatchObject({ ready: false });
  expect(register).not.toHaveBeenCalled();
});
it('explicit download checks for updates even after checking an existing worker', async () => {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('__OFFLINE_VERSION__', 'v1');
  vi.stubGlobal('MessageChannel', class {
    port1 = { onmessage: vi.fn(), close() {} };
    port2 = this.port1;
  });
  const registration = { scope: new URL(import.meta.env.BASE_URL, location.href).href, active: { postMessage(_message: unknown, ports: { onmessage: (event: { data: unknown }) => void }[]) {
    queueMicrotask(() => ports[0]!.onmessage({ data: { type: 'RESULT', ready: true } }));
  } } };
  const register = vi.fn().mockRejectedValue(new Error('Update check failed.'));
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration), register } });
  const { offlineRequest } = await import('./client');
  expect(await offlineRequest('STATUS', [])).toMatchObject({ ready: true });
  expect(register).not.toHaveBeenCalled();
  await expect(offlineRequest('DOWNLOAD', [])).rejects.toThrow('Update check failed.');
  expect(register).toHaveBeenCalledOnce();
});

it('does not send status or removal to an ancestor worker', async () => {
  vi.stubEnv('PROD', true); vi.stubEnv('BASE_URL', '/practice/');
  const postMessage = vi.fn();
  vi.stubGlobal('navigator', { serviceWorker: {
    getRegistration: vi.fn().mockResolvedValue({ scope: new URL('/', location.href).href, active: { postMessage } }),
  } });
  const { offlineRequest } = await import('./client');
  expect(await offlineRequest('STATUS', [])).toMatchObject({ ready: false });
  expect(await offlineRequest('REMOVE', [])).toMatchObject({ ready: false });
  expect(postMessage).not.toHaveBeenCalled();
});
it('waits for the application worker even when ready already resolves to the root worker', async () => {
  vi.stubEnv('PROD', true); vi.stubEnv('BASE_URL', '/practice/');
  vi.stubGlobal('__OFFLINE_VERSION__', 'app-v1');
  vi.stubGlobal('MessageChannel', class { port1 = { onmessage: vi.fn(), close() {} }; port2 = this.port1; });
  const appPost = vi.fn((_message: unknown, ports: { onmessage: (event: { data: unknown }) => void }[]) => {
    queueMicrotask(() => ports[0]!.onmessage({ data: { type: 'RESULT', ready: true } }));
  });
  const rootPost = vi.fn();
  const candidate = Object.assign(new EventTarget(), { state: 'installing' });
  const registration = { scope: new URL('/practice/', location.href).href,
    active: null as { postMessage: typeof appPost } | null, installing: candidate };
  const ready = vi.fn(() => Promise.resolve({ active: { postMessage: rootPost } }));
  const serviceWorker = { getRegistration: vi.fn().mockResolvedValue(undefined), register: vi.fn().mockResolvedValue(registration), get ready() { return ready(); } };
  vi.stubGlobal('navigator', { serviceWorker });
  const { offlineRequest } = await import('./client');
  const downloading = offlineRequest('DOWNLOAD', []);
  await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalledOnce());
  registration.active = { postMessage: appPost }; candidate.state = 'activated'; candidate.dispatchEvent(new Event('statechange'));
  expect(await downloading).toMatchObject({ ready: true });
  expect(ready).not.toHaveBeenCalled(); expect(rootPost).not.toHaveBeenCalled(); expect(appPost).toHaveBeenCalledOnce();
});
