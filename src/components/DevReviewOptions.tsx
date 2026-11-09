import { useEffect, useId, useRef } from 'react';
import type { DevReviewOptions as Options, DevReviewType } from '../core/dev-review';
import { masteryLevels } from '../core/mastery';
import './DevReviewOptions.css';

export interface DevReviewOptionsProps {
  availableTypes: readonly DevReviewType[];
  value: Options;
  onChange: (value: Options) => void;
  onStart: () => void;
  disabled?: boolean;
  error?: string;
  libraryHref: string;
}

/** Configure disposable practice samples without touching saved learning history. (#152) */
export function DevReviewOptions({ availableTypes, value, onChange, onStart, disabled = false, error, libraryHref }: DevReviewOptionsProps) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const types = availableTypes.filter(type => type.count > 0);
  const selectedTypes = types.filter(type => value.exercises.includes(type.exercise));
  const selectedLevels = value.masteryLevels.filter(level => Number.isInteger(level) && level >= 0 && level < masteryLevels.length);
  const canStart = !disabled && !error && selectedTypes.length > 0 && selectedLevels.length > 0;
  useEffect(() => { heading.current?.focus(); }, []);

  function toggleType(exercise: DevReviewType['exercise']) {
    onChange({ ...value, exercises: value.exercises.includes(exercise)
      ? value.exercises.filter(selected => selected !== exercise) : [...value.exercises, exercise] });
  }
  function toggleLevel(index: number) {
    onChange({ ...value, masteryLevels: value.masteryLevels.includes(index)
      ? value.masteryLevels.filter(selected => selected !== index) : [...value.masteryLevels, index] });
  }

  return <section className="dev-review-options" aria-labelledby={`${id}-heading`}>
    <div className="dev-options-intro">
      <span className="dev-options-badge">Unsaved practice</span>
      <h1 id={`${id}-heading`} ref={heading} tabIndex={-1}>Dev review options</h1>
      <p>Try review types at simulated mastery levels. Your saved progress stays unchanged.</p>
      <p className="dev-options-scope">Uses your selected language, packs, and voice preferences. Manage packs and voices in the <a href={libraryHref}>Card library</a>.</p>
    </div>
    <form onSubmit={event => { event.preventDefault(); if (canStart) onStart(); }}>
      <fieldset className="dev-options-panel" disabled={disabled}>
        <legend>Review types</legend>
        {types.length > 0 ? <div className="dev-options-types">
          {types.map(type => <label className="dev-option-choice" key={type.exercise}>
            <input type="checkbox" checked={value.exercises.includes(type.exercise)} onChange={() => toggleType(type.exercise)} aria-label={type.label} aria-describedby={`${id}-${type.exercise}-count`}/>
            <span><strong>{type.label}</strong><small id={`${id}-${type.exercise}-count`}>{type.count} available</small></span>
          </label>)}
        </div> : <p role="status">No review types are available in your selected packs. Choose a pack in the Card library.</p>}
        {types.length > 0 && selectedTypes.length === 0 && <p className="dev-options-hint" role="status">Choose at least one review type.</p>}
      </fieldset>
      <fieldset className="dev-options-panel" disabled={disabled} aria-describedby={`${id}-mastery-note`}>
        <legend>Mastery levels</legend>
        <p id={`${id}-mastery-note`} className="dev-options-help">Each question starts at one of these sample levels, independently of your real mastery. Japanese word alternatives get closer at higher levels, including with untimed practice. Times shown use Follow mastery.</p>
        <div className="dev-options-level-actions">
          <button type="button" onClick={() => onChange({ ...value, masteryLevels: masteryLevels.map((_, index) => index) })}>All levels</button>
          <button type="button" onClick={() => onChange({ ...value, masteryLevels: [] })}>Clear levels</button>
        </div>
        <div className="dev-options-levels">
          {masteryLevels.map((level, index) => <label className="dev-option-choice" key={level.label}>
            <input type="checkbox" checked={value.masteryLevels.includes(index)} onChange={() => toggleLevel(index)} aria-label={level.label} aria-describedby={`${id}-level-${index}-timer`}/>
            <span><strong>{level.label}</strong><small id={`${id}-level-${index}-timer`}>{level.timerMs === null ? 'Untimed' : `${level.timerMs / 1000}s timer`}</small></span>
          </label>)}
        </div>
        {selectedLevels.length === 0 && <p className="dev-options-hint" role="status">Choose at least one mastery level.</p>}
      </fieldset>
      <fieldset className="dev-options-panel" disabled={disabled}>
        <legend>Session</legend>
        <div className="dev-options-session">
          <label>Questions<select aria-label="Questions" value={value.count} onChange={event => onChange({ ...value, count: Number(event.target.value) })}>
            {[6, 8, 12, 24].map(count => <option key={count} value={count}>{count} questions</option>)}
          </select></label>
          <label>Timer behavior<select aria-label="Timer behavior" value={value.timerMode} onChange={event => onChange({ ...value, timerMode: event.target.value as Options['timerMode'] })} aria-describedby={`${id}-timer-note`}>
            <option value="mastery">Follow mastery</option>
            <option value="random">Random timers</option>
            <option value="untimed">Untimed</option>
          </select></label>
        </div>
        <p id={`${id}-timer-note`} className="dev-options-help">Timers apply to word and contextual reviews after playback. Lessons and corrective retries stay untimed.</p>
      </fieldset>
      {error && <p className="dev-options-error" role="alert">{error}</p>}
      <div className="dev-options-start">
        <p>No answers, mastery changes, or account progress are saved.</p>
        <button className="primary" type="submit" disabled={!canStart}>Start dev review</button>
      </div>
    </form>
  </section>;
}
