import { useMemo, useState } from 'react';
import type { ContextualAnswerFormat, ContextualBank, ContextualItem, ContextualQuestion } from '../content/contextual-types';
import type { PracticeAttempt, WordItem } from '../types';
import { contextualQuestion } from '../core/contextual-questions';
import { correctChoiceId } from '../core/session';
import { ContextualQuiz } from './ContextualQuiz';

export interface ContextualDevReviewProps {
  banks: readonly ContextualBank[];
  vocabulary: readonly WordItem[];
  onClose: () => void;
  random?: () => number;
}
interface Entry { context: ContextualItem; question: ContextualQuestion }
const defaultRandom = () => 0;

/** Complete authored coverage. No storage, scheduling or unlock writes occur here. */
export function ContextualDevReview({ banks, vocabulary, onClose, random = defaultRandom }: ContextualDevReviewProps) {
  const [stage, setStage] = useState('all');
  const [target, setTarget] = useState('all');
  const [kind, setKind] = useState('all');
  const [format, setFormat] = useState<ContextualAnswerFormat>('text');
  const [voice, setVoice] = useState('any');
  const [index, setIndex] = useState(0);
  const [visit, setVisit] = useState(0);
  const [feedback, setFeedback] = useState<PracticeAttempt | null>(null);
  const [complete, setComplete] = useState(false);
  const allEntries = useMemo(() => banks.flatMap(bank => bank.contexts.flatMap(context =>
    context.questions.map(question => ({ context, question })))).sort((a, b) =>
    Number((a.context.stage ?? 'contrastive') === 'contrastive') - Number((b.context.stage ?? 'contrastive') === 'contrastive')), [banks]);
  const entries = useMemo(() => allEntries.filter(({ context, question }) =>
    (stage === 'all' || (context.stage ?? 'contrastive') === stage) &&
    (target === 'all' || context.targetItemId === target) &&
    (kind === 'all' || question.kind === kind) && question.formats.includes(format)), [allEntries, stage, target, kind, format]);
  const targets = useMemo(() => [...new Set(allEntries.map(entry => entry.context.targetItemId))]
    .map(id => vocabulary.find(item => item.id === id)).filter((item): item is WordItem => !!item), [allEntries, vocabulary]);
  const voices = useMemo(() => [...new Set(allEntries.flatMap(entry => entry.context.recordings.map(recording => recording.voice)))], [allEntries]);
  const currentIndex = Math.min(index, entries.length - 1);
  const entry: Entry | undefined = entries[currentIndex];
  const question = useMemo(() => {
    if (!entry) return undefined;
    const context = voice === 'any' ? entry.context : { ...entry.context,
      recordings: entry.context.recordings.filter(recording => recording.voice === voice) };
    return contextualQuestion(context, entry.question, format, vocabulary, random);
  }, [entry, voice, format, vocabulary, random]);
  function navigate(next: number) {
    setIndex(next); setVisit(value => value + 1); setFeedback(null); setComplete(false);
  }
  function filter(change: () => void) { change(); navigate(0); }
  function next() { if (currentIndex + 1 < entries.length) navigate(currentIndex + 1); else setComplete(true); }
  return <section className="contextual-dev-review">
    <h1>Contextual dev review</h1>
    <p className="contextual-dev-note">Evaluation only · no progress saved. All authored questions are available, including text inspection for drafts and missing audio.</p>
    <div className="contextual-dev-controls">
      <label>Stage<select value={stage} onChange={event => filter(() => setStage(event.target.value))}><option value="all">Both stages</option><option value="simple">Simple</option><option value="contrastive">Contrastive</option></select></label>
      <label>Target word<select value={target} onChange={event => filter(() => setTarget(event.target.value))}><option value="all">All words</option>{targets.map(item => <option key={item.id} value={item.id}>{item.text} · {item.label}</option>)}</select></label>
      <label>Question kind<select value={kind} onChange={event => filter(() => setKind(event.target.value))}><option value="all">Both kinds</option><option value="target">Target-word answer</option><option value="detail">Other detail</option></select></label>
      <label>Answer format<select value={format} onChange={event => filter(() => setFormat(event.target.value as ContextualAnswerFormat))}><option value="text">Japanese writing</option><option value="picture">Pictures</option></select></label>
      {voices.length > 0 && <label>Voice<select value={voice} onChange={event => filter(() => setVoice(event.target.value))}><option value="any">Any available voice</option>{voices.map(name => <option key={name} value={name}>{name[0]!.toUpperCase() + name.slice(1)}</option>)}</select></label>}
    </div>
    {!entries.length ? <p role="status">No questions match these filters.</p> : complete ? <div className="contextual-feedback"><h2>Review complete</h2><p>{entries.length} questions in this selection.</p><button type="button" className="primary" onClick={() => navigate(0)}>Review again</button></div> : question && entry && <>
      <label className="contextual-dev-jump">Jump to question<select value={currentIndex} onChange={event => navigate(Number(event.target.value))}>{entries.map((row, position) => <option key={row.question.id} value={position}>{position + 1}. {row.question.id}</option>)}</select></label>
      <p className="contextual-dev-position" role="status">Question {currentIndex + 1} of {entries.length} · {entry.context.stage ?? 'contrastive'} · {entry.question.kind === 'target' ? 'target-word answer' : 'other detail'}</p>
      <p className="contextual-dev-id">{entry.context.id} · sentence revision {entry.context.revision} · question revision {entry.question.revision}</p>
      <ContextualQuiz key={`${entry.question.id}:${format}:${voice}:${visit}`} question={question} feedback={feedback} onContinue={next}
        onChoose={choice => {
          const answeredAt = Date.now();
          setFeedback({ id: 'dev-answer', sessionId: 'contextual-dev', itemId: question.target.id, language: question.target.language,
            choiceIds: question.choices.map(option => option.id), selectedId: choice.id, correct: choice.id === correctChoiceId(question),
            startedAt: answeredAt, answeredAt, responseMs: 0 });
        }}/>
      <div className="contextual-dev-navigation"><button type="button" className="text-button" disabled={currentIndex === 0} onClick={() => navigate(currentIndex - 1)}>Previous question</button><button type="button" className="text-button" disabled={currentIndex + 1 >= entries.length} onClick={() => navigate(currentIndex + 1)}>Next question</button></div>
    </>}
    <button type="button" className="text-button" onClick={onClose}>Close contextual review</button>
  </section>;
}
