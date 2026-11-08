import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { ContextualPrompt } from '../content/contextual-types';
import type { PracticeAttempt, WordItem } from '../types';
import { answerFormat } from '../core/cards';
import { correctChoiceId, type Question } from '../core/session';
import { QuizCompanion, Speaker } from './QuizChrome';
import './ContextualQuiz.css';

export type ContextualPlayback = 'playing' | 'paused' | 'ready' | 'idle' | 'error';

export interface ContextualQuizProps {
  question: Question;
  feedback: PracticeAttempt | null;
  onChoose: (choice: WordItem) => void;
  onContinue: () => void;
  onReplay?: () => void;
  disabled?: boolean;
  preview?: boolean;
  inspection?: boolean;
  continueAfterCorrect?: boolean;
  onPlaybackChange?: (state: ContextualPlayback) => void;
}
const asset = (path: string) => import.meta.env.BASE_URL + path;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function Prompt({ title, value, english = true, reading = true, labelled = false }: { title: string; value: ContextualPrompt; english?: boolean; reading?: boolean; labelled?: boolean }) {
  return <div className="contextual-prompt"><h3 className={labelled ? undefined : 'sr-only'}>{title}</h3><p lang="ja" className="contextual-japanese">{value.text}</p>
    {reading && value.reading !== value.text && <p lang="ja" className="contextual-reading">{value.reading}</p>}
    {english && <p className="contextual-english">{value.meaning}</p>}</div>;
}

