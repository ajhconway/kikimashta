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
    port1 = { onmessage: (_event: unknown) => {}, close() {} };
    port2 = this.port1;
  });
  const registration = { active: { postMessage(_message: unknown, ports: { onmessage: (event: { data: unknown }) => void }[]) {
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
