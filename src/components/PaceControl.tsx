import { useCallback, useId, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { DENSITY_LEVELS, densityLevel, type DensityLevel, type DensityRange } from '../core/density';
import './PaceControl.css';

const rowHeight = 32;
const settleDelay = 120;
type Level = typeof DENSITY_LEVELS[number];

export function DensityIndicator({ value }: { value: number | null }) {
  const level = value === null ? null : densityLevel(value);
  return <div className="pace-density" data-density={level || undefined} role="status" aria-label="Review density">{DENSITY_LEVELS.find(candidate => candidate.id === level)?.label || '…'}</div>;
}

/** The scroll position changes selection only after an actual user interaction. */
function DensityWheel({ label, value, levels, onChange }: {
  label: string;
  value: DensityLevel;
  levels: readonly Level[];
  onChange: (value: DensityLevel) => void;
}) {
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const interacting = useRef(false);
  const touching = useRef(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, levels.findIndex(level => level.id === value));

  const cancelSettle = useCallback(() => {
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = null;
  }, []);

  useLayoutEffect(() => {
    // Adjust this element only. Restoring preferences must never scroll the page
    // or emit a new selection through a programmatic scroll event.
    interacting.current = false;
    cancelSettle();
    const element = viewport.current;
    if (element) element.scrollTop = index * rowHeight;
    return cancelSettle;
  }, [index, levels, cancelSettle]);

  function select(nextIndex: number) {
    interacting.current = false;
    cancelSettle();
    const next = levels[Math.min(levels.length - 1, Math.max(0, nextIndex))]!;
    if (viewport.current) viewport.current.scrollTop = levels.indexOf(next) * rowHeight;
    if (next.id !== value) onChange(next.id);
  }
  function settle() {
    cancelSettle();
    if (!interacting.current || touching.current || !viewport.current) return;
    select(Math.round(viewport.current.scrollTop / rowHeight));
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
  const arm = () => { interacting.current = true; };
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
  return <div className="pace-wheel-bubble" data-density={value}>
    <div ref={viewport} className="pace-wheel" role="listbox" aria-label={label} aria-activedescendant={`${id}-${levels[index]!.id}`}
      tabIndex={0} onKeyDown={keyboard} onPointerDown={arm} onTouchStart={startTouch} onTouchEnd={endTouch} onTouchCancel={endTouch} onWheel={arm} onScroll={scrolling} onScrollEnd={settle}>
      <div className="pace-wheel-spacer" aria-hidden="true"/>
      {levels.map(level => <div key={level.id} id={`${id}-${level.id}`} className="pace-option" data-density={level.id}
        role="option" aria-selected={level.id === value} onClick={() => select(levels.indexOf(level))}>{level.label}</div>)}
      <div className="pace-wheel-spacer" aria-hidden="true"/>
    </div>
  </div>;
}

export function PaceControl({ value, range, onChange }: {
  value: number | null;
  range: DensityRange;
  onChange: (range: DensityRange) => void;
}) {
  const minimumLevels = useMemo(() => DENSITY_LEVELS.filter(level => level.threshold <= DENSITY_LEVELS.find(candidate => candidate.id === range.max)!.threshold), [range.max]);
  const maximumLevels = useMemo(() => DENSITY_LEVELS.filter(level => level.threshold >= DENSITY_LEVELS.find(candidate => candidate.id === range.min)!.threshold), [range.min]);
  const cat = import.meta.env.BASE_URL + 'brand/kikimashta-cat-v1.png';
  return <div className="pace-control" role="group" aria-label="Practice pace">
    <div className="pace-column"><span className="pace-heading">Min</span><div className="pace-kiku" aria-hidden="true"><img src={cat} alt="" draggable={false}/></div><DensityWheel label="Minimum" value={range.min} levels={minimumLevels} onChange={min => onChange({ ...range, min })}/></div>
    <div className="pace-column"><span className="pace-heading">Now</span><div className="pace-kiku" aria-hidden="true"><img src={cat} alt="" draggable={false}/></div><DensityIndicator value={value}/></div>
    <div className="pace-column"><span className="pace-heading">Max</span><div className="pace-kiku" aria-hidden="true"><img src={cat} alt="" draggable={false}/></div><DensityWheel label="Maximum" value={range.max} levels={maximumLevels} onChange={max => onChange({ ...range, max })}/></div>
  </div>;
}
