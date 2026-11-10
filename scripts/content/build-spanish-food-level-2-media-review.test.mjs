import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { inspectFoodLevel2Media, buildFoodLevel2MediaReview } from './build-spanish-food-level-2-media-review.mjs'
import { loadSpanishFoodLevel2Plan } from './generate-spanish-food-level-2.mjs'
import { foodLevel2AudioReviewManifest, foodLevel2NormalizationVerification } from './build-spanish-food-level-2-audio-review.mjs'
const source=fileURLToPath(new URL('../../',import.meta.url)),FOOD='content/spanish-food-2',ART='artifacts/spanish-food-2-art',AUDIO='artifacts/spanish-food-2-audio-review',MEDIA='artifacts/spanish-food-2-media-review'
const hash=b=>createHash('sha256').update(b).digest('hex'),json=async p=>JSON.parse(await readFile(p,'utf8'))
const save=async(root,p,value)=>{await mkdir(dirname(join(root,p)),{recursive:true});await writeFile(join(root,p),Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value,null,2)+'\n')}
function sorted(v){if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])]));return v}
let planPromise
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'food2-media-'));t.after(()=>rm(root,{recursive:true,force:true}))
  const draft=await json(join(source,FOOD,'draft.json')),reuse=await json(join(source,FOOD,'audio-reuse.json')),art=await json(join(source,ART,'manifest.json'))
  const paths=new Set(['content/es-419-voices.json','content/ja.json',...['draft.json','proposal-v1.json','generation-approval.json','artwork-revisions-v1.json','artwork-acceptance.json','audio-config.json','audio-approval.json','audio-reuse.json'].map(f=>FOOD+'/'+f),ART+'/manifest.json'])
  for(const p of Object.keys(art.inputHashes))paths.add(p)
  for(const i of art.images){paths.add(i.path);if(i.record)paths.add(i.record)}
  for(const s of reuse.sources)for(const k of ['bank','activation','acceptance'])paths.add(s[k])
  for(const c of reuse.clips)paths.add(c.path)
  for(const p of paths){await mkdir(dirname(join(root,p)),{recursive:true});await copyFile(join(source,p),join(root,p))}
  const{plan,approval}=structuredClone(await(planPromise??=loadSpanishFoodLevel2Plan(source))),identity=hash(JSON.stringify(plan))
  const originals=plan.items.flatMap(item=>plan.voices.map(v=>({...item,voice:v.voice,voiceId:v.id,voiceName:v.name,model:plan.model,request:{text:item.text,model_id:plan.model,language_code:'es',voice_settings:plan.voiceSettings},planIdentity:identity,file:`originals/${v.voice}/${item.id}.mp3`,sha256:'1'.repeat(64),bytes:100})))
  const profile={version:1,targetLufs:-22,truePeakCeilingDbtp:-2,maxBoostDb:9,rate:44100,bitrate:'128k',dualMono:true,shortClipAnalysis:'pad-to-500ms-only-for-measurement'}
  const deliveries=originals.map(o=>{const data=Buffer.from('fixture-delivery:'+o.voice+':'+o.id);return{...structuredClone(o),file:o.file.slice(10),originalFile:o.file,originalSha256:o.sha256,sourceRecordSha256:hash(JSON.stringify(sorted(o))),profile,after:{integratedLufs:-22,truePeakDbtp:-3,analysisPadding:false,measurementMethod:'r128'},decodedFrames:44100,deliverySha256:hash(data),deliveryBytes:data.length,targetLimited:false,limitingReasons:[],gainDb:0}})
  const generated=foodLevel2AudioReviewManifest(plan,approval,originals,deliveries)
  for(const c of generated.clips)await save(root,AUDIO+'/'+c.file,Buffer.from('fixture-delivery:'+c.voice+':'+c.id))
  const summary={profile,clips:248,resumed:0,targetLimited:0,shortClipMeasurements:0,originalsPreserved:true,processing:'Constant gain; each delivered MP3 encoded directly from its provider original. No dynamics compression, trimming, or timing changes.'}
  await save(root,AUDIO+'/manifest.json',generated);await save(root,AUDIO+'/normalization-summary.json',summary)
  const normalization=foodLevel2NormalizationVerification(generated,await readFile(join(root,AUDIO,'normalization-summary.json')))
  await save(root,AUDIO+'/normalization-verification.json',normalization)
  return{root,draft,reuse,generated,art,summary}
}
const outputs=root=>Promise.all([MEDIA+'/manifest.json',MEDIA+'/index.html',FOOD+'/media-review.html'].map(p=>readFile(join(root,p))))

