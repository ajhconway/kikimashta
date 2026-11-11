import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ContextualQuiz } from '@app/components/ContextualQuiz';
import { MasteryFeedback } from '@app/components/MasteryFeedback';
import { PracticeHeader, QuizProgress } from '@app/components/PracticeChrome';
import { themeColors, quizFeedbackColors } from '@app/themes';
import type { PracticeAttempt } from '@app/types';
import '@app/styles.css';
import { demoQuestion, drafts, voices, type DemoVoice } from './bank';

function Demo() {
  const [index, setIndex] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, PracticeAttempt>>({});
  const [finished, setFinished] = useState(false);
  const [voice, setVoice] = useState<DemoVoice>('otani');
  const startedAt = useRef(Date.now());
  const question = useMemo(() => index === null ? null : demoQuestion(index, voice), [index, voice]);
  const feedback = question ? answers[question.target.id] ?? null : null;
  const response = feedback ? feedback.correct ? 'correct' : 'incorrect' : undefined;
  const background = question ? response ? quizFeedbackColors[response] : themeColors.contextualQuiz
    : finished ? themeColors.home : themeColors.pictureQuiz;
  const score = Object.values(answers).filter(a => a.correct).length;
  const mistakes = Object.values(answers).filter(a => !a.correct).length;
  useEffect(() => { document.documentElement.style.setProperty('--screen-background', background); }, [background]);

  function present(nextIndex: number) { startedAt.current = Date.now(); setIndex(nextIndex); setFinished(false); }
  function next() { if (index === drafts.length - 1) { setIndex(null); setFinished(true); } else present((index ?? -1) + 1); }
  const screen = question ? 'quiz' : finished ? 'summary' : 'ready';
  return <div className={`app app-${screen}`} data-theme={question ? 'contextualQuiz' : finished ? 'home' : 'pictureQuiz'} data-answer={response}>
    <PracticeHeader language="Japanese" onHome={() => { setIndex(null); setFinished(false); }}/>
    <main>
      {question ? <section className="practice contextual-practice" data-exercise="context-simple-picture">
        <span className="sr-only" aria-live="polite">Question {(index ?? 0) + 1} of {drafts.length}</span>
        <ContextualQuiz key={index} question={question} feedback={feedback} continueAfterCorrect onContinue={next}
          onChoose={choice => {
            const now = Date.now();
            const attempt: PracticeAttempt = { id: `demo-${question.target.id}`, sessionId: 'short-context-review', itemId: question.target.id,
              language: 'ja-JP', choiceIds: question.choices.map(c => c.id), selectedId: choice.id,
              correct: choice.id === question.contextual!.question.correctOptionId,
              outcome: choice.id === question.contextual!.question.correctOptionId ? 'success' : 'failure',
              startedAt: startedAt.current, answeredAt: now, responseMs: now - startedAt.current };
            setAnswers(previous => previous[question.target.id] ? previous : { ...previous, [question.target.id]: attempt });
          }}
          feedbackContent={<MasteryFeedback current={{ label: 'New', timerMs: null, demo: true }} outcome={feedback?.outcome ?? null}/>}/>
        <QuizProgress total={drafts.length} completed={index ?? 0} mistakes={mistakes}/>
      </section> : <section className="summary ready">
        <div className="finish-companion" aria-hidden="true"><img src="/brand/kikimashta-cat-v1.png" alt=""/></div>
        <h1>{finished ? 'Nice listening!' : 'Review Time!'}</h1>
        <p className="block-note">{finished ? `${score} of ${drafts.length} matched on the first try` : '10 short contextual questions · Picture answers'}</p>
        <label className="text-button">Voice <select aria-label="Voice" value={voice} onChange={event => setVoice(event.target.value as DemoVoice)}>
          {voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select></label>
        <button className="primary" onClick={() => { setAnswers({}); present(0); }}>{finished ? 'Try again' : 'Begin review'}<span aria-hidden="true">→</span></button>
        <label className="text-button">Review one prompt <select aria-label="Review one prompt" value="" onChange={event => { if(event.target.value !== '') present(Number(event.target.value)); }}>
          <option value="">Choose a word</option>{drafts.map((draft,i) => <option key={draft.id} value={i}>{i+1}. {draft.word}（{draft.reading}）</option>)}
        </select></label>
        <p className="block-note">Answers stay in this demo. New artwork is awaiting your review.</p>
        <a className="text-button" href="/artwork.html">Review artwork and source records</a>
        <a className="text-button" href="/audio-provenance-v3.json">Audio source records</a>
        <a className="text-button" href="/drafts.html">Review all 74 level 1 drafts</a>
      </section>}
    </main>
    <footer><span>Short context demo</span><a href="https://github.com/ajhconway/kikimashta/pull/251">Source</a></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<Demo/>);
