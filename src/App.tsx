import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { practicePool } from './core/practice';
import type { AudioAsset, PracticeAttempt, WordItem } from './types';
import { createQuestions, type Question } from './core/session';
import { deriveSchedules, snapshotDue, schedulerVersion } from './core/scheduler';
import { DEFAULT_DENSITY_RANGE, DENSITY_LEVELS, densityLevel, forecastDensity, planLessonChunk, type DensityRange } from './core/density';
import { selectRecording } from './core/audio';
import { ProgressStore } from './progress/store';
import { quizFeedbackColors, themeColors } from './themes';
import './styles.css';

const asset = (path: string) => import.meta.env.BASE_URL + path;
const store = new ProgressStore();
const fireworkOffsets = Array.from({ length: 16 }, (_, i) => {
  const angle = i * Math.PI / 8 - Math.PI / 2;
  const radius = i % 2 === 0 ? 155 : 130;
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
});

function Speaker({ small = false }: { small?: boolean }) {
  return <svg width={small ? 22 : 32} height={small ? 22 : 32} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 12h5l7-6v20l-7-6H6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M23 10c4 3 4 9 0 12M26 6c7 5 7 15 0 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function Picture({ item }: { item: WordItem }) {
  return <img src={asset(item.image.src)} alt={item.image.alt} draggable={false}/>;
}

function QuizProgress({ total, completed }: { total: number; completed: number }) {
  return <div className="round-progress" role="progressbar" aria-label="Session progress" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={total} aria-valuetext={`${completed} of ${total} sounds completed`}>
    <div className="progress-beads" aria-hidden="true">{total > 12 ? <span className="progress-track"><span style={{ width: `${completed / total * 100}%` }}/></span> : Array.from({ length: total }, (_, i) => <span key={i} className={'progress-bead' + (i < completed ? ' is-complete' : i === completed ? ' is-current' : '')}/>)}</div>
    <span className="round-count" aria-hidden="true">{completed} / {total}</span>
  </div>;
}

function QuizCompanion({ listening, response }: { listening: boolean; response: boolean | null }) {
  const mood = response === true ? 'is-cheering' : response === false ? 'is-encouraging' : listening ? 'is-listening' : '';
  return <div className={'quiz-companion ' + mood} aria-hidden="true"><img src={asset('brand/kikimashta-cat-v1.png')} alt="" draggable={false}/><span className="companion-sparks">{Array.from({ length: 6 }, (_, i) => <span className="companion-spark" key={i}>✦</span>)}</span></div>;
}

const wallClock = () => Date.now();
const correctAnswerPauseMs = 1200;
const preferenceKey = 'kikimashta-density-range-v1';
type LessonPlan = Awaited<ReturnType<typeof planLessonChunk>>;

function initialRange(): DensityRange {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) || 'null') as DensityRange | null;
    if (value && DENSITY_LEVELS.findIndex(level => level.id === value.min) >= 0 &&
        DENSITY_LEVELS.findIndex(level => level.id === value.min) <= DENSITY_LEVELS.findIndex(level => level.id === value.max)) return value;
  } catch { /* Unavailable preferences never prevent practice. */ }
  return { ...DEFAULT_DENSITY_RANGE };
}
function DensityIndicator({ value }: { value: number | null }) {
  const level = value === null ? null : densityLevel(value);
  const label = DENSITY_LEVELS.find(candidate => candidate.id === level)?.label;
  return <div className="density-indicator" data-density={level || undefined} role="status" aria-label="Review density"><span className="density-pip" aria-hidden="true"/><span>{label || 'Checking…'}</span><span className="density-caption">review density</span></div>;
}
interface DepartingCard { item: WordItem; slot: number; left: number; top: number; width: number; height: number }

