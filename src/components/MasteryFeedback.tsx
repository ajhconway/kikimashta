import type { AnswerOutcome } from '../types';

export interface QuestionMastery { label: string; timerMs: number | null; demo?: boolean }

export interface MasteryChange { label: string; direction: 'up' | 'down' }

/** The level change takes the stage; unchanged levels retain a simple outcome cue. (#141) */
export function MasteryFeedback({ outcome, change, current, saving = false }: {
  outcome: AnswerOutcome | null; change?: MasteryChange; current?: QuestionMastery; saving?: boolean;
}) {
  const announcement = outcome === 'partial' ? 'Partial success. Take your time.'
    : outcome === 'success' ? 'Correct answer.' : 'Incorrect answer. Review the answer and try again.';
  const result = <span className={'answer-result result-' + outcome} aria-hidden="true">{outcome === 'partial' ? '≈' : outcome === 'success' ? '✓' : '↺'}</span>;
  return <div className="feedback" aria-live="polite">
    {current && <div className="question-mastery" role="status" aria-label={current.demo ? 'Demo mastery' : 'Current mastery'} aria-hidden={!!outcome && !!change || undefined}>
      {outcome && !change && result}
      <span className="question-mastery-label">{current.label}</span>
      <span className="question-mastery-timer">{current.timerMs === null ? 'Untimed' : `${current.timerMs / 1000}s`}</span>
      {current.demo && <span className="sr-only">Unsaved demo</span>}
    </div>}
    {outcome && <>
      <span className="sr-only">{announcement}</span>
      {change ? <div className={'mastery-change mastery-' + change.direction} role="img"
        aria-label={`Mastery ${change.direction === 'up' ? 'increased' : 'decreased'} to ${change.label}`}>
        <span className="mastery-arrow" aria-hidden="true">{change.direction === 'up' ? '↑' : '↓'}</span>
        <span className="mastery-label" aria-hidden="true">{change.label}</span>
        {change.direction === 'up' && <span className="mastery-sparks" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i key={index}>✦</i>)}</span>}
      </div> : !current && result}
    </>}
    {outcome && saving && <span className="sr-only">Saving…</span>}
  </div>;
}
