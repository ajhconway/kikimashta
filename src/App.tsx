import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { initialLanguage, languagePreferenceKey, learningLanguages, type LearningLanguage } from './core/languages';
import { initialPackIds, selectedPracticeCards } from './core/packs';
import type { AudioAsset, Exercise, PracticeAttempt, PracticeCard, WordItem } from './types';
import { attemptExercise, cardKey, isContextualExercise } from './core/cards';
import { correctChoiceId, createQuestions, requeueMissedQuestion, shuffled, type Question } from './core/session';
import { deriveContextualUnlocks, selectedContextualCards } from './core/contextual-progression';
import { contextualQuestion } from './core/contextual-questions';
import { approvedContextualQuestions } from './content/contextual';
import { contextualBanks, contextualVocabulary, readyContextualCards } from './content/contextual-runtime';
import { ContextualQuiz, type ContextualPlayback } from './components/ContextualQuiz';
import { QuizCompanion, Speaker } from './components/QuizChrome';
import { ContextualDevReview } from './components/ContextualDevReview';
import { advanceSchedule, deriveSchedules, snapshotDue, schedulerVersion, type ScheduledWord } from './core/scheduler';
import { createContextualDemo } from './core/contextual-demo';
import { createMasteryDemo } from './core/mastery-demo';
import { cardMastery, masteryIndex } from './core/mastery';
import { answerOutcome, devReviewTimeLimit, quizTimeLimit } from './core/quiz-timer';
import { useQuizCountdown } from './hooks/useQuizCountdown';
import { MasteryFeedback } from './components/MasteryFeedback';
import { QuizTimerFill } from './components/QuizTimerFill';
import { DEFAULT_DENSITY_RANGE, DENSITY_LEVELS, densityLevel, densityTargets, forecastDensity, planLessonChunk, type DensityRange } from './core/density';
import { initialVoiceIds } from './core/voices';
import { selectRecording } from './core/audio';
import { ProgressStore } from './progress/store';
import { AnswerRecovery } from './progress/recovery';
import { intensityColors, quizFeedbackColors, themeColors } from './themes';
import { DensityIndicator, HomeIntensity } from './components/PaceControl';
import './styles.css';
import './writing-fonts.css';
import { availableWritingFont, createWritingFontRotation, preloadWritingFonts, type WritingFont } from './core/writing-fonts';

const asset = (path: string) => import.meta.env.BASE_URL + path;
const defaultStore = new ProgressStore();
const contextualCards = readyContextualCards(contextualBanks, contextualVocabulary);
const fireworkOffsets = Array.from({ length: 16 }, (_, i) => {
  const angle = i * Math.PI / 8 - Math.PI / 2;
  const radius = i % 2 === 0 ? 155 : 130;
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
});

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

interface AppProps {
  now?: () => number; random?: () => number; progressStore?: ProgressStore; answerRecovery?: AnswerRecovery; historyRevision?: number;
  accountControls?: ReactNode; accountLoading?: boolean; onSaved?: () => void;
}

export default function App(props: AppProps = {}) {
  const [language, setLanguage] = useState(initialLanguage);
  const [localRecovery] = useState(() => new AnswerRecovery());
  function changeLanguage(id: string) {
    const next = learningLanguages.find(candidate => candidate.id === id);
    if (!next) return;
    try { localStorage.setItem(languagePreferenceKey, next.id); } catch { /* Selection works in memory. */ }
    focusLanguage.current = true;
    setLanguage(next);
  }
  const focusLanguage = useRef(false);
  useEffect(() => {
    if (focusLanguage.current) document.querySelector<HTMLSelectElement>('select[aria-label="Learning language"]')?.focus();
  }, [language]);
  return <LanguagePractice key={language.id} {...props} answerRecovery={props.answerRecovery ?? localRecovery}
    language={language} onLanguageChange={changeLanguage}/>;
}

