import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { inspectFoodLevel2Art, buildFoodLevel2ArtReview } from './build-spanish-food-level-2-art-review.mjs'
const source = fileURLToPath(new URL('../../',import.meta.url)), FOOD='content/spanish-food-2', ART='artifacts/spanish-food-2-art'
const hash=b=>createHash('sha256').update(b).digest('hex'), json=async p=>JSON.parse(await readFile(p,'utf8'))
const save=async(root,p,value)=>{await mkdir(dirname(join(root,p)),{recursive:true});await writeFile(join(root,p),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2)+'\n')}
// Small compressed PNG fixtures exercise the real pixel/CRC validator without duplicating generated artwork.
function png(width=1024,height=1024,alpha=true){
  const chunk=(type,data)=>{const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,8+data.length)),8+data.length);return b}
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6
  const pixels=Buffer.alloc((width*4+1)*height)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const n=y*(width*4+1)+1+x*4;pixels[n]=120;pixels[n+1]=50;pixels[n+2]=190;pixels[n+3]=!alpha||x>width/2?255:0}
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))])
}
const testPng=png()
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'food2-art-review-'));t.after(()=>rm(root,{recursive:true,force:true}))
  const draft=await json(join(source,FOOD,'draft.json')),requests=await json(join(source,ART,'requests.json'))
  const paths=[FOOD+'/draft.json',FOOD+'/proposal-v1.json',FOOD+'/generation-approval.json',ART+'/requests.json',ART+'/selection.json','content/es-419-travel-2.json','content/spanish-travel-2/activation.json','content/spanish-travel-2/acceptance.json',requests.requests[0].referencePath,...draft.items.filter(i=>i.artwork.source==='approved-reuse').map(i=>i.artwork.path)]
  for(const p of new Set(paths)){await mkdir(dirname(join(root,p)),{recursive:true});await copyFile(join(source,p),join(root,p))}
  await save(root,ART+'/selection.json',{issue:231,pack:'es-419-food-2',versions:{}})
  return{root,draft,requests:requests.requests,inputs:paths}
}
async function generated(root,q,data=testPng){
  const path=`originals/${q.slug}-v1.png`,record={id:q.id,slug:q.slug,version:1,path,tool:'built-in image_gen',sha256:hash(data),promptSha256:hash(q.prompt),referenceSha256:q.referenceSha256}
  await save(root,ART+'/'+path,data);await save(root,`${ART}/records/${q.slug}-v1.json`,record);return record
}
const outputs=root=>Promise.all([ART+'/manifest.json',ART+'/review.html',ART+'/artwork.html',FOOD+'/review.html'].map(p=>readFile(join(root,p))))

test('read-only pending state becomes exact36-picture review while original inputs and shared Spanish identities remain unchanged',async t=>{
  const{root,draft,requests,inputs}=await fixture(t),before=await Promise.all(inputs.map(p=>readFile(join(root,p))))
  const pending=await inspectFoodLevel2Art(root)
  assert.equal(pending.words,36);assert.equal(pending.generatedImages,0);assert.equal(pending.reusedImages,5);assert.equal(pending.pendingImages,31);assert.equal(pending.status,'artwork-generation-in-progress')
  await assert.rejects(readFile(join(root,ART,'manifest.json')),{code:'ENOENT'})
  await buildFoodLevel2ArtReview(root)
  let html=await readFile(join(root,FOOD,'review.html'),'utf8');assert.equal((html.match(/<article /g)??[]).length,36);assert.equal((html.match(/<img /g)??[]).length,5);assert.match(html,/Generation is in progress; the complete pack will be reviewed together/)
  for(const q of requests)await generated(root,q)
  const detailedPath=`${ART}/records/${requests[0].slug}-v1.json`,detailed=await json(join(root,detailedPath))
  await save(root,detailedPath,{...detailed,bytes:testPng.length,width:1024,height:1024,referenceRole:'style-only',referencePath:requests[0].referencePath})
  const complete=await buildFoodLevel2ArtReview(root)
  assert.equal(complete.generatedImages,31);assert.equal(complete.reusedImages,5);assert.equal(complete.pendingImages,0);assert.equal(complete.status,'generated-awaiting-owner-artwork-review')
  assert.equal(complete.audioGenerationAuthorized,false);assert.equal(complete.runtimeActivationAuthorized,false)
  assert.deepEqual(complete.images.map(i=>i.id),draft.items.map(i=>i.id));assert.deepEqual(complete.images.filter(i=>i.source==='approved-reuse').map(i=>i.id),draft.items.filter(i=>i.membership==='existing-spanish-item').map(i=>i.id))
  assert.equal(new Set(complete.images.map(i=>i.id)).size,36)
  html=await readFile(join(root,FOOD,'review.html'),'utf8');assert.equal((html.match(/<img /g)??[]).length,36);assert.match(html,/All 36 pictures are ready for consolidated owner review/);assert.doesNotMatch(html,/<audio|Picture generation pending/)
  for(const id of ['search','group','source'])assert.ok(html.includes(`id="${id}"`));assert.ok(html.includes('../../'+ART+'/requests.json'))
  assert.deepEqual(await Promise.all(inputs.map(p=>readFile(join(root,p)))),before)
  // A record removed during generation is pending, without silently retaining stale gallery media.
  await rm(join(root,ART,'records',requests[0].slug+'-v1.json'));const partial=await buildFoodLevel2ArtReview(root);assert.equal(partial.pendingImages,1);assert.equal(partial.images[0].source,'pending');assert.equal(partial.images[0].path,undefined)
})

