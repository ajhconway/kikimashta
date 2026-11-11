import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PracticeHeader } from '@app/components/PracticeChrome';
import { themeColors } from '@app/themes';
import '@app/styles.css';
import '@app/components/ContextualQuiz.css';
import bank from '@content/contextual/short-level-1/bank.json';
import './drafts.css';

type Card = typeof bank.cards[number];
const cards = new Map(bank.cards.map(card => [card.id, card]));
const imageSrc = (card: Card) => card.image ? card.source.kind === 'demo-250'
  ? `images/${card.id}.png` : `draft-images/${card.image.path.split('/').at(-1)}` : undefined;
const usage = new Map(bank.cards.map(card => [card.id, bank.prompts.filter(p => p.cardIds.includes(card.id))]));

function CardPreview({ card, correct = false, reveal = false }: { card: Card; correct?: boolean; reveal?: boolean }) {
  const image = imageSrc(card);
  return <figure className="draft-card" data-card-id={card.id}>
    <div className={`answer-choice picture-choice draft-picture${correct && reveal ? ' correct' : ''}`}>
      {image ? <img src={image} alt={card.label} loading="lazy"/> : <div className="draft-art-brief"><strong>Artwork needed</strong><span>{card.label}</span></div>}
      {correct && reveal && <span className="choice-badge" aria-label="Correct answer">✓</span>}
    </div>
    <figcaption>{card.label}<small>{usage.get(card.id)!.length} uses · {card.source.status === 'previously-approved' ? 'Existing approved image' : card.kind === 'planned-image' ? 'Shared artwork concept' : 'Image awaiting review'}</small></figcaption>
  </figure>;
}

function Drafts() {
  const [word, setWord] = useState('all');
  const [view, setView] = useState<'questions' | 'cards'>('questions');
  const [reveal, setReveal] = useState(false);
  const words = bank.words.filter(w => word === 'all' || w.id === word);
  useEffect(() => { document.documentElement.style.setProperty('--screen-background', themeColors.contextualQuiz); }, []);
  return <div className="app app-draft-review" data-theme="contextualQuiz">
    <PracticeHeader language="Japanese" onHome={() => { location.href = './'; }}/>
    <main className="draft-review">
      <h1>Level 1 · Short contexts</h1>
      <p>37 words · 2 each · 74 prompts</p>
      <p className="block-note">Full text and shared-card draft. 56 existing images and 13 shared artwork concepts. New audio has not been generated.</p>
      <div className="draft-controls">
        <label>Word <select aria-label="Word" value={word} onChange={e => setWord(e.target.value)}><option value="all">All 37 words</option>{bank.words.map(w => <option key={w.id} value={w.id}>{w.text}（{w.reading}）</option>)}</select></label>
        <button className="text-button" onClick={() => setView(v => v === 'questions' ? 'cards' : 'questions')}>{view === 'questions' ? 'Show shared cards' : 'Show questions'}</button>
        <label><input type="checkbox" checked={reveal} onChange={e => setReveal(e.target.checked)}/> Show correct answers</label>
      </div>
      {view === 'questions' ? words.map(w => <section className="draft-word" key={w.id} data-word-id={w.id}>
        <h2 lang="ja">{w.text} <small>{w.reading}</small></h2><p>{w.meaning}</p>
        {bank.prompts.filter(p => p.targetItemId === w.id).map(p => <article className="draft-prompt" key={p.id} data-prompt-id={p.id}>
          <h3>Example {p.variant}</h3>
          <p lang="ja" className="contextual-japanese">{p.sentence.text}</p><p lang="ja" className="draft-reading">{p.sentence.reading}</p><p>{p.sentence.meaning}</p>
          {p.question && <><p lang="ja" className="contextual-japanese">{p.question.text}</p><p lang="ja" className="draft-reading">{p.question.reading}</p><p>{p.question.meaning}</p></>}
          <div className="draft-choices">{p.cardIds.map(id => <CardPreview key={id} card={cards.get(id)!} correct={p.correctCardId === id} reveal={reveal}/>)}</div>
          <p className="draft-set">Shared set: {p.answerSetId} · {p.cardIds.filter(id => cards.get(id)?.kind === 'planned-image').length ? 'Includes planned artwork' : 'Existing images'}</p>
          {p.reviewNote && <details><summary>Review note</summary><p>{p.reviewNote}</p></details>}
        </article>)}
      </section>) : <section className="draft-inventory"><h2>69 cards · 296 answer slots</h2><p>Every card appears at least twice. 55 cards are shared across different words. Each source is reused unchanged, including its approval status.</p>
        {bank.cards.filter(c => word === 'all' || usage.get(c.id)!.some(p => p.targetItemId === word)).map(card => <article className="draft-card-record" key={card.id}>
          <CardPreview card={card}/><div><h3>{card.label}</h3><code>{card.id}</code><p>Words: {[...new Set(usage.get(card.id)!.map(p => bank.words.find(w => w.id === p.targetItemId)!.text))].join('、')}</p>
          <p>{usage.get(card.id)!.filter(p => p.correctCardId === card.id).length} correct · {usage.get(card.id)!.filter(p => p.correctCardId !== card.id).length} distractor</p>
          {card.brief && <p>{card.brief}</p>}</div>
        </article>)}
      </section>}
      <p className="block-note">Drafts for review. Previously approved practice, progress and media remain unchanged.</p>
      <p><a href="level1-bank.json">Complete question and card source</a> · <a href="level1-reuse.json">Reuse inventory</a> · <a href="./">Play the original ten examples</a></p>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<Drafts/>);