function LanguagePractice({ now = wallClock, random = Math.random, progressStore = defaultStore, answerRecovery, historyRevision = 0, accountControls, accountLoading = false, onSaved, language, onLanguageChange }: AppProps & {
  language: LearningLanguage; onLanguageChange: (id: string) => void;
}) {
  const practicePool = language.pool;
  const cardPacks = language.packs;
  const packPreferenceKey = language.packPreferenceKey;
  const languageContextualBanks = useMemo(() => contextualBanks.filter(bank => bank.language === language.id), [language.id]);
  const languageContextualVocabulary = useMemo(() => contextualVocabulary.filter(item => item.language === language.id), [language.id]);
  const store = progressStore;
  const [localRecovery] = useState(() => new AnswerRecovery());
  const recovery = answerRecovery ?? localRecovery;
  const saveState = useSyncExternalStore(recovery.subscribe, recovery.snapshot);
  const [packIds, setPackIds] = useState(() => initialPackIds(cardPacks, packPreferenceKey));
  const selectedCards = useMemo(() => selectedPracticeCards(practicePool.items, packIds, cardPacks), [packIds, practicePool, cardPacks]);
  const choicesFor = useCallback((exercise: Exercise) => selectedCards.filter(card => card.exercise === exercise).map(card => card.item), [selectedCards]);
  const learningSnapshot = useCallback(async (attempts: PracticeAttempt[]) => {
    const unlocks = await deriveContextualUnlocks(attempts, practicePool.language);
    const cards = [...selectedContextualCards(selectedCards, contextualCards, unlocks), ...selectedCards];
    const keys = new Set(cards.map(cardKey));
    const allSchedules = await deriveSchedules(attempts, practicePool.language);
    return { cards, allSchedules, schedules: allSchedules.filter(card => keys.has(cardKey(card))) };
  }, [selectedCards, practicePool]);
  function questionForCard(card: PracticeCard): Question[] {
    if (!isContextualExercise(card.exercise)) return createQuestions([card], choicesFor(card.exercise), random);
    const format = card.exercise.endsWith('picture') ? 'picture' : 'text';
    const candidates = languageContextualBanks.flatMap(bank => approvedContextualQuestions(bank, format))
      .filter(({ context }) => context.targetItemId === card.item.id &&
        `context-${context.stage ?? 'contrastive'}-${format}` === card.exercise);
    const selected = candidates[Math.floor(random() * candidates.length)];
    if (!selected) throw new Error('No approved contextual question for this card.');
    return [contextualQuestion(selected.context, selected.question, format, languageContextualVocabulary, random, initialVoiceIds())];
  }
  const [fontRotation] = useState(() => createWritingFontRotation());
  const [writingFont, setWritingFont] = useState<WritingFont>('system');
  useEffect(() => { if (language.writing === 'japanese') preloadWritingFonts(); }, [language]);
  const [screen, setScreen] = useState<'home' | 'ready' | 'preview' | 'quiz' | 'summary' | 'contextual-dev' | 'contextual-demo-ready'>(() =>
    languageContextualBanks.length > 0 && new URLSearchParams(window.location.search).get('demo') === 'contextual' ? 'contextual-demo-ready' :
      languageContextualBanks.length > 0 && new URLSearchParams(window.location.search).get('review') === 'contextual' ? 'contextual-dev' : 'home');
  const [phase, setPhase] = useState<'review' | 'lesson'>('lesson');
  const [isDevReview, setIsDevReview] = useState(false);
  const [isContextualDemo, setIsContextualDemo] = useState(false);
  const [demoPresentation, setDemoPresentation] = useState<{ label: string; timerMs: number | null; retry: boolean } | null>(null);
  const demoSchedules = useRef<Map<string, ScheduledWord | undefined> | null>(null);
  const [range] = useState<DensityRange>(initialRange);
  const [density, setDensity] = useState<number | null>(null);
  const [contextualAdmission, setContextualAdmission] = useState({ ready: 0, atCapacity: false });
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  const [lessonItems, setLessonItems] = useState<PracticeCard[]>([]);
  const [preview, setPreview] = useState(0);
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizSize, setQuizSize] = useState(0);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<PracticeAttempt[]>([]);
  const [masteryChange, setMasteryChange] = useState<{ id: string; label: string; direction: 'up' | 'down' } | null>(null);
  const [feedback, setFeedback] = useState<PracticeAttempt | null>(null);
  const [departures, setDepartures] = useState<DepartingCard[]>([]);
  const [demoSaving, setDemoSaving] = useState(false);
  const pendingSaveCount = saveState.pendingId === null ? 0 : 1;
  const failedAttempt = saveState.failed;
  const saving = pendingSaveCount > 0 || demoSaving;
  const saveError = failedAttempt !== null;
  const [audioError, setAudioError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioFinished, setAudioFinished] = useState(false);
  const [questionTimer, setQuestionTimer] = useState<{ id: string; limitMs: number | null; masteryLabel: string }>({ id: '', limitMs: null, masteryLabel: 'New' });
  const [autoPaused, setAutoPaused] = useState(false);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const recording = useRef<AudioAsset | null>(null);
  const active = useRef({ id: '', startedAt: 0, answered: false, sessionId: '', replays: 0 });
  const session = useRef({ id: '', reserved: new Set<string>(), cards: [] as PracticeCard[] });
  const lessonQuestions = useRef(new Map<string, Question>());
  const history = useRef<PracticeAttempt[]>([]);
  const mastery = useRef(new Map<string, ScheduledWord>());
  const operation = useRef(0);
  const preparing = useRef(false);
  const playRequest = useRef(0);
  const replayButton = useRef<HTMLButtonElement>(null);
  const choiceGrid = useRef<HTMLDivElement>(null);
  const countdown = useQuizCountdown({ id: screen === 'quiz' ? questionTimer.id : '', limitMs: questionTimer.limitMs,
    audioFinished, answered: !!feedback, grid: choiceGrid, now });
  const target = screen === 'preview' ? lessonItems[preview]?.item : questions[index]?.target;
  const exercise = screen === 'preview' ? lessonItems[preview]?.exercise : questions[index]?.exercise;
  const theme = screen === 'contextual-dev' || (screen === 'quiz' && questions[index]?.contextual) ? 'contextualQuiz' : screen === 'preview' || (screen === 'ready' && phase === 'lesson') ? 'lesson' : screen === 'quiz' || (screen === 'ready' && phase === 'review') ? 'pictureQuiz' : 'home';
  const response = screen === 'quiz' && feedback ? feedback.outcome === 'partial' ? 'partial' : feedback.correct ? 'correct' : 'incorrect' : undefined;
  const background = response ? quizFeedbackColors[response] : screen === 'home' && density !== null ? intensityColors[densityLevel(density)] : themeColors[theme];
  const invalidate = useCallback(() => { operation.current++; }, []);

  useEffect(() => {
    const refreshPacks = () => {
      if (screen !== 'home') return;
      const next = initialPackIds(cardPacks, packPreferenceKey);
      if (packIds.join() !== next.join()) {
        setLoading(true);
        setPackIds(next);
      }
    };
    refreshPacks();
    window.addEventListener('pageshow', refreshPacks);
    window.addEventListener('storage', refreshPacks);
    return () => {
      window.removeEventListener('pageshow', refreshPacks);
      window.removeEventListener('storage', refreshPacks);
    };
  }, [packIds, screen, cardPacks, packPreferenceKey]);

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
        const { schedules, cards } = await learningSnapshot(attempts);
        const forecast = await forecastDensity(schedules, now());
        if (cancelled || operation.current !== request) return;
        history.current = attempts;
        const learned = new Set(schedules.map(cardKey));
        setContextualAdmission({ ready: cards.filter(card => isContextualExercise(card.exercise) && !learned.has(cardKey(card))).length,
          atCapacity: forecast.reviewsPerDay >= densityTargets(range.min, range.max).maximum });
        mastery.current = new Map(schedules.map(word => [cardKey(word), word]));
        setTotal(attempts.length); setDensity(forecast.reviewsPerDay); setHistoryError(false);
      } catch {
        if (!cancelled && operation.current === request) { setHistoryError(true); setDensity(null); }
      } finally { if (!cancelled && operation.current === request) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [screen, refresh, now, store, historyRevision, learningSnapshot, saveState.revision, range, practicePool]);

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
    if (exercise === 'audio-text' && language.writing === 'japanese') setWritingFont(availableWritingFont(fontRotation(item, random, presentationPhase), texts));
    recording.current = selectRecording(item.audio, random, initialVoiceIds());
    active.current.replays = 0;
    play();
  }, [play, random, fontRotation, language]);
  function home() {
    operation.current++; preparing.current = false;
    playRequest.current++; audio.current?.pause(); setPlaying(false); setAudioError(false);
    active.current = { id: '', startedAt: 0, answered: true, sessionId: '', replays: 0 };
    setDemoSaving(false); setFeedback(null); setDepartures([]); setLessonPlan(null);
    setIsDevReview(false); setIsContextualDemo(false); demoSchedules.current = null; setDemoPresentation(null);
    setLoading(true); setHistoryError(false); setScreen('home'); setRefresh(value => value + 1);
  }
  const showQuestion = useCallback((next: Question, sessionId: string, questionPhase: 'lesson' | 'review', devReview = false) => {
    active.current = { id: crypto.randomUUID(), sessionId, startedAt: now(), answered: false, replays: 0 };
    const word = next.demoId ? demoSchedules.current?.get(next.demoId) : mastery.current.get(cardKey({ item: next.target, exercise: next.exercise }));
    const level = cardMastery(word);
    const demoLevel = next.demoId ? level : null;
    setDemoPresentation(demoLevel ? { ...demoLevel, retry: !!next.retryOf } : null);
    setQuestionTimer({ id: active.current.id, masteryLabel: level.label, limitMs: next.contextual ? null : demoLevel ? next.retryOf ? null : demoLevel.timerMs : devReview ? devReviewTimeLimit(random) : questionPhase === 'review' && !next.retryOf
      ? quizTimeLimit(word) : null });
    setAudioFinished(false);
    setFeedback(null); setDepartures([]);
    if (next.contextual) {
      playRequest.current++; audio.current?.pause(); setPlaying(false); setAudioError(false);
      recording.current = { src: next.contextual.recording!.sentenceSrc, source: 'synthesized' };
    } else present(next.target, next.exercise, questionPhase, next.choices.map(choice => choice.text));
  }, [now, present, random]);
  function beginQuiz(block: Question[], blockPhase = phase, devReview = isDevReview) {
    setQuestions(block); setQuizSize(block.length); setIndex(0); setAnswers([]); setScreen('quiz');
    showQuestion(block[0]!, session.current.id, blockPhase, devReview);
  }
  function startDevReview() {
    setIsContextualDemo(false);
    if (loading || accountLoading || preparing.current || recovery.snapshot().pendingId || recovery.snapshot().failed || !selectedCards.length) return;
    operation.current++;
    session.current = { id: crypto.randomUUID(), reserved: new Set(), cards: selectedCards };
    setIsDevReview(true); setPhase('review'); setLessonItems([]); setLessonPlan(null); setHistoryError(false);
    beginQuiz(shuffled(selectedCards, random).slice(0, 6).flatMap(card => createQuestions([card], choicesFor(card.exercise), random)), 'review', true);
  }
  function startMasteryDemo() {
    setIsContextualDemo(false);
    if (loading || accountLoading || preparing.current || recovery.snapshot().pendingId || recovery.snapshot().failed || !selectedCards.length) return;
    const demo = createMasteryDemo(selectedCards, now(), random);
    operation.current++;
    demoSchedules.current = demo.schedules;
    session.current = { id: crypto.randomUUID(), reserved: new Set(), cards: selectedCards };
    setIsDevReview(true); setPhase('review'); setLessonItems([]); setLessonPlan(null); setHistoryError(false);
    beginQuiz(demo.questions, 'review', true);
  }
  function startContextualDemo() {
    if (recovery.snapshot().pendingId || recovery.snapshot().failed) return;
    const block = createContextualDemo(languageContextualBanks, languageContextualVocabulary, random, initialVoiceIds());
    if (!block.length) return;
    operation.current++;
    demoSchedules.current = null; setDemoPresentation(null); setDemoSaving(false); setMasteryChange(null);
    session.current = { id: crypto.randomUUID(), reserved: new Set(), cards: [] };
    setIsDevReview(true); setIsContextualDemo(true); setPhase('review');
    setLessonItems([]); setLessonPlan(null); setHistoryError(false);
    beginQuiz(block, 'review', true);
  }
  const prepareLessons = useCallback(async (request: number) => {
    setLoading(true); setHistoryError(false); setLessonPlan(null);
    try {
      const attempts = await store.history(practicePool.language);
      if (operation.current !== request) return;
      history.current = attempts;
      const keys = new Set(session.current.cards.map(cardKey));
      const schedules = (await deriveSchedules(attempts, practicePool.language)).filter(card => keys.has(cardKey(card)));
      const learned = new Set(schedules.map(cardKey));
      const plan = await planLessonChunk({ schedules, now: now(), range,
        candidates: session.current.cards.filter(card => !learned.has(cardKey(card)) && !session.current.reserved.has(cardKey(card))) });
      if (operation.current !== request) return;
      setLessonPlan(plan); setDensity(plan.forecast.reviewsPerDay); setLessonItems(shuffled(plan.items, random));
    } catch { if (operation.current === request) setHistoryError(true); }
    finally { if (operation.current === request) setLoading(false); }
  }, [now, range, store, random, practicePool]);
  async function startSession() {
    if (loading || accountLoading || preparing.current || recovery.snapshot().pendingId || recovery.snapshot().failed || !selectedCards.length) return;
    setIsDevReview(false); setIsContextualDemo(false);
    preparing.current = true;
    const request = ++operation.current;
    const at = now();
    setLoading(true); setHistoryError(false);
    try {
      const attempts = await store.history(practicePool.language);
      const { schedules, cards } = await learningSnapshot(attempts);
      if (operation.current !== request) return;
      history.current = attempts; setTotal(attempts.length);
      mastery.current = new Map(schedules.map(word => [cardKey(word), word]));
      session.current = { id: crypto.randomUUID(), reserved: new Set(), cards };
      const due = snapshotDue(schedules, selectedCards.map(card => card.item.id), at);
      const byId = new Map(practicePool.items.map(item => [item.id, item]));
      if (due.length) {
        setPhase('review'); setQuestions(shuffled(due, random).flatMap(card => questionForCard({ item: byId.get(card.itemId)!, exercise: card.exercise })));
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
    lessonQuestions.current = new Map(lessonItems.filter(card => isContextualExercise(card.exercise))
      .map(card => [cardKey(card), questionForCard(card)[0]!]));
    setPhase('lesson'); setPreview(0); setScreen('preview'); presentLesson(lessonItems[0]!);
  }
  function presentLesson(card: PracticeCard) {
    if (isContextualExercise(card.exercise)) {
      playRequest.current++; audio.current?.pause(); setPlaying(false); setAudioError(false);
      setPreviewQuestion(lessonQuestions.current.get(cardKey(card)) ?? questionForCard(card)[0]!);
    } else { setPreviewQuestion(null); present(card.item, card.exercise); }
  }
  function startLessonQuiz() {
    const known = new Set(history.current.map(attempt => cardKey({ ...attempt, exercise: attemptExercise(attempt) })));
    const block = shuffled(lessonItems, random).flatMap(card => {
      if (isContextualExercise(card.exercise)) return [lessonQuestions.current.get(cardKey(card)) ?? questionForCard(card)[0]!];
      const choices = choicesFor(card.exercise).filter(item => known.has(cardKey({ item, exercise: card.exercise })) ||
        lessonItems.some(lesson => lesson.exercise === card.exercise && lesson.item.id === item.id));
      return createQuestions([card], choices.length >= 4 ? choices : choicesFor(card.exercise), random);
    });
    beginQuiz(block);
  }
  async function save(attempt: PracticeAttempt) {
    if (isDevReview) {
      const demoId = questions[index]?.demoId;
      const samples = demoSchedules.current;
      if (!demoId || !samples || attempt.context?.retryOf) return;
      const request = operation.current;
      const previous = samples.get(demoId);
      setDemoSaving(true);
      try {
        const updated = await advanceSchedule(previous, attempt);
        if (operation.current !== request || active.current.id !== attempt.id) return;
        samples.set(demoId, updated);
        if (masteryIndex(previous) !== masteryIndex(updated)) {
          setMasteryChange({ id: attempt.id, label: cardMastery(updated).label,
            direction: masteryIndex(updated) > masteryIndex(previous) ? 'up' : 'down' });
        }
      } finally { if (active.current.id === attempt.id) setDemoSaving(false); }
      return;
    }
    const request = operation.current;
    const key = cardKey({ ...attempt, exercise: attemptExercise(attempt) });
    const previous = mastery.current.get(key);
    if (!await recovery.save(store, attempt)) return;
    const updated = attempt.context?.retryOf ? undefined : await advanceSchedule(previous, attempt);
    if (updated && operation.current === request) {
      mastery.current.set(key, updated);
      const before = masteryIndex(previous), after = masteryIndex(updated);
      if (before !== after && active.current.id === attempt.id) {
        setMasteryChange({ id: attempt.id, label: cardMastery(updated).label, direction: after > before ? 'up' : 'down' });
      }
    }
    onSaved?.();
    if (!history.current.some(saved => saved.id === attempt.id)) history.current = [...history.current, attempt];
    setTotal(history.current.length);
    setRefresh(value => value + 1);
  }
  function choose(item: WordItem) {
    if (active.current.answered || (audioError && !questions[index]?.contextual)) return;
    active.current.answered = true;
    const question = questions[index]!;
    const answeredAt = now();
    const correct = item.id === correctChoiceId(question);
    const attempt: PracticeAttempt = {
      id: active.current.id, sessionId: active.current.sessionId,
      itemId: question.target.id, language: practicePool.language,
      choiceIds: question.choices.map(choice => choice.id), selectedId: item.id,
      correct, outcome: answerOutcome(correct, countdown.timer, answeredAt),
      ...(countdown.timer ? { timer: countdown.timer } : {}), startedAt: active.current.startedAt,
      answeredAt, responseMs: Math.max(0, answeredAt - active.current.startedAt),
      context: { phase, exercise: question.exercise, recordingSrc: recording.current!.src, replays: active.current.replays, schedulerVersion,
        ...(question.contextual ? { contextual: {
          stage: question.contextual.context.stage ?? 'contrastive',
          contextId: question.contextual.context.id, contextRevision: question.contextual.context.revision,
          questionId: question.contextual.question.id, questionRevision: question.contextual.question.revision,
          kind: question.contextual.question.kind, correctOptionId: question.contextual.question.correctOptionId,
          sentenceSrc: question.contextual.recording!.sentenceSrc,
          questionSrc: question.contextual.recording!.questionSrcs[question.contextual.question.id]!,
        } } : {}),
        ...(question.retryOf ? { retryOf: question.retryOf } : {}) },
    };
    if (question.contextual) {
      if (!attempt.correct) setQuestions(requeueMissedQuestion(questions, index, attempt.id, random));
      setFeedback(attempt); setAnswers(previous => [...previous, attempt]); void save(attempt); return;
    }
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
    if (!active.current.answered || recovery.snapshot().pendingId === active.current.id) return;
    if (index + 1 === questions.length) {
      active.current.answered = false; playRequest.current++; audio.current?.pause();
      setPlaying(false); setDepartures([]); setScreen('summary');
      if (!isDevReview) void prepareLessons(operation.current);
      return;
    }
    setIndex(index + 1); showQuestion(questions[index + 1]!, session.current.id, phase, isDevReview);
  }, [index, questions, showQuestion, prepareLessons, isDevReview, phase, recovery]);
  useEffect(() => {
    if (screen !== 'quiz' || !feedback?.correct || saving || saveError || audioError || playing || autoPaused) return;
    const answerId = feedback.id; const request = playRequest.current;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'hidden') { setAutoPaused(true); return; }
      if (active.current.id === answerId && request === playRequest.current) next();
    }, correctAnswerPauseMs);
    return () => window.clearTimeout(timer);
  }, [screen, feedback, saving, saveError, audioError, playing, autoPaused, next, questions, index]);

  const contextualPlaybackChanged = useCallback((state: ContextualPlayback) => {
    setPlaying(state === 'playing');
    setAudioError(state === 'error' || state === 'ready');
    if (state === 'paused') setAutoPaused(true);
    else if (state === 'playing') setAutoPaused(false);
  }, []);

  const correct = answers.filter(answer => answer.correct).length;
  const mistakes = answers.length - correct;
  return <div className={'app app-' + screen} data-theme={theme} data-answer={response}>
    <audio ref={audio} preload="auto" onEnded={() => { setPlaying(false); setAudioFinished(true); }} onError={() => { setAudioError(true); setPlaying(false); }}/>
    {screen === 'quiz' && !feedback && countdown.timer && <><QuizTimerFill timer={countdown.timer} expired={countdown.expired} now={now}/><span className="sr-only" role="status">{countdown.expired ? 'Take your time. A correct answer still counts as partial success.' : `${countdown.timer.limitMs / 1000} second timer started.`}</span></>}
    {screen === 'quiz' && feedback && departures.length > 0 && <div className="answer-departures" aria-hidden="true">{departures.map((card, i) => <div className={choiceClass(card.exercise) + ' departing-card'} key={card.item.id} data-exit={feedback.outcome === 'partial' ? 'drift' : feedback.correct ? 'fly' : 'fall'} data-slot={card.slot} style={{ left: card.left, top: card.top, width: card.width, height: card.height, animationDelay: feedback.correct ? undefined : `${i * 45}ms`, '--fly-x': `${card.flyX}px`, '--fly-y': `${card.flyY}px` } as CSSProperties}><CardFace item={card.item} exercise={card.exercise} font={card.font}/></div>)}</div>}
    <header>{screen !== 'home' && <button className="brand" onClick={home} aria-label="Kikimashta home"><img className="brand-mark" src={asset('brand/kikimashta-cat-v1.png')} alt="" aria-hidden="true" draggable={false}/><svg className="practice-close" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg><span className="brand-name">kikimashta</span><span className="brand-dot">.</span></button>}{screen === 'home' ? <label className="language-picker"><svg className="language-globe" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg><span className="sr-only">Learning language</span><select aria-label="Learning language" value={language.id} disabled={accountLoading || pendingSaveCount > 0 || saveError} onChange={event => onLanguageChange(event.target.value)}>{learningLanguages.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}</select><svg className="language-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></label> : <span className="language"><i/> {language.title}</span>}</header>
    <main>
      {screen === 'home' && <section className="home fade-in">
        <h1>kikimashta</h1>
        <HomeIntensity value={density}/>
        <button className="primary start" disabled={loading || accountLoading || historyError || pendingSaveCount > 0 || saveError || !selectedCards.length} onClick={() => void startSession()}>{pendingSaveCount ? 'Saving…' : loading || accountLoading ? 'Getting ready…' : 'Start'} <span aria-hidden="true">↗</span></button>
        <button className="text-button" disabled={loading || accountLoading || pendingSaveCount > 0 || saveError || !selectedCards.length} onClick={startDevReview}>Dev review</button>
        <button className="text-button" disabled={loading || accountLoading || pendingSaveCount > 0 || saveError || !selectedCards.length} onClick={startMasteryDemo}>Mastery demo</button>
        {languageContextualBanks.length > 0 && <button className="text-button" disabled={pendingSaveCount > 0 || saveError} onClick={startContextualDemo}>Contextual practice demo</button>}
        {failedAttempt && <div className="error" role="alert"><p>This answer hasn't been saved yet.</p><button className="text-button" onClick={() => void save(failedAttempt)}>Retry saving</button><button className="text-button" onClick={recovery.discard}>Continue without saving</button></div>}
        {languageContextualBanks.length > 0 && <button className="text-button" disabled={accountLoading || pendingSaveCount > 0 || saveError} onClick={() => {
          operation.current++; playRequest.current++; audio.current?.pause(); setPlaying(false); setScreen('contextual-dev');
        }}>Contextual dev review</button>}
        {historyError && <div className="error" role="alert"><p>Your practice history couldn't load.</p><button className="text-button" onClick={() => { setLoading(true); setHistoryError(false); setRefresh(value => value + 1); }}>Retry loading</button></div>}
        {!loading && !historyError && contextualAdmission.ready > 0 && <p className="block-note">{contextualAdmission.ready} contextual {contextualAdmission.ready === 1 ? 'card is' : 'cards are'} ready for lessons. {contextualAdmission.atCapacity ? 'New lessons are waiting for your review workload to ease.' : 'They enter lessons when your review workload allows.'}</p>}
        <div className="history">{total ? total + (total === 1 ? ' answer' : ' answers') + ' saved on this device' : ''}</div>
        {language.libraryPath && <a className="pack-library-link" href={asset(language.libraryPath)}>Card library · {packIds.length} {packIds.length === 1 ? 'pack' : 'packs'} selected</a>}
        {!selectedCards.length && <p role="status">{!practicePool.items.length && language.unavailableMessage ? language.unavailableMessage : 'Select a pack in the card library to start practicing.'}</p>}
        {accountControls}
      </section>}
      {screen === 'contextual-demo-ready' && <section className="summary ready fade-in">
        <h1>Contextual practice demo</h1>
        <p>Try simple and contrastive questions with picture and writing answers.</p>
        <p>Progress is not saved.</p>
        <button className="primary" disabled={pendingSaveCount > 0 || saveError} onClick={startContextualDemo}>Begin review <span aria-hidden="true">→</span></button>
      </section>}
      {screen === 'contextual-dev' && languageContextualBanks.length > 0 && <ContextualDevReview banks={languageContextualBanks} vocabulary={languageContextualVocabulary} onClose={home} random={random}/>}
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
        {previewQuestion ? <ContextualQuiz key={preview} question={previewQuestion} feedback={null} onChoose={() => {}} onContinue={() => {}} onPlaybackChange={contextualPlaybackChanged} preview/> :
          <div className={'preview-picture' + (exercise === 'audio-text' ? ' preview-writing' : '')}><CardFace item={target} exercise={exercise!} font={writingFont}/></div>}
        <div className="practice-actions">
        {!previewQuestion && <button className={'listen ' + (playing ? 'playing' : '')} onClick={() => play(true)} aria-label="Replay word"><Speaker/><span>{playing ? 'Playing…' : 'Replay'}</span></button>}

        {audioError && <p role="alert" className="error">The sound couldn't play. Tap replay to retry.</p>}
        <div className="preview-dots" aria-label={'Card ' + (preview + 1) + ' of ' + lessonItems.length}>{lessonItems.map((item, i) => <span key={cardKey(item)} className={i === preview ? 'active' : ''}/>)}</div>
        <button className="primary" disabled={audioError} onClick={() => { if (preview + 1 < lessonItems.length) { setPreview(preview + 1); presentLesson(lessonItems[preview + 1]!); } else startLessonQuiz(); }}>{preview + 1 === lessonItems.length ? 'Mini-quiz' : 'Next card'} <span aria-hidden="true">→</span></button>
        </div>
      </section>}
      {screen === 'quiz' && target && questions[index]?.contextual && <section className="practice contextual-practice" data-exercise={exercise}>
        {isContextualDemo && <span className="contextual-demo-indicator" role="status" aria-label="Practice demo. Progress is not saved.">Demo · unsaved</span>}
        <ContextualQuiz key={index} question={questions[index]!} feedback={feedback} onChoose={choose}
          onContinue={next} onReplay={() => { active.current.replays++; playRequest.current++; }}
          onPlaybackChange={contextualPlaybackChanged} continueAfterCorrect={autoPaused || audioError || saveError} disabled={saving || saveError}/>
        {saveError && feedback && <div role="alert" className="error"><p>This answer hasn't been saved yet.</p><button className="text-button" onClick={() => void save(feedback)}>Retry saving</button><button className="text-button" onClick={() => { recovery.discard(); next(); }}>Continue without saving</button></div>}
        <QuizProgress total={quizSize} completed={correct} mistakes={mistakes}/>
      </section>}
      {screen === 'quiz' && target && !questions[index]?.contextual && <section className="practice quiz fade-in" data-exercise={exercise}>
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
        <MasteryFeedback current={{ label: questionTimer.masteryLabel, timerMs: questionTimer.limitMs, demo: !!demoPresentation }}
          outcome={feedback ? feedback.outcome ?? (feedback.correct ? 'success' : 'failure') : null}
          change={feedback && masteryChange?.id === feedback.id ? masteryChange : undefined} saving={!!feedback?.correct && saving}/>
        {failedAttempt && <div className="error" role="alert"><p>This answer hasn't been saved yet.</p><button className="text-button" onClick={() => void save(failedAttempt)}>Retry saving</button><button className="text-button" onClick={() => { recovery.discard(); next(); }}>Continue without saving</button></div>}
        {feedback && (!feedback.correct || saveError || audioError || autoPaused) && <button className="primary" disabled={saving || saveError} onClick={next}>{saving ? 'Saving…' : index + 1 === questions.length ? 'See results' : 'Continue'} <span aria-hidden="true">→</span></button>}
        </div>
        <QuizProgress total={quizSize} completed={correct} mistakes={mistakes}/>
      </section>}
      {screen === 'summary' && <section className="summary fade-in">
        <div className="finish-companion" aria-hidden="true"><img src={asset('brand/kikimashta-cat-v1.png')} alt="" draggable={false}/></div>
        <h1>{isContextualDemo ? 'Contextual practice demo complete' : isDevReview ? demoPresentation ? 'Mastery demo complete' : 'Dev review complete' : phase === 'review' ? 'Nice reviewing!' : 'Nice round!'}</h1>
        <div className="score"><strong>{correct}<span> / {answers.length}</span></strong></div>
        {answers.some(answer => answer.outcome === 'partial') && <p>{answers.filter(answer => answer.outcome === 'partial').length} partial success{answers.filter(answer => answer.outcome === 'partial').length === 1 ? '' : 'es'}</p>}
        {!isDevReview && <>
        <DensityIndicator value={density}/>
        {loading ? <p className="block-note" role="status" aria-label="Preparing lesson">…</p> : lessonPlan?.items.length ? <button className="primary" onClick={beginLesson}>{phase === 'review' ? 'Begin lesson' : 'Learn more'} <span aria-hidden="true">→</span></button> : null}
        {historyError && <div className="error" role="alert"><p>The next lesson couldn't load.</p><button className="text-button" onClick={() => void prepareLessons(operation.current)}>Retry lesson</button></div>}
        </>}
        <button className="text-button" onClick={home}>Finish</button>
      </section>}
    </main><footer><a href={asset('credits.html')}>Code &amp; credits ↗</a></footer>
  </div>;
}