test('complete Food2 review combines36 accepted pictures with248 new and40 unchanged recordings without copying reusable deliveries',async t=>{
  const{root,draft,reuse,generated}=await fixture(t),protectedPaths=[ART+'/manifest.json',FOOD+'/artwork-acceptance.json',FOOD+'/artwork-revisions-v1.json',FOOD+'/draft.json',FOOD+'/audio-approval.json',FOOD+'/audio-reuse.json',AUDIO+'/manifest.json']
  const before=await Promise.all(protectedPaths.map(p=>readFile(join(root,p))))
  const inspected=await inspectFoodLevel2Media(root);await assert.rejects(readFile(join(root,MEDIA,'manifest.json')),{code:'ENOENT'})
  assert.equal(inspected.images.length,36);assert.equal(inspected.words,36);assert.equal(inspected.clips.length,288);assert.equal(inspected.newRecordings,248);assert.equal(inspected.reusedRecordings,40)
  assert.equal(inspected.clips.filter(c=>c.source==='new-generation').length,248);assert.equal(inspected.clips.filter(c=>c.source==='accepted-reuse').length,40);assert.equal(new Set(inspected.clips.map(c=>c.id+':'+c.voice)).size,288)
  assert.deepEqual(inspected.items.map(i=>i.id),draft.items.map(i=>i.id));assert.equal(inspected.images.find(i=>i.id==='es-419-travel-drinking-glass').path,ART+'/originals/glass-v1.png')
  for(const c of reuse.clips)assert.equal(inspected.clips.find(i=>i.id===c.id&&i.voice===c.voice).path,c.path)
  for(const c of generated.clips)assert.equal(inspected.clips.find(i=>i.id===c.id&&i.voice===c.voice).path,AUDIO+'/'+c.file)
  assert.equal(inspected.normalizationEvidence.clips,248);assert.equal(inspected.inputs[AUDIO+'/normalization-summary.json'],hash(await readFile(join(root,AUDIO,'normalization-summary.json'))))
  assert.equal(inspected.artworkStatus,'accepted');assert.equal(inspected.listeningStatus,'pending');assert.equal(inspected.runtimeActivationAuthorized,false)
  assert.deepEqual(await buildFoodLevel2MediaReview(root),inspected)
  const html=await readFile(join(root,FOOD,'media-review.html'),'utf8');assert.equal((html.match(/<article /g)??[]).length,36);assert.equal((html.match(/<img /g)??[]).length,36);assert.equal((html.match(/<audio controls /g)??[]).length,288)
  assert.equal((html.match(/<audio controls data-source="new-generation"/g)??[]).length,248);assert.equal((html.match(/<audio controls data-source="accepted-reuse"/g)??[]).length,40)
  assert.match(html,/248 new recordings and 40 unchanged accepted reuses/);assert.match(html,/Food listening approval is pending; this pack is not active/);assert.match(html,/Food level 2/)
  for(const id of ['search','group','audio-source','region','voice','sequence','stop'])assert.ok(html.includes(`id="${id}"`))
  assert.ok(html.includes('../../public/audio/es-419-travel-2/'));assert.ok(html.includes('../../'+AUDIO+'/audio/'));assert.ok(html.includes('Mexico City, Mexico'));assert.ok(html.includes('New recordings only'))
  assert.deepEqual(await Promise.all(protectedPaths.map(p=>readFile(join(root,p)))),before);await assert.rejects(readFile(join(root,MEDIA,'audio',reuse.clips[0].voice,reuse.clips[0].id+'.mp3')),{code:'ENOENT'})
})

