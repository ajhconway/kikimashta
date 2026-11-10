import { questions } from './questions.js';
import { illustration } from './artwork.js';
import { selectAnswer, summarize } from './session.js';

const $ = id => document.getElementById(id);
let index = 0;
let answers = {};
let playback = null;
let playbackToken = 0;

function stopAudio() {
  playbackToken++;
  if (playback) { playback.pause(); playback.removeAttribute('src'); playback.load(); playback.remove(); playback = null; }
  $('play').classList.remove('playing');
  $('companion').classList.remove('is-listening');
  $('play').querySelector('span').textContent = 'Listen';
  $('audio-status').textContent = '';
}

async function play() {
  stopAudio();
  const token = playbackToken;
  const audio = new Audio(`./audio/${questions[index].id}.mp3`);
  audio.hidden = true;
  document.body.append(audio);
  playback = audio;
  audio.playbackRate = $('slow').checked ? .8 : 1;
  audio.preservesPitch = true;
  $('play').classList.add('playing');
  $('companion').classList.add('is-listening');
  $('play').querySelector('span').textContent = 'Replay';
  $('audio-status').textContent = 'Listening…';
  audio.onended = () => { if (token === playbackToken) stopAudio(); };
  const failed = () => {
    if (token !== playbackToken) return;
    stopAudio();
    $('audio-status').textContent = 'Audio could not play. Tap Listen to retry, or read the prompt below.';
    $('transcript').open = true;
  };
  audio.onerror = failed;
  try { await audio.play(); } catch { failed(); }
}

function renderProgress() {
  $('progress').replaceChildren(...questions.map((q,i) => {
    const button = document.createElement('button');
    const answered = Object.hasOwn(answers, q.id);
    button.className = `${i===index?'current ':''}${answered ? answers[q.id] === q.correct ? 'done' : 'wrong' : ''}`;
    button.setAttribute('aria-label', `Question ${i+1}${answered ? ', answered' : ''}`);
    if(i===index)button.setAttribute('aria-current','step');
    button.addEventListener('click', () => navigate(i));
    return button;
  }));
}

function render() {
  const q = questions[index];
  const answered = Object.hasOwn(answers, q.id);
  const correct = answers[q.id] === q.correct;
  document.body.dataset.answer = answered ? correct ? 'correct' : 'incorrect' : '';
  $('companion').classList.toggle('is-cheering', answered && correct);
  $('companion').classList.toggle('is-encouraging', answered && !correct);
  $('practice').hidden = false;
  $('summary').hidden = true;
  $('counter').innerHTML = `${String(index+1).padStart(2,'0')} <span>/ 10</span>`;
  $('prompt-help').textContent = q.question ? 'Listen to the scene and its question.' : 'Listen to the sentence. Match the picture.';
  $('word').textContent = `${q.word} · ${q.reading}`;
  $('sentence').textContent = q.sentence;
  $('sentence-kana').textContent = q.kana;
  $('question').textContent = q.question || '';
  $('question-kana').textContent = q.questionKana || '';
  $('question').hidden = !q.question;
  $('question-kana').hidden = !q.question;
  $('sentence-english').textContent = q.english;
  $('question-english').textContent = q.questionEnglish || '';
  $('question-english').hidden = !q.question;
  $('review-note').textContent = q.note || '';
  $('review-note').hidden = !q.note;
  $('choices').replaceChildren(...q.choices.map((choice,i) => {
    const button = document.createElement('button');
    button.className = 'answer-card';
    button.setAttribute('aria-label', `Answer ${i+1}: ${choice.label}`);
    button.dataset.choice = choice.id;
    button.innerHTML = illustration(choice.art) + `<span class="key" aria-hidden="true">${i+1}</span>`;
    if(answered){
      button.disabled = true;
      if(choice.id===q.correct){button.classList.add('correct');button.innerHTML+='<span class="result-mark" aria-hidden="true">✓</span>';}
      else if(choice.id===answers[q.id]){button.classList.add('incorrect');button.innerHTML+='<span class="result-mark" aria-hidden="true">×</span>';}
      else button.classList.add('dimmed');
    }
    button.addEventListener('click', () => answer(choice.id));
    return button;
  }));
  const feedback=$('feedback');
  feedback.className=answered ? correct ? 'good' : 'miss' : '';
  feedback.replaceChildren();
  const icon=document.createElement('span');icon.className='feedback-icon';icon.setAttribute('aria-hidden','true');icon.textContent=answered ? correct ? '✓' : '↗' : '✧';
  const text=document.createElement('span');
  if(answered){const title=document.createElement('strong');title.textContent=correct?'That’s it!':'Not quite. Here’s the match.';text.append(title,document.createTextNode(q.choices.find(c=>c.id===q.correct).label));}
  else text.textContent='One short scene at a time.';
  feedback.append(icon,text);
  $('previous').disabled=index===0;
  $('skip').hidden=answered;
  $('next').disabled=!answered;
  $('next').innerHTML=index===questions.length-1?'Finish <span aria-hidden="true">✓</span>':'Next <span aria-hidden="true">→</span>';
  renderProgress();
}

function answer(choiceId) {
  const q=questions[index];
  if(Object.hasOwn(answers,q.id))return;
  answers=selectAnswer(q,choiceId,answers);
  stopAudio();
  render();
  $('next').focus({preventScroll:true});
}

function navigate(nextIndex) {
  stopAudio();
  index=nextIndex;
  $('transcript').open=false;
  $('english-toggle').checked=false;
  $('translation').hidden=true;
  render();
  $('prompt-title').focus({preventScroll:true});
}

function finish() {
  stopAudio();
  document.body.dataset.answer = '';
  $('practice').hidden=true;
  $('summary').hidden=false;
  const score=summarize(questions,answers);
  $('summary-score').textContent=`${score.correct} matched on the first try · ${score.total-score.answered} skipped. You can revisit any prompt below.`;
  $('summary-list').replaceChildren(...questions.map((q,i)=>{
    const button=document.createElement('button');button.className='summary-item';
    const word=document.createElement('span');word.lang='ja';word.textContent=q.word;
    const reading=document.createElement('small');reading.lang='ja';reading.textContent=q.reading;
    const result=document.createElement('span');result.className='summary-result';result.textContent=!Object.hasOwn(answers,q.id)?'Skipped':answers[q.id]===q.correct?'✓ Matched':'Review';
    button.append(word,reading,result);button.setAttribute('aria-label',`Review ${q.word}: ${result.textContent}`);button.addEventListener('click',()=>navigate(i));return button;
  }));
  $('summary-title').focus();
}

$('play').addEventListener('click',play);
$('slow').addEventListener('change',()=>{if(playback)playback.playbackRate=$('slow').checked?.8:1;});
$('english-toggle').addEventListener('change',()=>{$('translation').hidden=!$('english-toggle').checked;});
$('previous').addEventListener('click',()=>navigate(index-1));
$('next').addEventListener('click',()=>{if(index===questions.length-1)finish();else navigate(index+1);});
$('skip').addEventListener('click',()=>{if(index===questions.length-1)finish();else navigate(index+1);});
$('restart').addEventListener('click',()=>{answers={};navigate(0);});
document.addEventListener('keydown',event=>{
  if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)||$('practice').hidden)return;
  if(/^[1-4]$/.test(event.key)){
    event.preventDefault();answer(questions[index].choices[Number(event.key)-1].id);
  }
});
window.addEventListener('pagehide',stopAudio);
render();
