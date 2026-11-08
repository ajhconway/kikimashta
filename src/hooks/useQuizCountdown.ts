import { useEffect, useState, type RefObject } from 'react';
import type { PracticeAttempt } from '../types';

/** Wait for the card entrance and picture loading as well as completed audio. */
export function useQuizCountdown({ id, limitMs, audioFinished, answered, grid, now }: {
  id: string; limitMs: number | null; audioFinished: boolean; answered: boolean;
  grid: RefObject<HTMLDivElement | null>; now: () => number;
}) {
  const [visibleId, setVisibleId] = useState('');
  const [started, setStarted] = useState<{ id: string; timer: NonNullable<PracticeAttempt['timer']> } | null>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (!id || limitMs === null) return;
    let entered = false;
    const images = Array.from(grid.current?.querySelectorAll('img') ?? []);
    const pending = new Set(images.filter(image => !image.complete));
    function check() { if (entered && !pending.size) setVisibleId(id); }
    function loaded(event: Event) { pending.delete(event.currentTarget as HTMLImageElement); check(); }
    for (const image of pending) { image.addEventListener('load', loaded); image.addEventListener('error', loaded); }
    const entrance = window.setTimeout(() => { entered = true; check(); }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 480);
    return () => {
      window.clearTimeout(entrance);
      for (const image of images) { image.removeEventListener('load', loaded); image.removeEventListener('error', loaded); }
    };
  }, [id, limitMs, grid]);
  useEffect(() => {
    if (!id || limitMs === null || visibleId !== id || !audioFinished || answered || started?.id === id) return;
    const start = window.setTimeout(() => {
      const startedAt = now();
      setStarted({ id, timer: { startedAt, limitMs } }); setAt(startedAt);
    }, 0);
    return () => window.clearTimeout(start);
  }, [id, limitMs, visibleId, audioFinished, answered, started, now]);
  const timer = started?.id === id ? started.timer : undefined;
  useEffect(() => {
    if (!timer || answered) return;
    function tick() {
      const at = now(); setAt(at);
      if (at >= timer!.startedAt + timer!.limitMs) window.clearInterval(interval);
    }
    const interval = window.setInterval(tick, 50);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [timer, answered, now]);
  const fraction = timer ? Math.max(0, Math.min(1, (at - timer.startedAt) / timer.limitMs)) : 0;
  return { timer, fraction, expired: fraction >= 1 };
}