test('changed request/profile/normalization/last recording/accepted reuse provenance fails before any complete-gallery rewrite',async t=>{
  const{root,reuse,generated}=await fixture(t);await buildFoodLevel2MediaReview(root);const before=await outputs(root),manifestPath=AUDIO+'/manifest.json',originalManifest=await readFile(join(root,manifestPath))
  const unchanged=async pattern=>{await assert.rejects(buildFoodLevel2MediaReview(root),pattern);assert.deepEqual(await outputs(root),before)}
  for(const mutate of [m=>{m.clips.at(-1).request.text='wrong'},m=>{m.clips.at(-1).after.truePeakDbtp=0},m=>{m.clips[1]=m.clips[0]},m=>{m.audioApprovalSha256='0'.repeat(64)},m=>{m.status='accepted'}]){const m=JSON.parse(originalManifest);mutate(m);await save(root,manifestPath,m);await unchanged(/recording identity or playback profile|review matrix or authorization|generated audio input bindings/);await save(root,manifestPath,originalManifest)}
  const lastPath=AUDIO+'/'+generated.clips.at(-1).file,last=await readFile(join(root,lastPath));await save(root,lastPath,'changed final delivery');await unchanged(/New Food recording bytes/);await save(root,lastPath,last)
  for(const p of [AUDIO+'/normalization-summary.json',AUDIO+'/normalization-verification.json']){const original=await readFile(join(root,p));await save(root,p,original.toString()+' ');if(p.includes('summary'))await unchanged(/normalization verification binding/);else{const changed=JSON.parse(original);changed.clips=247;await save(root,p,changed);await unchanged(/normalization verification binding/)}await save(root,p,original)}
  const summaryPath=AUDIO+'/normalization-summary.json',summaryBytes=await readFile(join(root,summaryPath)),summary=JSON.parse(summaryBytes);summary.profile.targetLufs=-12;await save(root,summaryPath,summary);await unchanged(/normalization summary differs/);await save(root,summaryPath,summaryBytes)
  const existingPath=reuse.clips.at(-1).path,existingBytes=await readFile(join(root,existingPath));await save(root,existingPath,'changed accepted recording');await unchanged(/Accepted reused audio bytes|Accepted reused Food recording bytes/);await save(root,existingPath,existingBytes)
  const bankPath=reuse.sources[0].bank,bankBytes=await readFile(join(root,bankPath)),bank=JSON.parse(bankBytes);bank.items.find(i=>i.id===reuse.items[0].id).text='wrong';await save(root,bankPath,bank);await unchanged(/existing Spanish reuse identity|Accepted reused audio provenance/);await save(root,bankPath,bankBytes)
  const approvalPath=FOOD+'/audio-approval.json',approval=await readFile(join(root,approvalPath));await save(root,approvalPath,approval.toString()+' ');await unchanged(/authorized audio approval bytes/);await save(root,approvalPath,approval)
  await rm(join(root,manifestPath));await unchanged({code:'ENOENT'});await save(root,manifestPath,originalManifest)
})

test('source and late output symlinks preserve prior galleries and never write through unrelated targets',async t=>{
  const{root,reuse}=await fixture(t);await buildFoodLevel2MediaReview(root);const before=await outputs(root)
  const path=reuse.clips[0].path,original=await readFile(join(root,path));await save(root,'same-audio.mp3',original);await rm(join(root,path));await symlink(join(root,'same-audio.mp3'),join(root,path));await assert.rejects(buildFoodLevel2MediaReview(root),/symlinks/);assert.deepEqual(await outputs(root),before);await rm(join(root,path));await save(root,path,original)
  await save(root,'sentinel.html','unchanged');await rm(join(root,FOOD,'media-review.html'));await symlink(join(root,'sentinel.html'),join(root,FOOD,'media-review.html'))
  await assert.rejects(buildFoodLevel2MediaReview(root),/symlinks/);assert.deepEqual((await outputs(root)).slice(0,2),before.slice(0,2));assert.equal(await readFile(join(root,'sentinel.html'),'utf8'),'unchanged')
})
