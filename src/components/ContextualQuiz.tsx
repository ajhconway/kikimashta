import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { ContextualPrompt } from '../content/contextual-types';
import type { PracticeAttempt, WordItem } from '../types';
import { answerFormat } from '../core/cards';
import { correctChoiceId, type Question } from '../core/session';
import { useAudioChoiceEntrance } from '../hooks/useAudioChoiceEntrance';
import { QuizCompanion, Speaker } from './QuizChrome';
import './ContextualQuiz.css';

export type ContextualPlayback = 'playing' | 'paused' | 'ready' | 'idle' | 'error';

export interface ContextualQuizProps {
  question: Question;
  feedback: PracticeAttempt | null;
  feedbackContent?: ReactNode;
  onChoose: (choice: WordItem) => void;
  onContinue: () => void;
  onReplay?: () => void;
  disabled?: boolean;
  continueAfterCorrect?: boolean;
  delayChoices?: boolean;
  choicesRef?: RefObject<HTMLDivElement | null>;
  onAudioFinished?: () => void;
  onPlaybackChange?: (state: ContextualPlayback) => void;
}
const asset = (path: string) => import.meta.env.BASE_URL + path;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function Prompt({ title, value, english = true, language = 'ja', labelled = false }: { title: string; value: ContextualPrompt; english?: boolean; language?: string; labelled?: boolean }) {
  return <div className="contextual-prompt"><h3 className={labelled ? undefined : 'sr-only'}>{title}</h3><p lang={language} className="contextual-japanese">{value.text}</p>
    <p className="contextual-english" aria-hidden={!english || undefined}>{value.meaning}</p></div>;
}

