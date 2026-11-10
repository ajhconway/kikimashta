import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  }
});

test('all thirty-two demo clips bind to processed ElevenLabs deliveries and exact prompt text',()=>{
  const provenance=JSON.parse(readFileSync(new URL('./public/audio-provenance-v3.json',import.meta.url)));
  assert.equal(provenance.recordings.length,32);
  assert.deepEqual(provenance.plan.generation.voices.map(v=>v.voice),['otani','morioki']);
  for(const voice of ['otani','morioki'])for(const q of questions)for(const kind of ['sentence','question']){
    if(!q[kind])continue;
    const id=`ja-short-demo-${q.id}-${kind}`;
    const record=provenance.recordings.find(r=>r.voice===voice&&r.id===id);
    assert.ok(record,id);
    assert.equal(record.text,q[kind]);
    assert.equal(record.model,'eleven_v4');
    assert.equal(record.profile.targetLufs,-22);
    assert.ok(record.after.truePeakDbtp<=-2);
    assert.ok(record.decodedFrames>0);
    const bytes=readFileSync(new URL(`./public/audio/${record.file}`,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),record.deliverySha256);
  }
});
