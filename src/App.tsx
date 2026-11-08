import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { practicePool } from './core/practice';
import { cardPacks, initialPackIds, packPreferenceKey, selectedPracticeCards } from './core/packs';
import type { AnswerOutcome, AudioAsset, Exercise, PracticeAttempt, PracticeCard, WordItem } from './types';
import { attemptExercise, cardKey } from './core/cards';
import { createQuestions, requeueMissedQuestion, shuffled, type Question } from './core/session';
import { deriveSchedules, snapshotDue, schedulerVersion, type ScheduledWord } from './core/scheduler';
import { answerOutcome, devReviewTimeLimit, quizTimeLimit } from './core/quiz-timer';
import { useQuizCountdown } from './hooks/useQuizCountdown';
import { QuizTimerFill } from './components/QuizTimerFill';
import { DEFAULT_DENSITY_RANGE, DENSITY_LEVELS, densityLevel, forecastDensity, planLessonChunk, type DensityRange } from './core/density';
import { selectRecording } from './core/audio';
import { ProgressStore } from './progress/store';
import { intensityColors, quizFeedbackColors, themeColors } from './themes';
import { DensityIndicator, HomeIntensity } from './components/PaceControl';
import './styles.css';
import './writing-fonts.css';
import { availableWritingFont, createWritingFontRotation, preloadWritingFonts, type WritingFont } from './core/writing-fonts';

const asset = (path: string) => import.meta.env.BASE_URL + path;
const defaultStore = new ProgressStore();
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

const writingCharacters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function CardFace({ item, exercise, font }: PracticeCard & { font: WritingFont }) {
  if (exercise === 'audio-picture') return <Picture item={item}/>;
  // A combining mark or variation selector belongs to its displayed character.
  const length = Math.max(1, Array.from(writingCharacters.segment(item.text)).length);
  return <span className="written-answer" data-font={font} style={{ '--writing-length': length } as CSSProperties} lang={item.language}>{item.text}</span>;
}
const choiceClass = (exercise: Exercise) => 'answer-choice ' + (exercise === 'audio-picture' ? 'picture-choice' : 'text-choice');