/** Shared learner interaction; persistence and scheduling belong to its caller. */
export function ContextualQuiz({ question, feedback, onChoose, onContinue, onReplay, disabled = false, preview = false, inspection = false, continueAfterCorrect = false, onPlaybackChange }: ContextualQuizProps) {
  const authored = question.contextual;
  if (!authored) throw new Error('A contextual quiz needs authored context.');
  const sentenceSrc = authored.recording?.sentenceSrc;
  const questionSrc = authored.recording?.questionSrcs[authored.question.id];
  const hasAudio = !!sentenceSrc && !!questionSrc;
  const audio = useRef<HTMLAudioElement>(null);
  const replayControl = useRef<HTMLButtonElement>(null);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const segment = useRef<'sentence' | 'question' | null>(null);
  const [playback, setPlayback] = useState<ContextualPlayback>('idle');
  const [inspectedQuestion, setInspectedQuestion] = useState<string | null>(null);
  const questionKey = `${authored.context.id}:${authored.question.id}`;
  const inspecting = inspectedQuestion === questionKey;
  const answered = useRef(false);
  const details = useRef<HTMLDialogElement>(null);
  const detailsTrigger = useRef<HTMLButtonElement>(null);
  const detailsClose = useRef<HTMLButtonElement>(null);
  const detailsTitle = useId();
  const [english, setEnglish] = useState(false);
  useEffect(() => { onPlaybackChange?.(playback); }, [playback, onPlaybackChange]);
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
    if (!inspection && !preview) replayControl.current?.focus({ preventScroll: true });
    if (details.current?.open) details.current.close();
    play();
    const suspend = () => {
      if (document.visibilityState === 'hidden') { stop(); setPlayback('paused'); }
    };
    document.addEventListener('visibilitychange', suspend);
    return () => { document.removeEventListener('visibilitychange', suspend); stop(); };
  }, [play, stop, authored.context.id, authored.question.id, inspection, preview]);
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
  const fullTranscript = revealed && (preview || inspection || inspecting);
  const result = feedback ? feedback.correct ? 'success' : 'failure' : null;
  return <section className="quiz contextual-quiz" data-exercise={question.exercise} data-question-id={authored.question.id}>
    <audio ref={audio} preload="auto" onEnded={ended} onError={() => { stop(); setPlayback('error'); }}/>
    <h2 className="sr-only">{preview ? 'Listen in context' : 'Listen and choose'}</h2>
    {hasAudio ? <>
      <div className="quiz-top">
        <QuizCompanion listening={playback === 'playing'} response={result}/>
        <div className="quiz-audio"><button ref={replayControl} className={'listen quiz-listen contextual-replay' + (playback === 'playing' ? ' playing' : '')}
          type="button" onClick={() => { onReplay?.(); play(); }} aria-label="Replay sentence and question">
          <Speaker/><span className="sr-only">{playback === 'playing' ? 'Playing…' : 'Replay'}</span>
        </button></div>
      </div>
      {playback === 'error' && <p className="error" role="alert">The sound couldn’t play. Replay the sentence and question to retry.</p>}
      {playback === 'ready' && <p role="status">Ready to listen. Tap Replay to hear the sentence and question.</p>}
      {playback === 'paused' && <p role="status">Playback paused. Replay when you’re ready.</p>}
      {authored.context.review.audio !== 'approved' && <p className="contextual-review-state">Audio awaiting listening approval.</p>}
    </> : <div className="contextual-inspection"><p role="status">Text inspection · audio not available</p>
      {!revealed && <button className="text-button" type="button" onClick={() => setInspectedQuestion(questionKey)}>Show text for inspection</button>}
    </div>}
    {authored.context.review.text !== 'approved' && <p className="contextual-review-state">Text awaiting approval.</p>}
    {!preview && <div className="quiz-cards"><div className="choices contextual-choices choices-enter" aria-label={format === 'picture' ? 'Picture answers' : 'Written answers'}>
      {question.choices.map((choice, index) => <div className="choice-slot" key={choice.id} style={{ animationDelay: `${index * 40}ms` }}><button type="button"
        className={'answer-choice contextual-choice ' + (format === 'picture' ? 'picture-choice' : 'text-choice') + (feedback ? choice.id === correctId ? ' correct' : choice.id === feedback.selectedId ? ' incorrect' : '' : '')}
        disabled={disabled || !!feedback || playback === 'error' || playback === 'ready' || (!hasAudio && !inspecting)}
        data-correct={feedback ? choice.id === correctId : undefined}
        data-selected={feedback ? choice.id === feedback.selectedId : undefined}
        aria-label={format === 'picture' ? `Choose picture ${index + 1}: ${choice.image.alt}` : `Choose writing ${choice.text}`}
        onClick={() => { if (!answered.current) { answered.current = true; stop(); setPlayback('idle'); onChoose(choice); } }}>
        {format === 'picture' ? <img src={asset(choice.image.src)} alt={choice.image.alt} draggable={false}/> :
          <span lang={choice.language} className="written-answer" data-font="noto-sans" style={{ '--writing-length': Math.max(1, Array.from(graphemes.segment(choice.text)).length) } as CSSProperties}>{choice.text}</span>}
        {feedback && choice.id === correctId && <span className="choice-badge" aria-label="Correct answer">✓</span>}
        {feedback && choice.id === feedback.selectedId && !feedback.correct && <span className="choice-badge wrong" aria-label="Your choice">↺</span>}
      </button></div>)}
    </div></div>}
    {fullTranscript && <div className="contextual-transcript"><Prompt title="Sentence" value={authored.context.sentence} labelled={inspection}/><Prompt title="Question" value={authored.question.prompt} labelled={inspection}/>
      <p className="contextual-answer">Correct answer: <span lang="ja">{correct.text}</span> · {correct.label}</p>
      {inspection && <p className="contextual-english">{authored.question.explanation}</p>}
    </div>}
    {!preview && <div className="practice-actions contextual-feedback">
      <div className="feedback contextual-result" role={feedback ? 'status' : undefined}>{feedback && <><span className="contextual-result-symbol" aria-hidden="true">{feedback.correct ? '✓' : '↺'}</span><span className="sr-only">{feedback.correct ? 'Correct' : 'Keep going'}</span></>}</div>
      {feedback && <div className="contextual-actions">
        {!feedback.correct && !inspection && <button ref={detailsTrigger} className="text-button" type="button" onClick={() => { setEnglish(false); details.current?.showModal(); detailsClose.current?.focus(); }}>Show Japanese</button>}
        {(!feedback.correct || inspection || inspecting || continueAfterCorrect) && <button type="button" className="primary" disabled={disabled} onClick={onContinue}>Continue</button>}
      </div>}
    </div>}
    {!inspection && !preview && feedback && !feedback.correct && <dialog ref={details} className="contextual-details-dialog" aria-labelledby={detailsTitle}
      onClose={() => { setEnglish(false); detailsTrigger.current?.focus(); }}>
      <div className="contextual-dialog-header"><h2 id={detailsTitle}>Japanese</h2><button ref={detailsClose} type="button" className="text-button" aria-label="Close Japanese" onClick={() => details.current?.close()}>×</button></div>
      <div className="contextual-transcript"><Prompt title="Sentence" value={authored.context.sentence} english={english} reading={false}/><Prompt title="Question" value={authored.question.prompt} english={english} reading={false}/></div>
      <button type="button" className="text-button" aria-expanded={english} onClick={() => setEnglish(value => !value)}>{english ? 'Hide English' : 'Show English'}</button>
    </dialog>}
  </section>;
}
