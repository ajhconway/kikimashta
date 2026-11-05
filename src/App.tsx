import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import rawBank from '../content/ja.json';
import type { AudioAsset, PracticeAttempt, WordBank, WordItem } from './types';
import { createSession, type Question } from './core/session';
import { selectRecording } from './core/audio';
import { ProgressStore } from './progress/store';
import { themeColors } from './themes';
import './styles.css';

const bank: WordBank = rawBank as WordBank;
const asset = (path: string) => import.meta.env.BASE_URL + path;
const store = new ProgressStore();

function Speaker({ small = false }: { small?: boolean }) {
  return <svg width={small ? 22 : 32} height={small ? 22 : 32} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 12h5l7-6v20l-7-6H6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M23 10c4 3 4 9 0 12M26 6c7 5 7 15 0 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function Picture({ item }: { item: WordItem }) {
  return <img src={asset(item.image.src)} alt={item.image.alt} draggable={false}/>;
}

function QuizProgress({ total, completed }: { total: number; completed: number }) {
  return <div className="round-progress" role="progressbar" aria-label="Session progress" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={total} aria-valuetext={`${completed} of ${total} sounds completed`}>
    <div className="progress-beads" aria-hidden="true">{Array.from({ length: total }, (_, i) => <span key={i} className={'progress-bead' + (i < completed ? ' is-complete' : i === completed ? ' is-current' : '')}/>)}</div>
    <span className="round-count" aria-hidden="true">{completed} / {total}</span>
  </div>;
}

function QuizCompanion({ listening, response }: { listening: boolean; response: boolean | null }) {
  const mood = response === true ? 'is-cheering' : response === false ? 'is-encouraging' : listening ? 'is-listening' : '';
  return <div className={'quiz-companion ' + mood} aria-hidden="true"><img src={asset('brand/kikimashta-cat-v1.png')} alt="" draggable={false}/><span className="companion-spark">✦</span></div>;
}

const wallClock = () => Date.now();

export default function App({ now = wallClock, random = Math.random }: { now?: () => number; random?: () => number } = {}) {
  const [screen, setScreen] = useState<'home' | 'preview' | 'quiz' | 'summary'>('home');
  const [preview, setPreview] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<PracticeAttempt[]>([]);
  const [feedback, setFeedback] = useState<PracticeAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [total, setTotal] = useState(0);
  const [historyError, setHistoryError] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const recording = useRef<AudioAsset | null>(null);
  const active = useRef({ id: '', startedAt: 0, answered: false, sessionId: '' });
  const playRequest = useRef(0);
  const pendingSaves = useRef(new Set<string>());
  const replayButton = useRef<HTMLButtonElement>(null);
  const target = screen === 'preview' ? bank.items[preview] : questions[index]?.target;
  const theme = screen === 'preview' ? 'lesson' : screen === 'quiz' ? 'pictureQuiz' : 'home';

  useLayoutEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousBackground = root.style.getPropertyValue('--screen-background');
    const previousColor = meta?.content;
    root.style.setProperty('--screen-background', themeColors[theme]);
    if (meta) meta.content = themeColors[theme];
    return () => {
      if (previousBackground) root.style.setProperty('--screen-background', previousBackground);
      else root.style.removeProperty('--screen-background');
      if (meta && previousColor !== undefined) meta.content = previousColor;
    };
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    store.history(bank.language).then(history => { if (mounted) setTotal(history.length); }).catch(() => { if (mounted) setHistoryError(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const element = audio.current;
    function stopPlayback() {
      playRequest.current++;
      element?.pause();
    }
    function suspend() {
      if (document.visibilityState !== 'hidden') return;
      stopPlayback();
      setPlaying(false);
      setAutoPaused(true);
    }
    document.addEventListener('visibilitychange', suspend);
    return () => {
      document.removeEventListener('visibilitychange', suspend);
      stopPlayback();
    };
  }, []);

  useEffect(() => {
    if (screen === 'quiz') replayButton.current?.focus({ preventScroll: true });
  }, [screen, index]);

  const play = useCallback(() => {
    const element = audio.current;
    if (!element || !recording.current) return;
    const request = ++playRequest.current;
    element.pause();
    element.src = asset(recording.current.src);
    element.currentTime = 0;
    setAudioError(false);
    setAutoPaused(false);
    setPlaying(true);
    void element.play().catch(() => {
      if (request === playRequest.current) { setAudioError(true); setPlaying(false); }
    });
  }, []);
  const present = useCallback((item: WordItem) => {
    recording.current = selectRecording(item.audio, random);
    play();
  }, [play, random]);
  function home() {
    playRequest.current++;
    audio.current?.pause();
    setPlaying(false);
    setAudioError(false);
    active.current = { id: '', startedAt: 0, answered: true, sessionId: '' };
    setSaving(false); setSaveError(false); setFeedback(null);
    setScreen('home');
  }
  const showQuestion = useCallback((next: Question, sessionId: string) => {
    active.current = { id: crypto.randomUUID(), sessionId, startedAt: now(), answered: false };
    setFeedback(null); setSaveError(false); setSaving(false);
    present(next.target);
  }, [now, present]);
  function startQuiz() {
    const session = createSession(bank, 6, 4, random);
    const sessionId = crypto.randomUUID();
    setQuestions(session); setIndex(0); setAnswers([]); setScreen('quiz');
    showQuestion(session[0]!, sessionId);
  }
  async function save(attempt: PracticeAttempt) {
    if (pendingSaves.current.has(attempt.id)) return;
    pendingSaves.current.add(attempt.id);
    setSaving(true); setSaveError(false);
    try {
      await store.record(attempt);
      void store.history(bank.language).then(history => setTotal(history.length)).catch(() => setHistoryError(true));
    } catch {
      if (active.current.id === attempt.id) setSaveError(true);
    } finally {
      pendingSaves.current.delete(attempt.id);
      if (active.current.id === attempt.id) setSaving(false);
    }
  }

  function choose(item: WordItem) {
    if (active.current.answered || audioError) return;
    active.current.answered = true;
    const question = questions[index]!;
    const answeredAt = now();
    const attempt: PracticeAttempt = {
      id: active.current.id, sessionId: active.current.sessionId,
      itemId: question.target.id, language: bank.language,
      choiceIds: question.choices.map(choice => choice.id), selectedId: item.id,
      correct: item.id === question.target.id, startedAt: active.current.startedAt,
      answeredAt, responseMs: Math.max(0, answeredAt - active.current.startedAt),
    };
    setFeedback(attempt); setAnswers(previous => [...previous, attempt]);
    void save(attempt);
  }
  const next = useCallback(() => {
    if (!active.current.answered || pendingSaves.current.has(active.current.id)) return;
    if (index + 1 === questions.length) {
      active.current.answered = false;
      playRequest.current++;
      audio.current?.pause(); setPlaying(false); setScreen('summary'); return;
    }
    setIndex(index + 1);
    showQuestion(questions[index + 1]!, active.current.sessionId);
  }, [index, questions, showQuestion]);

  useEffect(() => {
    if (screen !== 'quiz' || !feedback?.correct || saving || saveError || audioError || playing || autoPaused) return;
    const answerId = feedback.id;
    const request = playRequest.current;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'hidden') { setAutoPaused(true); return; }
      if (active.current.id === answerId && request === playRequest.current) next();
    }, 850);
    return () => window.clearTimeout(timer);
  }, [screen, feedback, saving, saveError, audioError, playing, autoPaused, next]);

  const correct = answers.filter(answer => answer.correct).length;
  return <div className={'app app-' + screen} data-theme={theme}>
    <audio ref={audio} preload="auto" onEnded={() => setPlaying(false)} onError={() => { setAudioError(true); setPlaying(false); }}/>
    <header>{screen !== 'home' && <button className="brand" onClick={home} aria-label="Kikimashta home"><img className="brand-mark" src={asset('brand/kikimashta-cat-v1.png')} alt="" aria-hidden="true" draggable={false}/><svg className="practice-close" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg><span className="brand-name">kikimashta</span><span className="brand-dot">.</span></button>}<span className="language"><i/> Japanese</span></header>
    <main>
      {screen === 'home' && <section className="home fade-in">
        <img className="home-mascot" src={asset('brand/kikimashta-cat-v1.png')} alt="Cat wearing purple headphones" draggable={false}/>
        <h1>kikimashta</h1>
        <p className="home-prompt">Listen. Pick a picture.</p>
        <div className="session-note"><span>6 words</span><b>·</b><span>No timer</span></div>
        <button className="primary start" onClick={() => { setPreview(0); setScreen('preview'); present(bank.items[0]!); }}>Start <span aria-hidden="true">↗</span></button>
        <button className="text-button" onClick={startQuiz}>Skip to quiz <span aria-hidden="true">→</span></button>
        <div className="history">{historyError ? 'Progress storage is unavailable. Saving may need a retry.' : total ? total + (total === 1 ? ' answer' : ' answers') + ' saved on this device' : ''}</div>
      </section>}
      {screen === 'preview' && target && <section className="practice preview fade-in">
        <div className="section-top"><span className="eyebrow">MEET THE WORDS</span><span className="counter">{preview + 1} / {bank.items.length}</span></div>
        <h1 className="practice-title">Lesson Time!</h1>
        <div className="preview-picture"><Picture item={target}/></div>
        <div className="practice-actions">
        <button className={'listen ' + (playing ? 'playing' : '')} onClick={play} aria-label="Replay word"><Speaker/><span>{playing ? 'Playing…' : 'Replay'}</span></button>

        {audioError && <p role="alert" className="error">The sound couldn't play. Tap replay to retry.</p>}
        <div className="preview-dots" aria-label={'Word ' + (preview + 1) + ' of ' + bank.items.length}>{bank.items.map((item, i) => <span key={item.id} className={i === preview ? 'active' : ''}/>)}</div>
        <button className="primary" disabled={audioError} onClick={() => { if (preview + 1 < bank.items.length) { setPreview(preview + 1); present(bank.items[preview + 1]!); } else startQuiz(); }}>{preview + 1 === bank.items.length ? 'Play a round' : 'Next word'} <span aria-hidden="true">→</span></button>
        </div>
      </section>}
      {screen === 'quiz' && target && <section className="practice quiz fade-in">
        <h1 className="sr-only">Listen and choose</h1>
        <div className="quiz-top">
        <QuizCompanion listening={playing} response={feedback?.correct ?? null}/>
        <div className="quiz-audio"><button ref={replayButton} className={'listen quiz-listen ' + (playing ? 'playing' : '')} onClick={play} aria-label="Replay word"><Speaker/><span className="sr-only">{playing ? 'Playing…' : 'Replay'}</span></button></div>
        </div>
        <span className="sr-only" aria-live="polite">Sound {index + 1} of {questions.length}</span>
        {audioError && <p role="alert" className="error">The sound couldn't play. Tap replay to retry.</p>}
        <div className="choices choices-enter" key={target.id}>{questions[index]!.choices.map((item, i) => {
          const isCorrect = feedback && item.id === target.id;
          const isWrong = feedback && item.id === feedback.selectedId && !feedback.correct;
          return <button key={item.id} className={'picture-choice ' + (isCorrect ? 'correct ' : '') + (isWrong ? 'incorrect' : '')} aria-label={'Choose picture ' + (i + 1)} disabled={!!feedback || audioError} onClick={() => choose(item)}><Picture item={item}/>{isCorrect && <span className="choice-badge" aria-label="Correct picture">✓</span>}{isWrong && <span className="choice-badge wrong" aria-label="Your choice">↺</span>}</button>;
        })}</div>
        <div className="practice-actions">
        <div className="feedback" aria-live="polite">{feedback && <><strong>{feedback.correct ? 'Got it!' : 'Try this one.'}</strong>{!feedback.correct ? <p>Listen again to match the picture.</p> : !saveError && !audioError && !autoPaused && <p className="next-cue">{saving ? 'Saving…' : index + 1 === questions.length ? 'Finishing up…' : 'Next sound…'}</p>}</>}</div>
        {saveError && feedback && <div className="error" role="alert"><p>This answer hasn't been saved yet.</p><button className="text-button" onClick={() => void save(feedback)}>Retry saving</button><button className="text-button" onClick={next}>Continue without saving</button></div>}
        {feedback && (!feedback.correct || saveError || audioError || autoPaused) && <button className="primary" disabled={saving || saveError} onClick={next}>{saving ? 'Saving…' : index + 1 === questions.length ? 'See results' : 'Continue'} <span aria-hidden="true">→</span></button>}
        </div>
        <QuizProgress total={questions.length} completed={answers.length}/>
      </section>}
      {screen === 'summary' && <section className="summary fade-in">
        <div className="eyebrow">ROUND COMPLETE</div><div className="finish-companion" aria-hidden="true"><img src={asset('brand/kikimashta-cat-v1.png')} alt="" draggable={false}/></div>
        <h1>Nice round!</h1>
        <div className="score"><strong>{correct}<span> / {answers.length}</span></strong><p>pictures found</p></div>
        <div className="summary-pictures">{questions.map(question => <div key={question.target.id}><Picture item={question.target}/><span aria-label={answers.find(answer => answer.itemId === question.target.id)?.correct ? 'Correct' : 'To revisit'}>{answers.find(answer => answer.itemId === question.target.id)?.correct ? '✓' : '↺'}</span></div>)}</div>

        <button className="primary" onClick={startQuiz}>Play again <span aria-hidden="true">↗</span></button><button className="text-button" onClick={home}>Back home</button>
      </section>}
    </main><footer>{screen === 'home' && <a href={asset('vocabulary/')}>Card library ↗</a>}<a href={asset('credits.html')}>Code &amp; credits ↗</a></footer>
  </div>;
}
