import { useCallback, useId, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { DENSITY_LEVELS, densityLevel, type DensityLevel, type DensityRange } from '../core/density';
import './PaceControl.css';

const rowHeight = 120;
const viewportHeight = 192;
const settleDelay = 120;
const reboundDuration = 200;

const moodImages: Record<DensityLevel, string> = {
  minimal: 'brand/kikimashta-cat-v1.png',
  light: 'brand/pace/kiku-light-v1.png',
  moderate: 'brand/pace/kiku-moderate-v1.png',
  high: 'brand/pace/kiku-high-v1.png',
  intense: 'brand/pace/kiku-intense-v1.png',
};
function KikuMood({ level }: { level: DensityLevel | null }) {
  return <img className="pace-kiku" src={import.meta.env.BASE_URL + moodImages[level || 'minimal']} alt="" aria-hidden="true" draggable={false}/>;
}

export function DensityIndicator({ value }: { value: number | null }) {
  const level = value === null ? null : densityLevel(value);
  return <div className="pace-density" data-density={level || undefined} role="status" aria-label="Review density">{DENSITY_LEVELS.find(candidate => candidate.id === level)?.label || '…'}</div>;
}

/** The scroll position changes selection only after an actual user interaction. */
function DensityWheel({ label, value, firstEnabled = 0, lastEnabled = DENSITY_LEVELS.length - 1, onChange }: {
  label: string;
  value: DensityLevel;
  firstEnabled?: number;
  lastEnabled?: number;
  onChange: (value: DensityLevel) => void;
}) {
  const levels = DENSITY_LEVELS;
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const interacting = useRef(false);
  const touching = useRef(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rebound = useRef<number | null>(null);
  const index = Math.max(0, levels.findIndex(level => level.id === value));

  const cancelSettle = useCallback(() => {
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = null;
  }, []);
  const cancelRebound = useCallback(() => {
    if (rebound.current !== null) cancelAnimationFrame(rebound.current);
    rebound.current = null;
    if (viewport.current) delete viewport.current.dataset.rebounding;
  }, []);

  useLayoutEffect(() => {
    // Adjust this element only. Restoring preferences must never scroll the page
    // or emit a new selection through a programmatic scroll event.
    interacting.current = false;
    cancelSettle();
    cancelRebound();
    const element = viewport.current;
    if (element) element.scrollTop = index * rowHeight;
    return () => { cancelSettle(); cancelRebound(); };
  }, [index, firstEnabled, lastEnabled, cancelSettle, cancelRebound]);

  function select(nextIndex: number, animateRebound = false) {
    interacting.current = false;
    cancelSettle();
    cancelRebound();
    const allowedIndex = Math.min(lastEnabled, Math.max(firstEnabled, nextIndex));
    const next = levels[allowedIndex]!;
    const element = viewport.current;
    const target = allowedIndex * rowHeight;
    const finish = () => {
      rebound.current = null;
      if (element) {
        element.scrollTop = target;
        delete element.dataset.rebounding;
      }
      if (next.id !== value) onChange(next.id);
    };
    if (!element || !animateRebound || allowedIndex === nextIndex ||
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || Math.abs(element.scrollTop - target) < 1) {
      finish();
      return;
    }
    const from = element.scrollTop;
    const overshoot = Math.sign(target - from) * Math.min(6, Math.abs(target - from) * 0.06);
    let started: number | null = null;
    // Let the spring pass the resting point a few pixels without native snap
    // fighting each frame. Programmatic frames never count as new input.
    element.dataset.rebounding = 'true';
    function frame(now: number) {
      started ??= now;
      const progress = Math.min(1, (now - started) / reboundDuration);
      if (progress === 1) { finish(); return; }
      if (progress < 0.8) {
        element!.scrollTop = from + (target + overshoot - from) * (1 - (1 - progress / 0.8) ** 3);
      } else {
        const tail = (progress - 0.8) / 0.2;
        element!.scrollTop = target + overshoot * (1 - tail * tail * (3 - 2 * tail));
      }
      rebound.current = requestAnimationFrame(frame);
    }
    rebound.current = requestAnimationFrame(frame);
  }
  function settle() {
    cancelSettle();
    if (!interacting.current || touching.current || !viewport.current) return;
    select(Math.round(viewport.current.scrollTop / rowHeight), true);
  }
  function scrolling() {
    if (!interacting.current) return;
    cancelSettle();
    pending.current = setTimeout(settle, settleDelay);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const next = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? levels.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    select(next);
  }
  const arm = () => { cancelRebound(); interacting.current = true; };
  function startTouch() {
    touching.current = true;
    cancelSettle();
    arm();
  }
  function endTouch() {
    touching.current = false;
    // A quiet pause while a finger is held is not the end of the gesture.
    // Once released, wait for any momentum scrolling to settle as usual.
    scrolling();
  }
  return <div className="pace-wheel-bubble">
    <div ref={viewport} className="pace-wheel" role="listbox" aria-label={label} aria-activedescendant={`${id}-${levels[index]!.id}`}
      tabIndex={0} onKeyDown={keyboard} onPointerDown={arm} onTouchStart={startTouch} onTouchEnd={endTouch} onTouchCancel={endTouch} onWheel={arm} onScroll={scrolling} onScrollEnd={settle}>
      <div className="pace-wheel-spacer" aria-hidden="true"/>
      {levels.map((level, optionIndex) => {
        const disabled = optionIndex < firstEnabled || optionIndex > lastEnabled;
        return <div key={level.id} className="pace-option-slot" role="presentation"><div id={`${id}-${level.id}`} className="pace-option pace-choice" data-density={level.id}
          role="option" aria-selected={level.id === value} aria-disabled={disabled} onClick={() => { if (!disabled) select(optionIndex); }}><KikuMood level={level.id}/><span>{level.label}</span></div></div>;
      })}
      <div className="pace-wheel-spacer" aria-hidden="true"/>
    </div>
  </div>;
}

export function PaceControl({ value, range, onChange }: {
  value: number | null;
  range: DensityRange;
  onChange: (range: DensityRange) => void;
}) {
  const minimumIndex = DENSITY_LEVELS.findIndex(level => level.id === range.min);
  const maximumIndex = DENSITY_LEVELS.findIndex(level => level.id === range.max);
  const current = value === null ? null : densityLevel(value);
  const currentLabel = DENSITY_LEVELS.find(level => level.id === current)?.label || '…';
  const dimensions = { '--pace-row-height': `${rowHeight}px`, '--pace-viewport-height': `${viewportHeight}px` } as CSSProperties;
  return <div className="pace-control" role="group" aria-label="Practice pace" style={dimensions}>
    <div className="pace-column"><span className="pace-heading">Min</span><DensityWheel label="Minimum" value={range.min} lastEnabled={maximumIndex} onChange={min => onChange({ ...range, min })}/></div>
    <div className="pace-column"><span className="pace-heading">Now</span><div className="pace-current-frame"><div className="pace-current-tile pace-choice" data-density={current || undefined} role="status" aria-label="Review density"><KikuMood level={current}/><span>{currentLabel}</span></div></div></div>
    <div className="pace-column"><span className="pace-heading">Max</span><DensityWheel label="Maximum" value={range.max} firstEnabled={minimumIndex} onChange={max => onChange({ ...range, max })}/></div>
  </div>;
}
