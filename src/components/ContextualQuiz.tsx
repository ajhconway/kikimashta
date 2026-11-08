import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ContextualPrompt } from '../content/contextual-types';
import type { PracticeAttempt, WordItem } from '../types';
import { answerFormat } from '../core/cards';
import { correctChoiceId, type Question } from '../core/session';
import './ContextualQuiz.css';

export interface ContextualQuizProps {
  question: Question;
  feedback: PracticeAttempt | null;
  onChoose: (choice: WordItem) => void;
  onContinue: () => void;
  onReplay?: () => void;
  disabled?: boolean;
  preview?: boolean;
}
const asset = (path: string) => import.meta.env.BASE_URL + path;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function Prompt({ title, value }: { title: string; value: ContextualPrompt }) {
  return <div className="contextual-prompt"><h3>{title}</h3><p lang="ja" className="contextual-japanese">{value.text}</p>
    <p lang="ja" className="contextual-reading">{value.reading}</p><p>{value.meaning}</p></div>;
}

/** Shared learner interaction; persistence and scheduling belong to its caller. */
export function ContextualQuiz({ question, feedback, onChoose, onContinue, onReplay, disabled = false, preview = false }: ContextualQuizProps) {
  const authored = question.contextual;
  if (!authored) throw new Error('A contextual quiz needs authored context.');
  const sentenceSrc = authored.recording?.sentenceSrc;
  const questionSrc = authored.recording?.questionSrcs[authored.question.id];
  const hasAudio = !!sentenceSrc && !!questionSrc;
  const audio = useRef<HTMLAudioElement>(null);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const segment = useRef<'sentence' | 'question' | null>(null);
  const [playback, setPlayback] = useState<'playing' | 'paused' | 'ready' | 'idle' | 'error'>('idle');
  const [inspectedQuestion, setInspectedQuestion] = useState<string | null>(null);
  const questionKey = `${authored.context.id}:${authored.question.id}`;
  const inspecting = inspectedQuestion === questionKey;
  const answered = useRef(false);
  const stop = useCallback(() => {
    request.current++;
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    segment.current = null;
    audio.current?.pause();
  }, []);
  const playSegment = useCallback((src: string, kind: 'sentence' | 'question', token: number) => {
    const element = audio.current;
    if (!element || request.current !== token) return;
    segment.current = kind;
    element.src = asset(src); element.currentTime = 0;
    setPlayback('playing');
    void element.play().catch((error: unknown) => {
      if (request.current === token) {
        stop();
        // A direct visit may have no user gesture yet. Keep replay available
        // without treating the browser's autoplay policy as a broken recording.
        const needsGesture = typeof error === 'object' && error !== null && 'name' in error && error.name === 'NotAllowedError';
        setPlayback(needsGesture ? 'ready' : 'error');
      }
    });
  }, [stop]);
  const play = useCallback(() => {
    stop();
    if (!sentenceSrc || !questionSrc) return;
    playSegment(sentenceSrc, 'sentence', request.current);
  }, [stop, playSegment, sentenceSrc, questionSrc]);
  useEffect(() => {
    answered.current = false;
    play();
    const suspend = () => {
      if (document.visibilityState === 'hidden') { stop(); setPlayback('paused'); }
    };
    document.addEventListener('visibilitychange', suspend);
    return () => { document.removeEventListener('visibilitychange', suspend); stop(); };
  }, [play, stop, authored.context.id, authored.question.id]);
  function ended() {
    const token = request.current;
    if (segment.current === 'sentence' && questionSrc) {
      segment.current = null;
      timer.current = setTimeout(() => { timer.current = undefined; playSegment(questionSrc, 'question', token); }, 650);
    } else if (segment.current === 'question') { segment.current = null; setPlayback('idle'); }
  }
  const revealed = preview || !!feedback || inspecting;
  const correctId = correctChoiceId(question);
  const correct = question.choices.find(choice => choice.id === correctId)!;
  const format = answerFormat(question.exercise);
  return <section className="contextual-quiz" data-exercise={question.exercise} data-question-id={authored.question.id}>
    <audio ref={audio} preload="auto" onEnded={ended} onError={() => { stop(); setPlayback('error'); }}/>
    <h2>{preview ? 'Listen in context' : 'Listen and choose'}</h2>
    {hasAudio ? <>
      <button className="listen contextual-replay" type="button" onClick={() => { onReplay?.(); play(); }} aria-label="Replay sentence and question">
        {playback === 'playing' ? 'Playing… · Replay' : 'Replay sentence and question'}
      </button>
      {playback === 'error' && <p className="error" role="alert">The sound couldn’t play. Replay the sentence and question to retry.</p>}
      {playback === 'ready' && <p role="status">Ready to listen. Tap Replay to hear the sentence and question.</p>}
      {playback === 'paused' && <p role="status">Playback paused. Replay when you’re ready.</p>}
      {authored.context.review.audio !== 'approved' && <p className="contextual-review-state">Audio awaiting listening approval.</p>}
    </> : <div className="contextual-inspection"><p role="status">Text inspection · audio not available</p>
      {!revealed && <button className="text-button" type="button" onClick={() => setInspectedQuestion(questionKey)}>Show text for inspection</button>}
    </div>}
    {authored.context.review.text !== 'approved' && <p className="contextual-review-state">Text awaiting approval.</p>}
    {revealed && <div className="contextual-transcript"><Prompt title="Sentence" value={authored.context.sentence}/><Prompt title="Question" value={authored.question.prompt}/></div>}
    {!preview && <div className="contextual-choices" aria-label={format === 'picture' ? 'Picture answers' : 'Written answers'}>
      {question.choices.map((choice, index) => <button type="button" key={choice.id}
        className={'contextual-choice ' + (format === 'picture' ? 'contextual-picture' : 'contextual-written')}
        disabled={disabled || !!feedback || playback === 'error' || playback === 'ready' || (!hasAudio && !inspecting)}
        data-correct={feedback ? choice.id === correctId : undefined}
        data-selected={feedback ? choice.id === feedback.selectedId : undefined}
        aria-label={format === 'picture' ? `Choose picture ${index + 1}: ${choice.image.alt}` : `Choose writing ${choice.text}`}
        onClick={() => { if (!answered.current) { answered.current = true; stop(); setPlayback('idle'); onChoose(choice); } }}>
        {format === 'picture' ? <img src={asset(choice.image.src)} alt={choice.image.alt} draggable={false}/> :
          <span lang={choice.language} style={{ '--writing-length': Math.max(1, Array.from(graphemes.segment(choice.text)).length) } as CSSProperties}>{choice.text}</span>}
      </button>)}
    </div>}
    {(feedback || preview) && <div className="contextual-feedback" role="status">
      {feedback && <p className="contextual-result">{feedback.correct ? 'Correct' : 'Keep going'}</p>}
      <p>Correct answer: <span lang="ja">{correct.text}</span> · {correct.label}</p>
      <p>{authored.question.explanation}</p>
      {!preview && <button type="button" className="primary" disabled={disabled} onClick={onContinue}>Continue</button>}
    </div>}
  </section>;
}