export default function App({ now = wallClock, random = Math.random }: { now?: () => number; random?: () => number } = {}) {
  const [screen, setScreen] = useState<'home' | 'ready' | 'preview' | 'quiz' | 'summary'>('home');
  const [phase, setPhase] = useState<'review' | 'lesson'>('lesson');
  const [range, setRange] = useState<DensityRange>(initialRange);
  const [preferenceError, setPreferenceError] = useState(false);
  const [density, setDensity] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  const [lessonItems, setLessonItems] = useState<WordItem[]>([]);
  const [preview, setPreview] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<PracticeAttempt[]>([]);
  const [feedback, setFeedback] = useState<PracticeAttempt | null>(null);
  const [departures, setDepartures] = useState<DepartingCard[]>([]);
  const [saving, setSaving] = useState(false);
  const [pendingSaveCount, setPendingSaveCount] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const recording = useRef<AudioAsset | null>(null);
  const active = useRef({ id: '', startedAt: 0, answered: false, sessionId: '', replays: 0 });
  const session = useRef({ id: '', reserved: new Set<string>() });
  const history = useRef<PracticeAttempt[]>([]);
  const operation = useRef(0);
  const preparing = useRef(false);
  const playRequest = useRef(0);
  const pendingSaves = useRef(new Set<string>());
  const replayButton = useRef<HTMLButtonElement>(null);
  const choiceGrid = useRef<HTMLDivElement>(null);
  const target = screen === 'preview' ? lessonItems[preview] : questions[index]?.target;
  const theme = screen === 'preview' || (screen === 'ready' && phase === 'lesson') ? 'lesson' : screen === 'quiz' || (screen === 'ready' && phase === 'review') ? 'pictureQuiz' : 'home';
  const response = screen === 'quiz' && feedback ? feedback.correct ? 'correct' : 'incorrect' : undefined;
  const background = response ? quizFeedbackColors[response] : themeColors[theme];
  const invalidate = useCallback(() => { operation.current++; }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousBackground = root.style.getPropertyValue('--screen-background');
    const previousColor = meta?.content;
    root.style.setProperty('--screen-background', background);
    if (meta) meta.content = background;
    return () => {
      if (previousBackground) root.style.setProperty('--screen-background', previousBackground);
      else root.style.removeProperty('--screen-background');
      if (meta && previousColor !== undefined) meta.content = previousColor;
    };
  }, [background]);

  useEffect(() => {
    if (screen !== 'home') return;
    const request = ++operation.current;
    let cancelled = false;
    void (async () => {
      try {
        const attempts = await store.history(practicePool.language);
        const schedules = await deriveSchedules(attempts, practicePool.language);
        const forecast = await forecastDensity(schedules, now());
        if (cancelled || operation.current !== request) return;
        history.current = attempts;
        setTotal(attempts.length); setDensity(forecast.reviewsPerDay); setHistoryError(false);
      } catch {
        if (!cancelled && operation.current === request) { setHistoryError(true); setDensity(null); }
      } finally { if (!cancelled && operation.current === request) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [screen, refresh, now]);

  useEffect(() => {
    const element = audio.current;
    function stopPlayback() { playRequest.current++; element?.pause(); }
    function suspend() {
      if (document.visibilityState !== 'hidden') return;
      stopPlayback(); setPlaying(false); setAutoPaused(true);
    }
    document.addEventListener('visibilitychange', suspend);
    return () => { document.removeEventListener('visibilitychange', suspend); stopPlayback(); invalidate(); };
  }, [invalidate]);
  useEffect(() => { if (screen === 'quiz') replayButton.current?.focus({ preventScroll: true }); }, [screen, index]);

  const play = useCallback((replay = false) => {
    const element = audio.current;
    if (!element || !recording.current) return;
    if (replay) active.current.replays++;
    const request = ++playRequest.current;
    element.pause(); element.src = asset(recording.current.src); element.currentTime = 0;
    setAudioError(false); setAutoPaused(false); setPlaying(true);
    void element.play().catch(() => { if (request === playRequest.current) { setAudioError(true); setPlaying(false); } });
  }, []);
  const present = useCallback((item: WordItem) => {
    recording.current = selectRecording(item.audio, random);
    active.current.replays = 0;
    play();
  }, [play, random]);
  function home() {
    operation.current++; preparing.current = false;
    playRequest.current++; audio.current?.pause(); setPlaying(false); setAudioError(false);
    active.current = { id: '', startedAt: 0, answered: true, sessionId: '', replays: 0 };
    setSaving(false); setSaveError(false); setFeedback(null); setDepartures([]); setLessonPlan(null);
    setLoading(true); setHistoryError(false); setScreen('home'); setRefresh(value => value + 1);
  }
  function updateRange(value: DensityRange) {
    setRange(value);
    try { localStorage.setItem(preferenceKey, JSON.stringify(value)); setPreferenceError(false); }
    catch { setPreferenceError(true); }
  }
  const showQuestion = useCallback((next: Question, sessionId: string) => {
    active.current = { id: crypto.randomUUID(), sessionId, startedAt: now(), answered: false, replays: 0 };
    setFeedback(null); setDepartures([]); setSaveError(false); setSaving(false);
    present(next.target);
  }, [now, present]);
  function beginQuiz(block: Question[]) {
    setQuestions(block); setIndex(0); setAnswers([]); setScreen('quiz');
    showQuestion(block[0]!, session.current.id);
  }
  const prepareLessons = useCallback(async (request: number) => {
    setLoading(true); setHistoryError(false); setLessonPlan(null);
    try {
      const schedules = await deriveSchedules(history.current, practicePool.language);
      const learned = new Set(schedules.map(word => word.itemId));
      const plan = await planLessonChunk({ schedules, now: now(), range,
        candidates: practicePool.items.filter(item => !learned.has(item.id) && !session.current.reserved.has(item.id)) });
      if (operation.current !== request) return;
      setLessonPlan(plan); setDensity(plan.forecast.reviewsPerDay); setLessonItems(plan.items);
    } catch { if (operation.current === request) setHistoryError(true); }
    finally { if (operation.current === request) setLoading(false); }
  }, [now, range]);
  async function startSession() {
    if (loading || preparing.current || pendingSaves.current.size) return;
    preparing.current = true;
    const request = ++operation.current;
    const at = now();
    setLoading(true); setHistoryError(false);
    try {
      const attempts = await store.history(practicePool.language);
      const schedules = await deriveSchedules(attempts, practicePool.language);
      if (operation.current !== request) return;
      history.current = attempts; setTotal(attempts.length);
      session.current = { id: crypto.randomUUID(), reserved: new Set() };
      const due = snapshotDue(schedules, practicePool.items.map(item => item.id), at);
      const byId = new Map(practicePool.items.map(item => [item.id, item]));
      if (due.length) {
        setPhase('review'); setQuestions(createQuestions(due.map(id => byId.get(id)!), practicePool.items, random));
        setLessonItems([]); setLessonPlan(null); setLoading(false);
      } else {
        setPhase('lesson');
        await prepareLessons(request);
      }
      if (operation.current === request) setScreen('ready');
    } catch { if (operation.current === request) { setHistoryError(true); setLoading(false); } }
    finally { preparing.current = false; }
  }
  function beginLesson() {
    if (!lessonItems.length || loading || historyError) return;
    lessonItems.forEach(item => session.current.reserved.add(item.id));
    setPhase('lesson'); setPreview(0); setScreen('preview'); present(lessonItems[0]!);
  }
  function startLessonQuiz() {
    const known = new Set(history.current.map(attempt => attempt.itemId));
    const choices = practicePool.items.filter(item => known.has(item.id) || lessonItems.some(word => word.id === item.id));
    beginQuiz(createQuestions(lessonItems, choices.length >= 4 ? choices : practicePool.items, random));
  }
  async function save(attempt: PracticeAttempt) {
    if (pendingSaves.current.has(attempt.id)) return;
    pendingSaves.current.add(attempt.id); setPendingSaveCount(pendingSaves.current.size); setSaving(true); setSaveError(false);
    try {
      await store.record(attempt);
      if (!history.current.some(saved => saved.id === attempt.id)) history.current = [...history.current, attempt];
      setTotal(history.current.length);
    } catch { if (active.current.id === attempt.id) setSaveError(true); }
    finally { pendingSaves.current.delete(attempt.id); setPendingSaveCount(pendingSaves.current.size); if (active.current.id === attempt.id) setSaving(false); }
  }
  function choose(item: WordItem) {
    if (active.current.answered || audioError) return;
    active.current.answered = true;
    const question = questions[index]!;
    const answeredAt = now();
    const attempt: PracticeAttempt = {
      id: active.current.id, sessionId: active.current.sessionId,
      itemId: question.target.id, language: practicePool.language,
      choiceIds: question.choices.map(choice => choice.id), selectedId: item.id,
      correct: item.id === question.target.id, startedAt: active.current.startedAt,
      answeredAt, responseMs: Math.max(0, answeredAt - active.current.startedAt),
      context: { phase, exercise: 'audio-picture', recordingSrc: recording.current!.src, replays: active.current.replays, schedulerVersion },
    };
    setDepartures(question.choices.flatMap((choice, slot) => {
      if (choice.id === question.target.id || (!attempt.correct && choice.id === item.id)) return [];
      const bounds = choiceGrid.current?.children[slot]?.getBoundingClientRect();
      return bounds ? [{ item: choice, slot, left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }] : [];
    }));
    setFeedback(attempt); setAnswers(previous => [...previous, attempt]); void save(attempt);
  }
  const next = useCallback(() => {
    if (!active.current.answered || pendingSaves.current.has(active.current.id)) return;
    if (index + 1 === questions.length) {
      active.current.answered = false; playRequest.current++; audio.current?.pause();
      setPlaying(false); setDepartures([]); setScreen('summary');
      void prepareLessons(operation.current);
      return;
    }
    setIndex(index + 1); showQuestion(questions[index + 1]!, session.current.id);
  }, [index, questions, showQuestion, prepareLessons]);
  useEffect(() => {
    if (screen !== 'quiz' || !feedback?.correct || saving || saveError || audioError || playing || autoPaused) return;
    const answerId = feedback.id; const request = playRequest.current;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'hidden') { setAutoPaused(true); return; }
      if (active.current.id === answerId && request === playRequest.current) next();
    }, correctAnswerPauseMs);
    return () => window.clearTimeout(timer);
  }, [screen, feedback, saving, saveError, audioError, playing, autoPaused, next]);

  const correct = answers.filter(answer => answer.correct).length;
  return <div className={'app app-' + screen} data-theme={theme} data-answer={response}>
    <audio ref={audio} preload="auto" onEnded={() => setPlaying(false)} onError={() => { setAudioError(true); setPlaying(false); }}/>
    {screen === 'quiz' && feedback?.correct && <div className="quiz-starburst" key={feedback.id} aria-hidden="true"><svg viewBox="-200 -200 400 400" fill="currentColor" focusable="false">{fireworkOffsets.map((offset, i) => <g className="firework-star" key={i} style={{ '--star-x': `${offset.x}px`, '--star-y': `${offset.y}px` } as CSSProperties}><path d="M0 -7 L2.1 -2.3 L6.7 -2.2 L3.4 1.1 L4.1 6.3 L0 3.7 L-4.1 6.3 L-3.4 1.1 L-6.7 -2.2 L-2.1 -2.3 Z"/></g>)}</svg></div>}
    {screen === 'quiz' && feedback && departures.length > 0 && <div className="answer-departures" aria-hidden="true">{departures.map((card, i) => <div className="picture-choice departing-card" key={card.item.id} data-exit={feedback.correct ? 'fly' : 'fall'} data-slot={card.slot} style={{ left: card.left, top: card.top, width: card.width, height: card.height, animationDelay: `${i * 45}ms` }}><Picture item={card.item}/></div>)}</div>}
    <header>{screen !== 'home' && <button className="brand" onClick={home} aria-label="Kikimashta home"><img className="brand-mark" src={asset('brand/kikimashta-cat-v1.png')} alt="" aria-hidden="true" draggable={false}/><svg className="practice-close" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg><span className="brand-name">kikimashta</span><span className="brand-dot">.</span></button>}<span className="language"><i/> Japanese</span></header>
    <main>
      {screen === 'home' && <section className="home fade-in">
        <img className="home-mascot" src={asset('brand/kikimashta-cat-v1.png')} alt="Cat wearing purple headphones" draggable={false}/>
        <h1>kikimashta</h1><p className="home-prompt">Listen. Pick a picture.</p>
        <DensityIndicator value={density}/>
        <details className="density-settings"><summary>Practice pace</summary><div className="density-range">
          <label>Minimum<select value={range.min} onChange={event => updateRange({ ...range, min: event.target.value as DensityRange['min'] })}>{DENSITY_LEVELS.filter(level => level.threshold <= DENSITY_LEVELS.find(candidate => candidate.id === range.max)!.threshold).map(level => <option key={level.id} value={level.id}>{level.label}</option>)}</select></label>
          <label>Maximum<select value={range.max} onChange={event => updateRange({ ...range, max: event.target.value as DensityRange['max'] })}>{DENSITY_LEVELS.filter(level => level.threshold >= DENSITY_LEVELS.find(candidate => candidate.id === range.min)!.threshold).map(level => <option key={level.id} value={level.id}>{level.label}</option>)}</select></label>
        </div>{preferenceError && <p role="status">This pace applies now, but couldn't be saved on this device.</p>}</details>
        <div className="session-note"><span>Reviews, then new words</span><b>·</b><span>No timer</span></div>
        <button className="primary start" disabled={loading || historyError || pendingSaveCount > 0} onClick={() => void startSession()}>{pendingSaveCount ? 'Saving…' : loading ? 'Getting ready…' : 'Start'} <span aria-hidden="true">↗</span></button>
        {historyError && <div className="error" role="alert"><p>Your practice history couldn't load.</p><button className="text-button" onClick={() => { setLoading(true); setHistoryError(false); setRefresh(value => value + 1); }}>Retry loading</button></div>}
        <div className="history">{total ? total + (total === 1 ? ' answer' : ' answers') + ' saved on this device' : ''}</div>
      </section>}
      {screen === 'ready' && <section className="summary ready fade-in">
        <div className="finish-companion" aria-hidden="true"><img src={asset('brand/kikimashta-cat-v1.png')} alt="" draggable={false}/></div>
        <h1>{phase === 'review' ? 'Review Time!' : lessonItems.length ? 'Lesson Time!' : 'All set for now!'}</h1>
        <p className="block-note">{phase === 'review' ? `${questions.length} ${questions.length === 1 ? 'word' : 'words'} to revisit` : lessonItems.length ? `${lessonItems.length} new words, then a mini-quiz` : 'Your next words can wait.'}</p>
        <DensityIndicator value={density}/>
        {phase === 'review' ? <button className="primary" onClick={() => beginQuiz(questions)}>Begin review <span aria-hidden="true">→</span></button> : lessonItems.length > 0 && <button className="primary" disabled={loading || historyError} onClick={beginLesson}>Begin lesson <span aria-hidden="true">→</span></button>}
        {historyError && <div className="error" role="alert"><p>The next lesson couldn't load.</p><button className="text-button" onClick={() => void prepareLessons(operation.current)}>Retry lesson</button></div>}
        <button className="text-button" onClick={home}>Finish</button>
      </section>}
      {screen === 'preview' && target && <section className="practice preview fade-in">
        <div className="section-top"><span className="eyebrow">MEET THE WORDS</span><span className="counter">{preview + 1} / {lessonItems.length}</span></div>
        <h1 className="practice-title">Lesson Time!</h1>
        <div className="preview-picture"><Picture item={target}/></div>
        <div className="practice-actions">
        <button className={'listen ' + (playing ? 'playing' : '')} onClick={() => play(true)} aria-label="Replay word"><Speaker/><span>{playing ? 'Playing…' : 'Replay'}</span></button>

        {audioError && <p role="alert" className="error">The sound couldn't play. Tap replay to retry.</p>}
        <div className="preview-dots" aria-label={'Word ' + (preview + 1) + ' of ' + lessonItems.length}>{lessonItems.map((item, i) => <span key={item.id} className={i === preview ? 'active' : ''}/>)}</div>
        <button className="primary" disabled={audioError} onClick={() => { if (preview + 1 < lessonItems.length) { setPreview(preview + 1); present(lessonItems[preview + 1]!); } else startLessonQuiz(); }}>{preview + 1 === lessonItems.length ? 'Mini-quiz' : 'Next word'} <span aria-hidden="true">→</span></button>
        </div>
      </section>}
      {screen === 'quiz' && target && <section className="practice quiz fade-in">
        <h1 className="sr-only">Listen and choose</h1>
        <div className="quiz-top">
        <QuizCompanion listening={playing} response={feedback?.correct ?? null}/>
        <div className="quiz-audio"><button ref={replayButton} className={'listen quiz-listen ' + (playing ? 'playing' : '')} onClick={() => play(true)} aria-label="Replay word"><Speaker/><span className="sr-only">{playing ? 'Playing…' : 'Replay'}</span></button></div>
        </div>
        <span className="sr-only" aria-live="polite">Sound {index + 1} of {questions.length}</span>
        {audioError && <p role="alert" className="error">The sound couldn't play. Tap replay to retry.</p>}
        <div className="choices choices-enter" ref={choiceGrid} key={target.id}>{questions[index]!.choices.map((item, i) => {
          const isCorrect = feedback && item.id === target.id;
          const isWrong = feedback && item.id === feedback.selectedId && !feedback.correct;
          const isDeparting = Boolean(feedback && !isCorrect && (feedback.correct || !isWrong));
          return <div className={'choice-slot' + (isDeparting ? ' is-departing' : '')} key={item.id} aria-hidden={isDeparting || undefined} style={{ animationDelay: `${i * 40}ms` }}><button className={'picture-choice ' + (isCorrect ? 'correct ' : '') + (isWrong ? 'incorrect' : '')} aria-label={'Choose picture ' + (i + 1)} disabled={!!feedback || audioError} onContextMenu={event => event.preventDefault()} onClick={() => choose(item)}><Picture item={item}/>{isCorrect && <span className="choice-badge" aria-label="Correct picture">✓</span>}{isWrong && <span className="choice-badge wrong" aria-label="Your choice">↺</span>}</button></div>;
        })}</div>
        <div className="practice-actions">
        <div className="feedback" aria-live="polite">{feedback && <strong>{feedback.correct ? 'Got it!' : 'Try this one.'}</strong>}{feedback?.correct && saving && <span className="sr-only">Saving…</span>}</div>
        {saveError && feedback && <div className="error" role="alert"><p>This answer hasn't been saved yet.</p><button className="text-button" onClick={() => void save(feedback)}>Retry saving</button><button className="text-button" onClick={next}>Continue without saving</button></div>}
        {feedback && (!feedback.correct || saveError || audioError || autoPaused) && <button className="primary" disabled={saving || saveError} onClick={next}>{saving ? 'Saving…' : index + 1 === questions.length ? 'See results' : 'Continue'} <span aria-hidden="true">→</span></button>}
        </div>
        <QuizProgress total={questions.length} completed={answers.length}/>
      </section>}
      {screen === 'summary' && <section className="summary fade-in">
        <div className="eyebrow">{phase === 'review' ? 'REVIEW COMPLETE' : 'CHUNK COMPLETE'}</div><div className="finish-companion" aria-hidden="true"><img src={asset('brand/kikimashta-cat-v1.png')} alt="" draggable={false}/></div>
        <h1>{phase === 'review' ? 'Nice reviewing!' : 'Nice round!'}</h1>
        <div className="score"><strong>{correct}<span> / {answers.length}</span></strong><p>pictures found</p></div>
        <DensityIndicator value={density}/>
        {loading ? <p className="block-note" role="status">Getting your next words ready…</p> : lessonPlan?.items.length ? <><p className="block-note">{lessonPlan.reason === 'below-min' ? 'A few new words will keep things moving.' : 'A good place to finish. Up for more?'}</p><button className="primary" onClick={beginLesson}>{phase === 'review' ? 'Begin lesson' : 'Learn more'} <span aria-hidden="true">→</span></button></> : !historyError && <p className="block-note">All set for now. Come back for your next session.</p>}
        {historyError && <div className="error" role="alert"><p>The next lesson couldn't load.</p><button className="text-button" onClick={() => void prepareLessons(operation.current)}>Retry lesson</button></div>}
        <button className="text-button" onClick={home}>Finish</button>
      </section>}
    </main><footer>{screen === 'home' && <a href={asset('vocabulary/')}>Card library ↗</a>}<a href={asset('credits.html')}>Code &amp; credits ↗</a></footer>
  </div>;
}
