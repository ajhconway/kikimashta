import type { AnswerOutcome } from '../types';

export interface MasteryChange { label: string; direction: 'up' | 'down' }

/** The level change takes the stage; unchanged levels retain a simple outcome cue. (#141) */
export function MasteryFeedback({ outcome, change, saving = false }: {
  outcome: AnswerOutcome | null; change?: MasteryChange; saving?: boolean;
}) {
  const announcement = outcome === 'partial' ? 'Partial success. Take your time.'
    : outcome === 'success' ? 'Correct answer.' : 'Incorrect answer. Review the answer and try again.';
  return <div className="feedback" aria-live="polite">
    {outcome && <>
      <span className="sr-only">{announcement}</span>
      {change ? <div className={'mastery-change mastery-' + change.direction} role="img"
        aria-label={`Mastery ${change.direction === 'up' ? 'increased' : 'decreased'} to ${change.label}`}>
        <span className="mastery-arrow" aria-hidden="true">{change.direction === 'up' ? '↑' : '↓'}</span>
        <span className="mastery-copy" aria-hidden="true"><span className="mastery-caption">Level {change.direction}</span><span className="mastery-label">{change.label}</span></span>
        {change.direction === 'up' && <span className="mastery-sparks" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i key={index}>✦</i>)}</span>}
      </div> : <span className={'answer-result result-' + outcome} aria-hidden="true">{outcome === 'partial' ? '≈' : outcome === 'success' ? '✓' : '↺'}</span>}
    </>}
    {outcome && saving && <span className="sr-only">Saving…</span>}
  </div>;
}
