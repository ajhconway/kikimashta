import { useEffect, useId, useRef, useState } from 'react';
import { downloadSize, offlineRequest, type OfflineResult } from '../offline/client';
import { deviceStorage } from '../core/device-storage';
import './OfflinePanel.css';

const preferenceKey = 'kikimashta-offline-enabled-v1';
function preference(): boolean | null {
  try { const value = deviceStorage.getItem(preferenceKey); return value === null ? null : value === 'true'; }
  catch { return null; }
}
function remember(value: boolean) {
  try { deviceStorage.setItem(preferenceKey, String(value)); } catch { /* Cache readiness still works when preferences are unavailable. */ }
}

export function OfflinePanel({ urls, online, open, onReady }: {
  urls: readonly string[]; online: boolean; open: boolean; onReady: (ready: boolean) => void;
}) {
  const id = useId();
  const [initialPreference] = useState(preference);
  const [enabled, setEnabled] = useState(initialPreference === true);
  const enabledRef = useRef(enabled);
  const readyCallback = useRef(onReady);
  useEffect(() => { readyCallback.current = onReady; }, [onReady]);
  const canMigrate = useRef(initialPreference === null);
  const [result, setResult] = useState<OfflineResult | null>(null);
  const [action, setAction] = useState<'DOWNLOAD' | 'REMOVE' | null>(null);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState('');
  const [bytes, setBytes] = useState<number | null>(null);
  const [sizeError, setSizeError] = useState('');
  const [sizeRefresh, setSizeRefresh] = useState(0);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const busy = useRef(false);
  const ready = enabled && result?.ready === true;
  const size = bytes ?? (result?.ready ? result.bytes : null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    onReady(false);
    const verify = () => {
      if (busy.current) return;
      const request = ++sequence.current;
      void offlineRequest('STATUS', urls).then(value => {
        if (!mounted.current || request !== sequence.current) return;
        // Existing explicit downloads remain enabled when upgrading to settings.
        if (canMigrate.current && value.ready && !enabledRef.current) {
          enabledRef.current = true; setEnabled(true); remember(true);
        }
        canMigrate.current = false;
        setResult(value); readyCallback.current(enabledRef.current && value.ready); setAvailability(value.error ?? '');
      }).catch(reason => {
        if (mounted.current && request === sequence.current) { setResult(null); setAvailability(reason instanceof Error ? reason.message : 'Downloads could not be checked.'); readyCallback.current(false); }
      });
    };
    verify(); window.addEventListener('focus', verify);
    return () => { window.removeEventListener('focus', verify); };
  }, [urls, online, onReady, initialPreference]);

  useEffect(() => {
    if (!open || !online) return;
    let active = true;
    void downloadSize(urls).then(value => { if (active) { setBytes(value); setSizeError(''); } })
      .catch(reason => { if (active) { setBytes(null); setSizeError(reason instanceof Error ? reason.message : 'Download size could not be checked.'); } });
    return () => { active = false; };
  }, [open, online, urls, sizeRefresh]);

  async function run(type: 'DOWNLOAD' | 'REMOVE') {
    if (busy.current) return;
    busy.current = true;
    const request = ++sequence.current;
    setAction(type); setError(''); onReady(false);
    try {
      const value = await offlineRequest(type, urls, progress => {
        if (mounted.current && request === sequence.current) setResult({ ...progress, ready: false });
      });
      if (!mounted.current || request !== sequence.current) return;
      setResult(value); readyCallback.current(enabledRef.current && value.ready); setError(value.error ?? '');
    } catch (reason) {
      if (mounted.current && request === sequence.current) {
        setResult(null); setError(reason instanceof Error ? reason.message : 'Download failed. Retry when connected.');
      }
    } finally {
      busy.current = false;
      if (mounted.current && request === sequence.current) setAction(null);
    }
  }
  function change(next: boolean) {
    canMigrate.current = false;
    enabledRef.current = next; setEnabled(next); remember(next);
    void run(next ? 'DOWNLOAD' : 'REMOVE');
  }
  const canDownload = online && size !== null && urls.length > 0;
  return <section className="offline-panel" aria-label="Offline practice">
    <label className="offline-toggle" htmlFor={id + '-enabled'}>
      <input id={id + '-enabled'} type="checkbox" checked={enabled} disabled={action !== null || (!enabled && !canDownload)}
        aria-describedby={id + '-size ' + id + '-policy ' + id + '-status'} onChange={event => change(event.target.checked)}/>
      <span>Enable offline practice</span>
    </label>
    <p className="offline-size" id={id + '-size'}>{size !== null
      ? <><strong>About {(size / 1_000_000).toFixed(1)} MB of storage.</strong> Use Wi-Fi for the download.</>
      : online ? 'Checking download size…' : 'Go online to check the download size.'}</p>
    <p id={id + '-policy'}>Downloads include your selected packs, all voices, and contextual questions. Turning this off removes downloads and keeps your practice history.</p>
    <p id={id + '-status'} role="status">{action === 'DOWNLOAD' ? `Downloading ${result?.completed ?? 0} of ${result?.total ?? urls.length} files…`
      : action === 'REMOVE' ? 'Removing downloads…'
      : ready ? 'Selected packs are ready for offline practice.'
      : enabled ? (online ? 'Download your selected packs to practice offline.' : 'Selected packs are not downloaded yet. Connect to download them.') : 'Offline practice is off.'}</p>
    {availability && <p className="offline-note">{availability}</p>}
    {sizeError && <p role="alert">{sizeError} <button className="text-button" type="button" disabled={!online} onClick={() => setSizeRefresh(value => value + 1)}>Check size again</button></p>}
    {error && <p role="alert">{error}</p>}
    {enabled && !ready && action === null && <button className="text-button" type="button" disabled={!canDownload} onClick={() => void run('DOWNLOAD')}>{error ? 'Retry download' : 'Download selected packs'}</button>}
    {!enabled && ((result?.completed ?? 0) > 0 || error) && action === null && <button className="text-button" type="button" onClick={() => void run('REMOVE')}>Remove remaining downloads</button>}
  </section>;
}
