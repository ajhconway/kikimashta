import type { AnswerOutcome } from '../types';

const asset = (path: string) => import.meta.env.BASE_URL + path;

export function Speaker() {
  return <svg width={32} height={32} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 12h5l7-6v20l-7-6H6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M23 10c4 3 4 9 0 12M26 6c7 5 7 15 0 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
export function QuizCompanion({ listening, response }: { listening: boolean; response: AnswerOutcome | null }) {
  const mood = response === 'partial' ? 'is-partial' : response === 'success' ? 'is-cheering' : response === 'failure' ? 'is-encouraging' : listening ? 'is-listening' : '';
  return <div className={'quiz-companion ' + mood} aria-hidden="true"><img src={asset('brand/kikimashta-cat-v1.png')} alt="" draggable={false}/><span className="companion-sparks">{Array.from({ length: 6 }, (_, i) => <span className="companion-spark" key={i}>✦</span>)}</span></div>;
}

