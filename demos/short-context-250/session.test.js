import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { questions } from './dist/questions.js';
import { illustration } from './dist/artwork.js';
import { selectAnswer, summarize } from './dist/session.js';

test('first answers stay fixed when a prompt is revisited', () => {
  const q=questions[0];
  const original={};
  const answered=selectAnswer(q,'apples-3',original);
  assert.deepEqual(original,{});
  assert.equal(answered.hitotsu,'apples-3');
  assert.equal(selectAnswer(q,q.correct,answered),answered);
  assert.throws(()=>selectAnswer(q,'unknown',original),/Unknown answer/);
});
test('summary distinguishes matched, incorrect and skipped prompts', () => {
  const answers={hitotsu:questions[0].correct,ue:'box-above'};
  assert.deepEqual(summarize(questions,answers),{answered:2,correct:1,total:10});
  assert.deepEqual(summarize(questions,{}),{answered:0,correct:0,total:10});
});
test('review bank contains the frozen random sample, four distinct cards, and audio', () => {
  assert.deepEqual(questions.map(q=>q.word),['一つ','力いっぱい','上','山','大人','七つ','川','大した','九つ','二つ']);
  assert.equal(new Set(questions.map(q=>q.id)).size,10);
  for(const q of questions){
    assert.equal(q.choices.length,4);
    assert.equal(new Set(q.choices.map(c=>c.id)).size,4);
    assert.equal(q.choices.filter(c=>c.id===q.correct).length,1);
    assert.ok(existsSync(new URL(`./dist/audio/${q.id}.mp3`,import.meta.url)),q.id);
    assert.ok(q.sentence.length<=20,`Keep ${q.id} short`);
    if(q.question)assert.ok(q.question.length<=12,`Keep ${q.id} question short`);
    assert.equal(new Set(q.choices.map(c=>illustration(c.art))).size,4,`${q.id} illustrations must differ`);
  }
});
test('quantity illustrations contain exactly the spoken or contrasted counts', () => {
  for(const q of questions){
    for(const c of q.choices.filter(c=>c.art.type==='count')){
      assert.equal((illustration(c.art).match(/data-counted-item=/g)||[]).length,c.art.count,`${q.id}: ${c.id}`);
    }
  }
});
