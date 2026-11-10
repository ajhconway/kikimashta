import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const questions=JSON.parse(readFileSync(new URL('./source/questions.json',import.meta.url)));
const artwork=JSON.parse(readFileSync(new URL('./artwork-v2/manifest.json',import.meta.url)));

test('every answer uses its reviewed raster source and matching immutable hash',()=>{
  assert.equal(questions.length,10);
  assert.equal(questions.flatMap(q=>q.choices).length,40);
  for(const q of questions){
    assert.equal(q.choices.length,4);
    assert.equal(new Set(q.choices.map(c=>c.id)).size,4);
    assert.equal(q.choices.filter(c=>c.id===q.correct).length,1);
    for(const choice of q.choices){
      const art=artwork.assets.find(a=>a.id===choice.id);
      assert.ok(art,choice.id);
      const path=new URL(`./public/images/${choice.id}.png`,import.meta.url);
      assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),art.sha256);
      assert.ok(art.visualReview,choice.id);
      if(art.origin==='generated')assert.equal(art.status,'pending-owner-review');
      else assert.ok(art.approvalEvidence,choice.id);
    }
    assert.ok(existsSync(new URL(`./public/audio/${q.id}-sentence.mp3`,import.meta.url)));
    if(q.question)assert.ok(existsSync(new URL(`./public/audio/${q.id}-question.mp3`,import.meta.url)));
  }
});
