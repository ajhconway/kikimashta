/** Shared production practice header and session progress, also used by review demos. */
const asset = (path: string) => import.meta.env.BASE_URL + path;

export function PracticeHeader({ language, onHome }: { language: string; onHome: () => void }) {
  return <header><button className="brand" onClick={onHome} aria-label="Kikimashta home"><img className="brand-mark" src={asset('brand/kikimashta-cat-v1.png')} alt="" aria-hidden="true" draggable={false}/><svg className="practice-close" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg><span className="brand-name">kikimashta</span><span className="brand-dot">.</span></button><span className="language"><i/> {language}</span></header>;
}

export function QuizProgress({ total, completed, mistakes }: { total: number; completed: number; mistakes: number }) {
  return <div className="quiz-progress"><div className="round-progress" role="progressbar" aria-label="Session progress" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={total} aria-valuetext={`${completed} of ${total} sounds completed`}>
    <div className="progress-beads" aria-hidden="true">{total > 12 ? <span className="progress-track"><span style={{ width: `${completed / total * 100}%` }}/></span> : Array.from({ length: total }, (_, i) => <span key={i} className={'progress-bead' + (i < completed ? ' is-complete' : i === completed ? ' is-current' : '')}/>)}</div>
    <span className="round-count" aria-hidden="true" style={{ minWidth: `${String(total).length * 2 + 3}ch` }}>{completed} / {total}</span>
  </div><div className="quiz-mistakes" role="status" aria-label="Mistakes"><span className="sr-only">{mistakes} incorrect answer{mistakes === 1 ? '' : 's'}</span><span className="mistake-icons" aria-hidden="true">{Array.from({ length: Math.min(mistakes, 5) }, (_, i) => <span className="mistake-icon" key={i}><svg viewBox="0 0 16 16" fill="none" focusable="false"><path d="m5 5 6 6M11 5l-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></span>)}{mistakes > 5 && <span className="mistake-overflow">+{mistakes - 5}</span>}</span></div></div>;
}
