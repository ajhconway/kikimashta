import { useEffect, useState } from 'react';
import { downloadSize, offlineRequest, type OfflineResult } from '../offline/client';
import './OfflinePanel.css';

export function OfflinePanel({ urls, online, onReady }: { urls: readonly string[]; online: boolean; onReady: (ready: boolean) => void }) {
  const [result, setResult] = useState<OfflineResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState('');
  const [bytes, setBytes] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    onReady(false);
    void offlineRequest('STATUS', urls).then(value => {
      if (active) { setResult(value); onReady(value.ready); setError(value.error ?? ''); }
    }).catch(reason => { if (active) setAvailability(reason.message); });
    const verify = () => { void offlineRequest('STATUS', urls).then(value => { if (active) { setResult(value); onReady(value.ready); } }).catch(() => { if (active) onReady(false); }); };
    window.addEventListener('focus', verify);
    return () => { active = false; window.removeEventListener('focus', verify); };
  }, [urls, online, onReady]);
  async function run(type: 'DOWNLOAD' | 'REMOVE') {
    setBusy(true); setError(''); onReady(false);
    try {
      const value = await offlineRequest(type, urls, setResult);
      setResult(value); onReady(value.ready); setError(value.error ?? '');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Download failed. Retry when connected.'); }
    finally { setBusy(false); }
  }
  return <details className="offline-panel" onToggle={event => { if (event.currentTarget.open && online) void downloadSize(urls).then(setBytes).catch(() => {}); }}><summary>Offline practice{!online ? ' · offline' : result?.ready ? ' · ready' : ''}</summary>
    <p role="status">{busy ? `Preparing ${result?.completed ?? 0} of ${result?.total ?? urls.length} files…` : result?.ready ? 'Selected packs are downloaded for offline practice.' : 'Download selected packs before going offline.'}</p>
    <p>Includes all voices and contextual questions{bytes !== null ? ` · ${(bytes / 1024 / 1024).toFixed(1)} MB` : ''}. Downloads are shared on this device. Your practice history is saved separately.</p>
    {availability && <p>{availability}</p>}
    {error && <p role="alert">{error}</p>}
    <button className="text-button" disabled={busy || !online || !urls.length} onClick={() => void run('DOWNLOAD')}>{result?.ready ? 'Verify / repair downloads' : 'Download selected packs'}</button>
    <button className="text-button" disabled={busy} onClick={() => void run('REMOVE')}>Remove all downloads</button>
  </details>;
}
