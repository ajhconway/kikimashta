import { useEffect, useRef, useState } from 'react';
import rawBank from '../content/ja.json';
import type { PracticeAttempt, WordBank, WordItem } from './types';
import { createSession, type Question } from './core/session';
import { ProgressStore } from './progress/store';
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

const wallClock = () => Date.now();

export default function App({ now = wallClock }: { now?: () => number } = {}) {
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
  const [total, setTotal] = useState(0);
  const [historyError, setHistoryError] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const active = useRef({ id: '', startedAt: 0, answered: false, sessionId: '' });
  const playRequest = useRef(0);
  const pendingSaves = useRef(new Set<string>());
  const target = screen === 'preview' ? bank.items[preview] : questions[index]?.target;

  useEffect(() => {
    let mounted = true;
    store.history(bank.language).then(history => { if (mounted) setTotal(history.length); }).catch(() => { if (mounted) setHistoryError(true); });
    return () => { mounted = false; };
  }, []);

  function play(item: WordItem) {
    const element = audio.current;
    if (!element) return;
    const request = ++playRequest.current;
    element.pause();
    element.src = asset(item.audio.src);
    element.currentTime = 0;
    setAudioError(false);
    setPlaying(true);
    void element.play().catch(() => {
      if (request === playRequest.current) { setAudioError(true); setPlaying(false); }
    });
  }
  function home() {
    playRequest.current++;
    audio.current?.pause();
    setPlaying(false);
    setAudioError(false);
    active.current = { id: '', startedAt: 0, answered: true, sessionId: '' };
    setSaving(false); setSaveError(false); setFeedback(null);
    setScreen('home');
  }
  function showQuestion(next: Question, sessionId: string) {
    active.current = { id: crypto.randomUUID(), sessionId, startedAt: now(), answered: false };
    setFeedback(null); setSaveError(false); setSaving(false);
    play(next.target);
  }
  function startQuiz() {
    const session = createSession(bank);
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
  function next() {
    if (index + 1 === questions.length) {
      audio.current?.pause(); setPlaying(false); setScreen('summary'); return;
    }
    setIndex(index + 1);
    showQuestion(questions[index + 1]!, active.current.sessionId);
  }
  const correct = answers.filter(answer => answer.correct).length;
  return <div className="app">
    <audio ref={audio} preload="auto" onEnded={() => setPlaying(false)} onError={() => { setAudioError(true); setPlaying(false); }}/>
    <header><button className="brand" onClick={home} aria-label="Kikimashta home"><span className="brand-mark">◒</span> kikimashta<span className="brand-dot">.</span></button><span className="language"><i/> Japanese</span></header>
    <main>
      {screen === 'home' && <section className="home fade-in">
        <div className="eyebrow">A SMALL DAILY ADVENTURE</div>
        <h1>A little listening.<br/><em>A little discovery.</em></h1>
        <p className="intro">Find the picture hiding in the sound.<br/>Take your time. Let the words settle in.</p>
        <div className="world" aria-hidden="true">{[bank.items[0]!, bank.items[2]!, bank.items[4]!].map((item, i) => <div className={'world-card card-' + i} key={item.id}><Picture item={item}/></div>)}<span className="spark spark-one">✧</span><span className="spark spark-two">✦</span></div>
        <div className="session-note"><span>6 words</span><b>·</b><span>3 little worlds</span><b>·</b><span>your own pace</span></div>
        <button className="primary start" onClick={() => { setPreview(0); setScreen('preview'); play(bank.items[0]!); }}>Let's listen <span aria-hidden="true">↗</span></button>
        <button className="text-button" onClick={startQuiz}>Already familiar? Jump into a round <span aria-hidden="true">→</span></button>
        <div className="history">{historyError ? 'Progress storage is unavailable. Saving may need a retry.' : total ? total + (total === 1 ? ' answer' : ' answers') + ' tucked away on this device' : 'A fresh start. One sound at a time.'}</div>
      </section>}
      {screen === 'preview' && target && <section className="practice fade-in">
        <div className="section-top"><span className="eyebrow">MEET THE WORDS</span><span className="counter">{preview + 1} / {bank.items.length}</span></div>
        <h1 className="practice-title">Look. Listen. Let it sink in.</h1>
        <div className="preview-picture"><Picture item={target}/></div>
        <button className={'listen ' + (playing ? 'playing' : '')} onClick={() => play(target)} aria-label="Replay word"><Speaker/><span>{playing ? 'Listening…' : 'Listen again'}</span></button>
        <p className="hint">Just the picture and the sound.</p>
        {audioError && <p role="alert" className="error">The sound couldn't play. Tap listen again to retry.</p>}
        <div className="preview-dots" aria-label={'Word ' + (preview + 1) + ' of ' + bank.items.length}>{bank.items.map((item, i) => <span key={item.id} className={i === preview ? 'active' : ''}/>)}</div>
        <button className="primary" disabled={audioError} onClick={() => { if (preview + 1 < bank.items.length) { setPreview(preview + 1); play(bank.items[preview + 1]!); } else startQuiz(); }}>{preview + 1 === bank.items.length ? 'Play a round' : 'Next little word'} <span aria-hidden="true">→</span></button>
      </section>}
      {screen === 'quiz' && target && <section className="practice fade-in">
        <div className="section-top"><span className="eyebrow">FOLLOW THE SOUND</span><span className="counter">{index + 1} / {questions.length}</span></div>
        <div className="progress-track" role="progressbar" aria-label="Session progress" aria-valuenow={index} aria-valuemin={0} aria-valuemax={questions.length}><div style={{ width: (index / questions.length * 100) + '%' }}/></div>
        <h1 className="practice-title">Which picture did you hear?</h1>
        <button className={'listen quiz-listen ' + (playing ? 'playing' : '')} onClick={() => play(target)} aria-label="Replay word"><Speaker/><span>{playing ? 'Listening…' : 'Listen again'}</span></button>
        {audioError && <p role="alert" className="error">The sound couldn't play. Tap listen again to retry.</p>}
        <div className="choices">{questions[index]!.choices.map((item, i) => {
          const isCorrect = feedback && item.id === target.id;
          const isWrong = feedback && item.id === feedback.selectedId && !feedback.correct;
          return <button key={item.id} className={'picture-choice ' + (isCorrect ? 'correct ' : '') + (isWrong ? 'incorrect' : '')} aria-label={'Choose picture ' + (i + 1)} disabled={!!feedback || audioError} onClick={() => choose(item)}><Picture item={item}/>{isCorrect && <span className="choice-badge" aria-label="Correct picture">✓</span>}{isWrong && <span className="choice-badge wrong" aria-label="Your choice">↺</span>}</button>;
        })}</div>
        <div className="feedback" aria-live="polite">{feedback ? <><strong>{feedback.correct ? 'You found it.' : 'A new little connection.'}</strong><p>{feedback.correct ? 'That sound is finding a home.' : 'The highlighted picture matches the sound. Give it another listen.'}</p></> : <p className="hint">Listen as often as you like. There's no rush.</p>}</div>
        {saveError && feedback && <div className="error" role="alert"><p>This answer hasn't been saved yet.</p><button className="text-button" onClick={() => void save(feedback)}>Retry saving</button><button className="text-button" onClick={next}>Continue without saving</button></div>}
        {feedback && <button className="primary" disabled={saving || saveError} onClick={next}>{saving ? 'Tucking that away…' : index + 1 === questions.length ? 'See how you did' : 'Next sound'} <span aria-hidden="true">→</span></button>}
      </section>}
      {screen === 'summary' && <section className="summary fade-in">
        <div className="eyebrow">A LITTLE MORE FAMILIAR</div><div className="finish-mark" aria-hidden="true">✧</div>
        <h1>Nicely listened.</h1><p className="intro">Six small sounds.<br/>A few new connections.</p>
        <div className="score"><strong>{correct}<span> / {answers.length}</span></strong><p>pictures found</p></div>
        <div className="summary-pictures">{questions.map(question => <div key={question.target.id}><Picture item={question.target}/><span aria-label={answers.find(answer => answer.itemId === question.target.id)?.correct ? 'Correct' : 'To revisit'}>{answers.find(answer => answer.itemId === question.target.id)?.correct ? '✓' : '↺'}</span></div>)}</div>
        <p className="hint">Every listen counts. Come back whenever you like.</p>
        <button className="primary" onClick={startQuiz}>Another little round <span aria-hidden="true">↗</span></button><button className="text-button" onClick={home}>Back to the beginning</button>
      </section>}
    </main><footer><span>small sounds, growing worlds</span><span aria-hidden="true">✧</span><a href={asset('credits.html')}>Media credits ↗</a></footer>
  </div>;
}