test('changed authorization, proposals, request/reference and reused sources fail before any gallery rewrite',async t=>{
  const{root,draft,requests}=await fixture(t);await buildFoodLevel2ArtReview(root);const before=await outputs(root)
  const unchanged=async pattern=>{await assert.rejects(buildFoodLevel2ArtReview(root),pattern);assert.deepEqual(await outputs(root),before)}
  for(const p of [FOOD+'/generation-approval.json',FOOD+'/proposal-v1.json',FOOD+'/draft.json',ART+'/requests.json']){
    const old=await readFile(join(root,p));await save(root,p,old.toString()+' ');await unchanged(/authorization or approved input bytes/);await save(root,p,old)
  }
  const selection=ART+'/selection.json',oldSelection=await readFile(join(root,selection));await save(root,selection,{issue:231,pack:'es-419-food-2',versions:{[requests[0].slug]:2}});await unchanged(/selected version scope/);await save(root,selection,oldSelection)
  const style=requests[0].referencePath,styleBytes=await readFile(join(root,style));await rm(join(root,style));await unchanged({code:'ENOENT'});await save(root,style,'changed style bytes');await unchanged(/style reference changed/);await save(root,style,styleBytes)
  const reused=draft.items.find(i=>i.membership==='existing-spanish-item'),oldImage=await readFile(join(root,reused.artwork.path));await save(root,reused.artwork.path,'changed reuse');await unchanged(/approved reuse bytes changed/);await save(root,reused.artwork.path,oldImage)
  const bankPath=reused.existingBank,oldBank=await readFile(join(root,bankPath)),bank=JSON.parse(oldBank);bank.items.find(i=>i.id===reused.id).text='different word';await save(root,bankPath,bank);await unchanged(/reuse identity changed/);await save(root,bankPath,oldBank)
  const evidencePath=reused.artwork.evidence,oldEvidence=await readFile(join(root,evidencePath)),evidence=JSON.parse(oldEvidence);evidence.images.find(i=>i.id===reused.id).sha256='0'.repeat(64);await save(root,evidencePath,evidence);await unchanged(/reuse evidence changed/);await save(root,evidencePath,oldEvidence)
})

test('late corrupt PNGs, malformed records, wrong references and source/output symlinks preserve every previous output',async t=>{
  const{root,requests}=await fixture(t);for(const q of requests)await generated(root,q);await buildFoodLevel2ArtReview(root);const before=await outputs(root)
  const q=requests[0],recordPath=`${ART}/records/${q.slug}-v1.json`,imagePath=`${ART}/originals/${q.slug}-v1.png`,originalRecord=await readFile(join(root,recordPath))
  const unchanged=async pattern=>{await assert.rejects(buildFoodLevel2ArtReview(root),pattern);assert.deepEqual(await outputs(root),before)}
  const latePath=`${ART}/originals/${requests.at(-1).slug}-v1.png`
  await save(root,latePath,'late image corrupt');await unchanged(/generated image bytes changed/);await save(root,latePath,testPng)
  await save(root,recordPath,'{broken');await unchanged(SyntaxError);await save(root,recordPath,originalRecord)
  for(const patch of [{referenceSha256:'0'.repeat(64)},{path:'../../outside.png'}]){await save(root,recordPath,{...JSON.parse(originalRecord),...patch});await unchanged(/generated record identity/);await save(root,recordPath,originalRecord)}
  for(const patch of [{width:1023}]){await save(root,recordPath,{...JSON.parse(originalRecord),...patch});await unchanged(/generated record measurements/);await save(root,recordPath,originalRecord)}
  for(const data of [png(1024,512),png(1024,1024,false)]){await generated(root,q,data);await unchanged(/square canvas|Delivery must be PNG/)}
  await generated(root,q)
  await save(root,'same.png',testPng);await rm(join(root,imagePath));await symlink(join(root,'same.png'),join(root,imagePath));await unchanged(/symlinks/);await rm(join(root,imagePath));await save(root,imagePath,testPng)
  // Even the last content redirect output is checked before the manifest or either gallery is written.
  await save(root,'sentinel.txt','untouched');await rm(join(root,FOOD,'review.html'));await symlink(join(root,'sentinel.txt'),join(root,FOOD,'review.html'))
  await assert.rejects(buildFoodLevel2ArtReview(root),/symlinks/);assert.deepEqual((await outputs(root)).slice(0,3),before.slice(0,3));assert.equal(await readFile(join(root,'sentinel.txt'),'utf8'),'untouched')
})
