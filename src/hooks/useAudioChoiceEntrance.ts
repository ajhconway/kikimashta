import { useLayoutEffect, useState, type RefObject } from 'react';

/** Delayed choices land together at the media endpoint (#170), including after stalls. */
export function useAudioChoiceEntrance({ id, enabled, audio, grid, canReveal }: {
  id: string; enabled: boolean; audio: RefObject<HTMLAudioElement | null>;
  grid: RefObject<HTMLDivElement | null>; canReveal?: () => boolean;
}) {
  const [finishedId, setFinishedId] = useState('');
  useLayoutEffect(() => {
    if (!enabled || !id) return;
    const media = audio.current, element = grid.current;
    if (!media || !element) return;
    const slots = Array.from(element.querySelectorAll<HTMLElement>('.choice-slot'));
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let finished = false;
    function finish() {
      if (finished || (canReveal && !canReveal())) return;
      finished = true;
      cancelAnimationFrame(frame);
      element!.style.visibility = 'visible';
      for (const slot of slots) slot.style.removeProperty('transform');
      setFinishedId(id);
    }
    function update() {
      if (canReveal && !canReveal()) {
        element!.style.visibility = 'hidden';
        frame = requestAnimationFrame(update);
        return;
      }
      if (media!.ended) { finish(); return; }
      const remaining = media!.duration - media!.currentTime;
      const visible = Number.isFinite(remaining) && remaining <= .36 && !reduced;
      element!.style.visibility = visible ? 'visible' : 'hidden';
      const span = Math.min(.36, media!.duration);
      const progress = span > 0 ? Math.max(0, Math.min(1, 1 - remaining / span)) : 1;
      // Ease out while using the media clock rather than a separate animation clock.
      const offset = (1 - progress) ** 3 * 110;
      for (const [index, slot] of slots.entries()) slot.style.transform = `translateX(${index % 2 ? offset : -offset}vw)`;
      frame = requestAnimationFrame(update);
    }
    media.addEventListener('ended', finish);
    update();
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('ended', finish);
      element.style.removeProperty('visibility');
      for (const slot of slots) slot.style.removeProperty('transform');
    };
  }, [id, enabled, audio, grid, canReveal]);
  return !enabled || finishedId === id;
}