/** Shared learner interaction; persistence and scheduling belong to its caller. */
export function ContextualQuiz({ question, feedback, onChoose, onContinue, onReplay, disabled = false, continueAfterCorrect = false, onPlaybackChange, feedbackContent, choicesRef, onAudioFinished, delayChoices = false }: ContextualQuizProps) {
  const authored = question.contextual;
  if (!authored) throw new Error('A contextual quiz needs authored context.');
  const language = question.target.language;
  const languageName = language === 'es-419' ? 'Spanish' : 'Japanese';
  const needsIntroduction = !!question.introduction && !!authored.context.introduction && !question.retryOf;
  const [introduced, setIntroduced] = useState(false);
  const introducing = needsIntroduction && !introduced;
  const sentenceSrc = authored.recording?.sentenceSrc;
  const questionSrc = authored.recording?.questionSrcs[authored.question.id];
  const hasAudio = !!sentenceSrc && !!questionSrc;
  const audio = useRef<HTMLAudioElement>(null);
  const replayControl = useRef<HTMLButtonElement>(null);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const segment = useRef<'sentence' | 'question' | null>(null);
  // Keep final-clip identity through ended, even when React clears segment first.
  const finalAudio = useRef(false);
  const [playback, setPlayback] = useState<ContextualPlayback>('idle');
  const questionKey = `${authored.context.id}:${authored.question.id}`;
  const localChoices = useRef<HTMLDivElement>(null);
  const grid = choicesRef ?? localChoices;
  const isFinalAudio = useCallback(() => finalAudio.current, []);
  const delayed = delayChoices && hasAudio;
  const choicesReady = useAudioChoiceEntrance({ id: questionKey, enabled: delayed, audio, grid, canReveal: isFinalAudio });
  const answered = useRef(false);
  const details = useRef<HTMLDialogElement>(null);
  const detailsTrigger = useRef<HTMLButtonElement>(null);
  const detailsClose = useRef<HTMLButtonElement>(null);
  const detailsTitle = useId();
  const [english, setEnglish] = useState(false);
  useEffect(() => { onPlaybackChange?.(hasAudio ? playback : 'error'); }, [hasAudio, playback, onPlaybackChange]);
  const stop = useCallback(() => {
    request.current++;
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    segment.current = null;
    finalAudio.current = false;
    audio.current?.pause();
  }, []);
  const playSegment = useCallback((src: string, kind: 'sentence' | 'question', token: number) => {
    const element = audio.current;
    if (!element || request.current !== token) return;
    segment.current = kind;
    finalAudio.current = kind === 'question';
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
    replayControl.current?.focus({ preventScroll: true });
    if (details.current?.open) details.current.close();
    if (!introducing) play();
    const suspend = () => {
      if (document.visibilityState === 'hidden') { stop(); setPlayback('paused'); }
    };
    document.addEventListener('visibilitychange', suspend);
    return () => { document.removeEventListener('visibilitychange', suspend); stop(); };
  }, [play, stop, authored.context.id, authored.question.id, introducing]);
  function ended() {
    const token = request.current;
    if (segment.current === 'sentence' && questionSrc) {
      segment.current = null;
      timer.current = setTimeout(() => { timer.current = undefined; playSegment(questionSrc, 'question', token); }, 650);
    } else if (segment.current === 'question') { segment.current = null; setPlayback('idle'); onAudioFinished?.(); }
  }
  const correctId = correctChoiceId(question);
  const format = answerFormat(question.exercise);
  const result = feedback ? feedback.outcome ?? (feedback.correct ? 'success' : 'failure') : null;
  if (introducing) return <section className="quiz contextual-quiz foundation-introduction" aria-label="New Spanish word">
    <h2 lang={language}>{authored.context.introduction!.text}</h2><p>{authored.context.introduction!.meaning}</p>
    <Prompt language={language} title="Example" value={authored.context.sentence} labelled/>
    <button type="button" className="primary" onClick={() => setIntroduced(true)}>Listen and answer</button>
  </section>;
  return <section className="quiz contextual-quiz" data-exercise={question.exercise} data-question-id={authored.question.id}>
    <audio ref={audio} preload="auto" onEnded={ended} onError={() => { stop(); setPlayback('error'); }}/>
    <h2 className="sr-only">Listen and choose</h2>
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
    </> : <p className="error" role="alert">The sentence and question recordings are unavailable. Return Home and try another review.</p>}
    <div className="quiz-cards"><div ref={grid} className={'choices contextual-choices ' + (delayed ? 'choices-audio-first' : 'choices-enter')} aria-label={format === 'picture' ? 'Picture answers' : 'Written answers'}>
      {question.choices.map((choice, index) => <div className="choice-slot" key={choice.id} style={{ animationDelay: `${index * 40}ms` }}><button type="button"
        className={'answer-choice contextual-choice ' + (format === 'picture' ? 'picture-choice' : 'text-choice') + (feedback ? choice.id === correctId ? feedback.outcome === 'partial' ? ' partial' : ' correct' : choice.id === feedback.selectedId ? ' incorrect' : '' : '')}
        disabled={disabled || !choicesReady || !!feedback || playback === 'error' || playback === 'ready' || !hasAudio}
        data-correct={feedback ? choice.id === correctId : undefined}
        data-selected={feedback ? choice.id === feedback.selectedId : undefined}
        aria-label={format === 'picture' ? `Choose picture ${index + 1}: ${choice.image.alt}` : `Choose writing ${choice.text}`}
        onClick={() => { if (!answered.current) { answered.current = true; stop(); setPlayback('idle'); onChoose(choice); } }}>
        {format === 'picture' ? <img src={asset(choice.image.src)} alt={choice.image.alt} draggable={false}/> :
          <span lang={choice.language} className="written-answer" data-font="noto-sans" style={{ '--writing-length': Math.max(1, Array.from(graphemes.segment(choice.text)).length) } as CSSProperties}>{choice.text}</span>}
        {feedback && choice.id === correctId && <span className="choice-badge" aria-label={feedback.outcome === 'partial' ? 'Partial success' : 'Correct answer'}>{feedback.outcome === 'partial' ? '≈' : '✓'}</span>}
        {feedback && choice.id === feedback.selectedId && !feedback.correct && <span className="choice-badge wrong" aria-label="Your choice">↺</span>}
      </button></div>)}
    </div></div>
    <div className="practice-actions contextual-feedback">
      <div className={'contextual-response-row' + (feedback && !feedback.correct ? ' has-contextual-details' : '')}>
        <div className="contextual-status">{feedbackContent ?? <div className="feedback contextual-result" role={feedback ? 'status' : undefined}>{feedback && <><span className="contextual-result-symbol" aria-hidden="true">{feedback.correct ? '✓' : '↺'}</span><span className="sr-only">{feedback.correct ? 'Correct' : 'Keep going'}</span></>}</div>}</div>
        <div className="contextual-detail-action">{feedback && !feedback.correct && <button ref={detailsTrigger} className="text-button contextual-details-toggle" type="button" aria-label={`Show ${languageName}`} title={`Show ${languageName}`}
          onClick={() => { setEnglish(false); details.current?.showModal(); detailsClose.current?.focus(); }}><span lang={language} aria-hidden="true">{language === 'es-419' ? 'ES' : '文'}</span></button>}</div>
      </div>
      {feedback && (!feedback.correct || continueAfterCorrect) && <div className="contextual-actions">
        <button type="button" className="primary" disabled={disabled} onClick={onContinue}>Continue <span aria-hidden="true">→</span></button>
      </div>}
    </div>
    {feedback && !feedback.correct && <dialog ref={details} className="contextual-details-dialog" aria-labelledby={detailsTitle}
      onClose={() => { setEnglish(false); detailsTrigger.current?.focus(); }}>
      <div className="contextual-dialog-header"><h2 id={detailsTitle}>{languageName}</h2><button ref={detailsClose} type="button" className="contextual-dialog-close" aria-label={`Close ${languageName}`} onClick={() => details.current?.close()}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg></button></div>
      <div className="contextual-transcript"><Prompt language={language} title="Sentence" value={authored.context.sentence} english={english}/><Prompt language={language} title="Question" value={authored.question.prompt} english={english}/></div>
      <button type="button" className="text-button" aria-expanded={english} onClick={() => setEnglish(value => !value)}>{english ? 'Hide English' : 'Show English'}</button>
    </dialog>}
  </section>;
}