function QuizProgress({ total, completed, mistakes }: { total: number; completed: number; mistakes: number }) {
  return <div className="quiz-progress"><div className="round-progress" role="progressbar" aria-label="Session progress" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={total} aria-valuetext={`${completed} of ${total} sounds completed`}>
    <div className="progress-beads" aria-hidden="true">{total > 12 ? <span className="progress-track"><span style={{ width: `${completed / total * 100}%` }}/></span> : Array.from({ length: total }, (_, i) => <span key={i} className={'progress-bead' + (i < completed ? ' is-complete' : i === completed ? ' is-current' : '')}/>)}</div>
    <span className="round-count" aria-hidden="true" style={{ minWidth: `${String(total).length * 2 + 3}ch` }}>{completed} / {total}</span>
  </div><div className="quiz-mistakes" role="status" aria-label="Mistakes"><span className="sr-only">{mistakes} incorrect answer{mistakes === 1 ? '' : 's'}</span><span className="mistake-icons" aria-hidden="true">{Array.from({ length: Math.min(mistakes, 5) }, (_, i) => <span className="mistake-icon" key={i}><svg viewBox="0 0 16 16" fill="none" focusable="false"><path d="m5 5 6 6M11 5l-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></span>)}{mistakes > 5 && <span className="mistake-overflow">+{mistakes - 5}</span>}</span></div></div>;
}

function QuizCompanion({ listening, response }: { listening: boolean; response: AnswerOutcome | null }) {
  const mood = response === 'partial' ? 'is-partial' : response === 'success' ? 'is-cheering' : response === 'failure' ? 'is-encouraging' : listening ? 'is-listening' : '';
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
interface DepartingCard extends PracticeCard { font: WritingFont; slot: number; left: number; top: number; width: number; height: number; flyX: number; flyY: number }

export default function App({ now = wallClock, random = Math.random, progressStore = defaultStore, historyRevision = 0, accountControls, accountLoading = false, onSaved }: {
  now?: () => number; random?: () => number; progressStore?: ProgressStore; historyRevision?: number;
  accountControls?: ReactNode; accountLoading?: boolean; onSaved?: () => void;
} = {}) {
  const store = progressStore;
  const [packIds, setPackIds] = useState(initialPackIds);
  const selectedCards = useMemo(() => selectedPracticeCards(practicePool.items, packIds), [packIds]);
  const selectedKeys = useMemo(() => new Set(selectedCards.map(cardKey)), [selectedCards]);
  const choicesFor = useCallback((exercise: Exercise) => selectedCards.filter(card => card.exercise === exercise).map(card => card.item), [selectedCards]);
  function togglePack(id: string) {
    const next = packIds.includes(id) ? packIds.filter(value => value !== id) : [...packIds, id];
    setLoading(true); setPackIds(next);
    try { localStorage.setItem(packPreferenceKey, JSON.stringify(next)); } catch { /* Practice still works without preference storage. */ }
  }
  const [fontRotation] = useState(() => createWritingFontRotation());
  const [writingFont, setWritingFont] = useState<WritingFont>('system');
  useEffect(() => { preloadWritingFonts(); }, []);
  const [screen, setScreen] = useState<'home' | 'ready' | 'preview' | 'quiz' | 'summary'>('home');
  const [phase, setPhase] = useState<'review' | 'lesson'>('lesson');
  const [isDevReview, setIsDevReview] = useState(false);
  const [range] = useState<DensityRange>(initialRange);
  const [density, setDensity] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  const [lessonItems, setLessonItems] = useState<PracticeCard[]>([]);
  const [preview, setPreview] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizSize, setQuizSize] = useState(0);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<PracticeAttempt[]>([]);
  const [feedback, setFeedback] = useState<PracticeAttempt | null>(null);
  const [departures, setDepartures] = useState<DepartingCard[]>([]);
  const [saving, setSaving] = useState(false);
  const [pendingSaveCount, setPendingSaveCount] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioFinished, setAudioFinished] = useState(false);
  const [questionTimer, setQuestionTimer] = useState<{ id: string; limitMs: number | null }>({ id: '', limitMs: null });
  const [autoPaused, setAutoPaused] = useState(false);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const recording = useRef<AudioAsset | null>(null);
  const active = useRef({ id: '', startedAt: 0, answered: false, sessionId: '', replays: 0 });
  const session = useRef({ id: '', reserved: new Set<string>() });
  const history = useRef<PracticeAttempt[]>([]);
  const mastery = useRef(new Map<string, ScheduledWord>());
  const operation = useRef(0);
  const preparing = useRef(false);
  const playRequest = useRef(0);
  const pendingSaves = useRef(new Set<string>());
  const replayButton = useRef<HTMLButtonElement>(null);
  const choiceGrid = useRef<HTMLDivElement>(null);
  const countdown = useQuizCountdown({ id: screen === 'quiz' ? questionTimer.id : '', limitMs: questionTimer.limitMs,
    audioFinished, answered: !!feedback, grid: choiceGrid, now });
  const target = screen === 'preview' ? lessonItems[preview]?.item : questions[index]?.target;
  const exercise = screen === 'preview' ? lessonItems[preview]?.exercise : questions[index]?.exercise;
  const theme = screen === 'preview' || (screen === 'ready' && phase === 'lesson') ? 'lesson' : screen === 'quiz' || (screen === 'ready' && phase === 'review') ? 'pictureQuiz' : 'home';
  const response = screen === 'quiz' && feedback ? feedback.outcome === 'partial' ? 'partial' : feedback.correct ? 'correct' : 'incorrect' : undefined;
  const background = response ? quizFeedbackColors[response] : screen === 'home' && density !== null ? intensityColors[densityLevel(density)] : themeColors[theme];
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
    if (screen !== 'home' || preparing.current) return;
    const request = ++operation.current;
    let cancelled = false;
    void (async () => {
      try {
        const attempts = await store.history(practicePool.language);
        const schedules = (await deriveSchedules(attempts, practicePool.language)).filter(card => selectedKeys.has(cardKey(card)));
        const forecast = await forecastDensity(schedules, now());
        if (cancelled || operation.current !== request) return;
        history.current = attempts;
        mastery.current = new Map(schedules.map(word => [cardKey(word), word]));
        setTotal(attempts.length); setDensity(forecast.reviewsPerDay); setHistoryError(false);
      } catch {
        if (!cancelled && operation.current === request) { setHistoryError(true); setDensity(null); }
      } finally { if (!cancelled && operation.current === request) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [screen, refresh, now, store, historyRevision, selectedKeys]);

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
  const present = useCallback((item: WordItem, exercise: Exercise = 'audio-picture', presentationPhase: 'lesson' | 'review' = 'lesson', texts: readonly string[] = [item.text]) => {
    if (exercise === 'audio-text') setWritingFont(availableWritingFont(fontRotation(item, random, presentationPhase), texts));
    recording.current = selectRecording(item.audio, random);
    active.current.replays = 0;
    play();
  }, [play, random, fontRotation]);
  function home() {
    operation.current++; preparing.current = false;
    playRequest.current++; audio.current?.pause(); setPlaying(false); setAudioError(false);
    active.current = { id: '', startedAt: 0, answered: true, sessionId: '', replays: 0 };
    setSaving(false); setSaveError(false); setFeedback(null); setDepartures([]); setLessonPlan(null);
    setIsDevReview(false);
    setLoading(true); setHistoryError(false); setScreen('home'); setRefresh(value => value + 1);
  }
  const showQuestion = useCallback((next: Question, sessionId: string, questionPhase: 'lesson' | 'review', devReview = false) => {
    active.current = { id: crypto.randomUUID(), sessionId, startedAt: now(), answered: false, replays: 0 };
    setQuestionTimer({ id: active.current.id, limitMs: devReview ? devReviewTimeLimit(random) : questionPhase === 'review' && !next.retryOf
      ? quizTimeLimit(mastery.current.get(cardKey({ item: next.target, exercise: next.exercise }))) : null });
    setAudioFinished(false);
    setFeedback(null); setDepartures([]); setSaveError(false); setSaving(false);
    present(next.target, next.exercise, questionPhase, next.choices.map(choice => choice.text));
  }, [now, present, random]);
  function beginQuiz(block: Question[], blockPhase = phase, devReview = isDevReview) {
    setQuestions(block); setQuizSize(block.length); setIndex(0); setAnswers([]); setScreen('quiz');
    showQuestion(block[0]!, session.current.id, blockPhase, devReview);
  }
  function startDevReview() {
    if (loading || accountLoading || preparing.current || pendingSaves.current.size || !selectedCards.length) return;
    operation.current++;
    session.current = { id: crypto.randomUUID(), reserved: new Set() };
    setIsDevReview(true); setPhase('review'); setLessonItems([]); setLessonPlan(null); setHistoryError(false);
    beginQuiz(shuffled(selectedCards, random).slice(0, 6).flatMap(card => createQuestions([card], choicesFor(card.exercise), random)), 'review', true);
  }
  const prepareLessons = useCallback(async (request: number) => {
    setLoading(true); setHistoryError(false); setLessonPlan(null);
    try {
      const attempts = await store.history(practicePool.language);
      if (operation.current !== request) return;
      history.current = attempts;
      const schedules = (await deriveSchedules(attempts, practicePool.language)).filter(card => selectedKeys.has(cardKey(card)));
      const learned = new Set(schedules.map(cardKey));
      const plan = await planLessonChunk({ schedules, now: now(), range,
        candidates: selectedCards.filter(card => !learned.has(cardKey(card)) && !session.current.reserved.has(cardKey(card))) });
      if (operation.current !== request) return;
      setLessonPlan(plan); setDensity(plan.forecast.reviewsPerDay); setLessonItems(shuffled(plan.items, random));
    } catch { if (operation.current === request) setHistoryError(true); }
    finally { if (operation.current === request) setLoading(false); }
  }, [now, range, store, random, selectedCards, selectedKeys]);
  async function startSession() {
    if (loading || accountLoading || preparing.current || pendingSaves.current.size || !selectedCards.length) return;
    setIsDevReview(false);
    preparing.current = true;
    const request = ++operation.current;
    const at = now();
    setLoading(true); setHistoryError(false);
    try {
      const attempts = await store.history(practicePool.language);
      const schedules = (await deriveSchedules(attempts, practicePool.language)).filter(card => selectedKeys.has(cardKey(card)));
      if (operation.current !== request) return;
      history.current = attempts; setTotal(attempts.length);
      mastery.current = new Map(schedules.map(word => [cardKey(word), word]));
      session.current = { id: crypto.randomUUID(), reserved: new Set() };
      const due = snapshotDue(schedules, selectedCards.map(card => card.item.id), at);
      const byId = new Map(practicePool.items.map(item => [item.id, item]));
      if (due.length) {
        setPhase('review'); setQuestions(shuffled(due, random).flatMap(card => createQuestions([{ item: byId.get(card.itemId)!, exercise: card.exercise }], choicesFor(card.exercise), random)));
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
    lessonItems.forEach(card => session.current.reserved.add(cardKey(card)));
    setPhase('lesson'); setPreview(0); setScreen('preview'); present(lessonItems[0]!.item, lessonItems[0]!.exercise);
  }
  function startLessonQuiz() {
    const known = new Set(history.current.map(attempt => cardKey({ ...attempt, exercise: attemptExercise(attempt) })));
    const block = shuffled(lessonItems, random).flatMap(card => {
      const choices = choicesFor(card.exercise).filter(item => known.has(cardKey({ item, exercise: card.exercise })) ||
        lessonItems.some(lesson => lesson.exercise === card.exercise && lesson.item.id === item.id));
      return createQuestions([card], choices.length >= 4 ? choices : choicesFor(card.exercise), random);
    });
    beginQuiz(block);
  }
  async function save(attempt: PracticeAttempt) {
    if (isDevReview) return;
    if (pendingSaves.current.has(attempt.id)) return;
    pendingSaves.current.add(attempt.id); setPendingSaveCount(pendingSaves.current.size); setSaving(true); setSaveError(false);
    try {
      await store.record(attempt);
      onSaved?.();
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
    const correct = item.id === question.target.id;
    const attempt: PracticeAttempt = {
      id: active.current.id, sessionId: active.current.sessionId,
      itemId: question.target.id, language: practicePool.language,
      choiceIds: question.choices.map(choice => choice.id), selectedId: item.id,
      correct, outcome: answerOutcome(correct, countdown.timer, answeredAt),
      ...(countdown.timer ? { timer: countdown.timer } : {}), startedAt: active.current.startedAt,
      answeredAt, responseMs: Math.max(0, answeredAt - active.current.startedAt),
      context: { phase, exercise: question.exercise, recordingSrc: recording.current!.src, replays: active.current.replays, schedulerVersion,
        ...(question.retryOf ? { retryOf: question.retryOf } : {}) },
    };
    const gridBounds = choiceGrid.current?.getBoundingClientRect();
    setDepartures(question.choices.flatMap((choice, slot) => {
      if (choice.id === question.target.id || (!attempt.correct && choice.id === item.id)) return [];
      const bounds = choiceGrid.current?.children[slot]?.getBoundingClientRect();
      if (!bounds || !gridBounds) return [];
      const dx = bounds.left + bounds.width / 2 - (gridBounds.left + gridBounds.width / 2);
      const dy = bounds.top + bounds.height / 2 - (gridBounds.top + gridBounds.height / 2);
      const reach = Math.hypot(window.innerWidth, window.innerHeight) + Math.hypot(bounds.width, bounds.height);
      const scale = reach / (Math.hypot(dx, dy) || 1);
      return [{ item: choice, exercise: question.exercise, font: writingFont, slot, left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, flyX: dx * scale, flyY: dy * scale }];
    }));
    if (!attempt.correct) setQuestions(requeueMissedQuestion(questions, index, attempt.id, random));
    setFeedback(attempt); setAnswers(previous => [...previous, attempt]); void save(attempt);
  }
  const next = useCallback(() => {
    if (!active.current.answered || pendingSaves.current.has(active.current.id)) return;
    if (index + 1 === questions.length) {
      active.current.answered = false; playRequest.current++; audio.current?.pause();
      setPlaying(false); setDepartures([]); setScreen('summary');
      if (!isDevReview) void prepareLessons(operation.current);
      return;
    }
    setIndex(index + 1); showQuestion(questions[index + 1]!, session.current.id, phase, isDevReview);
  }, [index, questions, showQuestion, prepareLessons, isDevReview, phase]);
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
  const mistakes = answers.length - correct;
  return <div className={'app app-' + screen} data-theme={theme} data-answer={response}>
    <audio ref={audio} preload="auto" onEnded={() => { setPlaying(false); setAudioFinished(true); }} onError={() => { setAudioError(true); setPlaying(false); }}/>
    {screen === 'quiz' && !feedback && countdown.timer && <><QuizTimerFill timer={countdown.timer} expired={countdown.expired} now={now}/><span className="sr-only" role="status">{countdown.expired ? 'Take your time. A correct answer still counts as partial success.' : `${countdown.timer.limitMs / 1000} second timer started.`}</span></>}
    {screen === 'quiz' && feedback && departures.length > 0 && <div className="answer-departures" aria-hidden="true">{departures.map((card, i) => <div className={choiceClass(card.exercise) + ' departing-card'} key={card.item.id} data-exit={feedback.outcome === 'partial' ? 'drift' : feedback.correct ? 'fly' : 'fall'} data-slot={card.slot} style={{ left: card.left, top: card.top, width: card.width, height: card.height, animationDelay: feedback.correct ? undefined : `${i * 45}ms`, '--fly-x': `${card.flyX}px`, '--fly-y': `${card.flyY}px` } as CSSProperties}><CardFace item={card.item} exercise={card.exercise} font={card.font}/></div>)}</div>}
    <header>{screen !== 'home' && <button className="brand" onClick={home} aria-label="Kikimashta home"><img className="brand-mark" src={asset('brand/kikimashta-cat-v1.png')} alt="" aria-hidden="true" draggable={false}/><svg className="practice-close" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg><span className="brand-name">kikimashta</span><span className="brand-dot">.</span></button>}<span className="language"><i/> Japanese</span></header>
    <main>
      {screen === 'home' && <section className="home fade-in">
        <h1>kikimashta</h1>
        <HomeIntensity value={density}/>
        <button className="primary start" disabled={loading || accountLoading || historyError || pendingSaveCount > 0 || !selectedCards.length} onClick={() => void startSession()}>{pendingSaveCount ? 'Saving…' : loading || accountLoading ? 'Getting ready…' : 'Start'} <span aria-hidden="true">↗</span></button>
        <button className="text-button" disabled={loading || accountLoading || pendingSaveCount > 0 || !selectedCards.length} onClick={startDevReview}>Dev review</button>
        {historyError && <div className="error" role="alert"><p>Your practice history couldn't load.</p><button className="text-button" onClick={() => { setLoading(true); setHistoryError(false); setRefresh(value => value + 1); }}>Retry loading</button></div>}
        <div className="history">{total ? total + (total === 1 ? ' answer' : ' answers') + ' saved on this device' : ''}</div>
        <details className="pack-picker">
          <summary>Card packs · {packIds.length} selected</summary>
          <fieldset disabled={loading || accountLoading || pendingSaveCount > 0}><legend>Practice packs</legend>
            {cardPacks.map(pack => <label key={pack.id}><input type="checkbox" checked={packIds.includes(pack.id)} onChange={() => togglePack(pack.id)}/>{pack.title}</label>)}
          </fieldset>
          <p>Choose the pictures and writing you want to practice. Lessons use cards ready for practice.</p>
        </details>
        {!selectedCards.length && <p role="status">Select a pack to start practicing.</p>}
        {accountControls}
      </section>}
      {screen === 'ready' && <section className="summary ready fade-in">
        <div className="finish-companion" aria-hidden="true"><img src={asset('brand/kikimashta-cat-v1.png')} alt="" draggable={false}/></div>
        <h1>{phase === 'review' ? 'Review Time!' : lessonItems.length ? 'Lesson Time!' : 'All set for now!'}</h1>
        {(phase === 'review' || lessonItems.length > 0) && <p className="block-note">{phase === 'review' ? questions.length : lessonItems.length} {(phase === 'review' ? questions.length : lessonItems.length) === 1 ? 'card' : 'cards'}</p>}
        <DensityIndicator value={density}/>
        {phase === 'review' ? <button className="primary" onClick={() => beginQuiz(questions)}>Begin review <span aria-hidden="true">→</span></button> : lessonItems.length > 0 && <button className="primary" disabled={loading || historyError} onClick={beginLesson}>Begin lesson <span aria-hidden="true">→</span></button>}
        {historyError && <div className="error" role="alert"><p>The next lesson couldn't load.</p><button className="text-button" onClick={() => void prepareLessons(operation.current)}>Retry lesson</button></div>}
        <button className="text-button" onClick={home}>Finish</button>
      </section>}
      {screen === 'preview' && target && <section className="practice preview fade-in" data-exercise={exercise}>
        <div className="section-top"><span className="counter">{preview + 1} / {lessonItems.length}</span></div>
        <h1 className="practice-title">Lesson Time!</h1>
        <div className={'preview-picture' + (exercise === 'audio-text' ? ' preview-writing' : '')}><CardFace item={target} exercise={exercise!} font={writingFont}/></div>
        <div className="practice-actions">
        <button className={'listen ' + (playing ? 'playing' : '')} onClick={() => play(true)} aria-label="Replay word"><Speaker/><span>{playing ? 'Playing…' : 'Replay'}</span></button>

        {audioError && <p role="alert" className="error">The sound couldn't play. Tap replay to retry.</p>}
        <div className="preview-dots" aria-label={'Card ' + (preview + 1) + ' of ' + lessonItems.length}>{lessonItems.map((item, i) => <span key={cardKey(item)} className={i === preview ? 'active' : ''}/>)}</div>
        <button className="primary" disabled={audioError} onClick={() => { if (preview + 1 < lessonItems.length) { setPreview(preview + 1); present(lessonItems[preview + 1]!.item, lessonItems[preview + 1]!.exercise); } else startLessonQuiz(); }}>{preview + 1 === lessonItems.length ? 'Mini-quiz' : 'Next card'} <span aria-hidden="true">→</span></button>
        </div>
      </section>}
      {screen === 'quiz' && target && <section className="practice quiz fade-in" data-exercise={exercise}>
        <h1 className="sr-only">Listen and choose</h1>
        <div className="quiz-top">
        <QuizCompanion listening={playing} response={feedback?.outcome ?? null}/>
        <div className="quiz-audio"><button ref={replayButton} className={'listen quiz-listen ' + (playing ? 'playing' : '')} onClick={() => play(true)} aria-label="Replay word"><Speaker/><span className="sr-only">{playing ? 'Playing…' : 'Replay'}</span></button></div>
        </div>
        <span className="sr-only" aria-live="polite">Question {index + 1}{questions[index]?.retryOf ? ', retry' : ''}</span>
        {audioError && <p role="alert" className="error">The sound couldn't play. Tap replay to retry.</p>}
        <div className="quiz-cards">
        {feedback?.outcome === 'success' && <div className="quiz-starburst" key={feedback.id} aria-hidden="true"><svg viewBox="-200 -200 400 400" fill="currentColor" focusable="false">{fireworkOffsets.map((offset, i) => <g className="firework-star" key={i} style={{ '--star-x': `${offset.x}px`, '--star-y': `${offset.y}px` } as CSSProperties}><path d="M0 -7 L2.1 -2.3 L6.7 -2.2 L3.4 1.1 L4.1 6.3 L0 3.7 L-4.1 6.3 L-3.4 1.1 L-6.7 -2.2 L-2.1 -2.3 Z"/></g>)}</svg></div>}
        <div className="choices choices-enter" ref={choiceGrid} key={exercise + '-' + target.id + '-' + index}>{questions[index]!.choices.map((item, i) => {
          const isCorrect = feedback && item.id === target.id;
          const isWrong = feedback && item.id === feedback.selectedId && !feedback.correct;
          const isDeparting = Boolean(feedback && !isCorrect && (feedback.correct || !isWrong));
          return <div className={'choice-slot' + (isDeparting ? ' is-departing' : '')} key={item.id} aria-hidden={isDeparting || undefined} style={{ animationDelay: `${i * 40}ms` }}><button className={choiceClass(exercise!) + ' ' + (isCorrect ? feedback?.outcome === 'partial' ? 'partial ' : 'correct ' : '') + (isWrong ? 'incorrect' : '')} aria-label={exercise === 'audio-picture' ? 'Choose picture ' + (i + 1) + ': ' + item.image.alt : 'Choose writing ' + item.text} disabled={!!feedback || audioError} onContextMenu={event => event.preventDefault()} onClick={() => choose(item)}><CardFace item={item} exercise={exercise!} font={writingFont}/>{isCorrect && <span className="choice-badge" aria-label={feedback?.outcome === 'partial' ? 'Partial success' : 'Correct answer'}>{feedback?.outcome === 'partial' ? '≈' : '✓'}</span>}{isWrong && <span className="choice-badge wrong" aria-label="Your choice">↺</span>}</button></div>;
        })}</div></div>
        <div className="practice-actions">
        <div className="feedback" aria-live="polite">{feedback && <strong>{feedback.outcome === 'partial' ? 'Got it — take your time.' : feedback.correct ? 'Got it!' : 'Try this one.'}</strong>}{feedback?.correct && saving && <span className="sr-only">Saving…</span>}</div>
        {saveError && feedback && <div className="error" role="alert"><p>This answer hasn't been saved yet.</p><button className="text-button" onClick={() => void save(feedback)}>Retry saving</button><button className="text-button" onClick={next}>Continue without saving</button></div>}
        {feedback && (!feedback.correct || saveError || audioError || autoPaused) && <button className="primary" disabled={saving || saveError} onClick={next}>{saving ? 'Saving…' : index + 1 === questions.length ? 'See results' : 'Continue'} <span aria-hidden="true">→</span></button>}
        </div>
        <QuizProgress total={quizSize} completed={correct} mistakes={mistakes}/>
      </section>}
      {screen === 'summary' && <section className="summary fade-in">
        <div className="finish-companion" aria-hidden="true"><img src={asset('brand/kikimashta-cat-v1.png')} alt="" draggable={false}/></div>
        <h1>{isDevReview ? 'Dev review complete' : phase === 'review' ? 'Nice reviewing!' : 'Nice round!'}</h1>
        <div className="score"><strong>{correct}<span> / {answers.length}</span></strong></div>
        {answers.some(answer => answer.outcome === 'partial') && <p>{answers.filter(answer => answer.outcome === 'partial').length} partial success{answers.filter(answer => answer.outcome === 'partial').length === 1 ? '' : 'es'}</p>}
        {!isDevReview && <>
        <DensityIndicator value={density}/>
        {loading ? <p className="block-note" role="status" aria-label="Preparing lesson">…</p> : lessonPlan?.items.length ? <button className="primary" onClick={beginLesson}>{phase === 'review' ? 'Begin lesson' : 'Learn more'} <span aria-hidden="true">→</span></button> : null}
        {historyError && <div className="error" role="alert"><p>The next lesson couldn't load.</p><button className="text-button" onClick={() => void prepareLessons(operation.current)}>Retry lesson</button></div>}
        </>}
        <button className="text-button" onClick={home}>Finish</button>
      </section>}
    </main><footer>{screen === 'home' && <a href={asset('vocabulary/')}>Card library ↗</a>}<a href={asset('credits.html')}>Code &amp; credits ↗</a></footer>
  </div>;
}
