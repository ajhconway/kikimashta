declare const __OFFLINE_VERSION__: string;
export interface OfflineResult { ready: boolean; completed: number; total: number; bytes: number; error?: string }
export interface OfflineManifest { version: string; shell: string[]; sizes: Record<string, number> }
const base = import.meta.env.BASE_URL;
let connection: Promise<ServiceWorker> | undefined;
function worker(): Promise<ServiceWorker> {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return Promise.reject(new Error('Downloads are available in the published app.'));
  connection ??= (async () => {
    await navigator.serviceWorker.register(base + 'offline-worker.js', { scope: base });
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error('Offline preparation is unavailable. Reload and retry.');
    return registration.active;
  })().catch(error => { connection = undefined; throw error; });
  return connection;
}
export async function offlineRequest(type: 'STATUS' | 'DOWNLOAD' | 'REMOVE', urls: readonly string[], progress?: (result: OfflineResult) => void): Promise<OfflineResult> {
  const target = await worker();
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    // The worker reports progress throughout downloads; reset the inactivity timer.
    let timer: ReturnType<typeof setTimeout>;
    const close = () => { clearTimeout(timer); channel.port1.close(); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => { close(); reject(new Error('Download stopped responding. Retry when connected.')); }, 120000); };
    arm();
    channel.port1.onmessage = event => {
      arm();
      if (event.data.type === 'PROGRESS') progress?.(event.data);
      else { close(); resolve(event.data); }
    };
    target.postMessage({ type, version: __OFFLINE_VERSION__, urls: [...urls] }, [channel.port2]);
  });
}
export async function downloadSize(urls: readonly string[]): Promise<number> {
  const response = await fetch(base + 'offline-manifest.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Download size unavailable.');
  const manifest = await response.json() as OfflineManifest;
  if (manifest.version !== __OFFLINE_VERSION__) throw new Error('An app update is available. Close other app tabs and reopen before downloading.');
  return [...new Set([...manifest.shell, ...urls])].reduce((sum, url) => sum + (manifest.sizes[url] ?? 0), 0);
}
