import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { inspectFoodLevel2Art, buildFoodLevel2ArtReview, loadFoodLevel2ArtworkAcceptance } from './build-spanish-food-level-2-art-review.mjs'
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
  const q=requests.at(-1),recordPath=`${ART}/records/${q.slug}-v1.json`,imagePath=`${ART}/originals/${q.slug}-v1.png`,originalRecord=await readFile(join(root,recordPath))
  const unchanged=async pattern=>{await assert.rejects(buildFoodLevel2ArtReview(root),pattern);assert.deepEqual(await outputs(root),before)}
  await save(root,imagePath,'late image corrupt');await unchanged(/generated image bytes changed/);await save(root,imagePath,testPng)
  await save(root,recordPath,'{broken');await unchanged(SyntaxError);await save(root,recordPath,originalRecord)
  for(const patch of [{referenceSha256:'0'.repeat(64)},{path:'../../outside.png'},{id:requests[0].id},{additionalReferences:[{}]},{additionalReferences:{}},{referenceRole:'edit-target'},{referencePath:'public/images/approved/other.png'}]){await save(root,recordPath,{...JSON.parse(originalRecord),...patch});await unchanged(/generated record identity/);await save(root,recordPath,originalRecord)}
  for(const patch of [{bytes:testPng.length+1},{width:1023},{height:1023}]){await save(root,recordPath,{...JSON.parse(originalRecord),...patch});await unchanged(/generated record measurements/);await save(root,recordPath,originalRecord)}
  for(const data of [png(1024,512),png(512,512),png(1024,1024,false),Buffer.from('not a png')]){await generated(root,q,data);await unchanged(/square canvas|Delivery must be PNG/)}
  await generated(root,q)
  await save(root,'same.png',testPng);await rm(join(root,imagePath));await symlink(join(root,'same.png'),join(root,imagePath));await unchanged(/symlinks/);await rm(join(root,imagePath));await save(root,imagePath,testPng)
  // Even the last content redirect output is checked before the manifest or either gallery is written.
  await save(root,'sentinel.txt','untouched');await rm(join(root,FOOD,'review.html'));await symlink(join(root,'sentinel.txt'),join(root,FOOD,'review.html'))
  await assert.rejects(buildFoodLevel2ArtReview(root),/symlinks/);assert.deepEqual((await outputs(root)).slice(0,3),before.slice(0,3));assert.equal(await readFile(join(root,'sentinel.txt'),'utf8'),'untouched')
})

async function revisionFixture(t){
  const f=await fixture(t),{root,requests}=f
  const paths=[FOOD+'/artwork-revisions-v1.json','content/ja.json',...['before-feedback-v1-manifest.json','before-feedback-v1-selection.json','before-feedback-v1-contact-sheet.png','glass-v1-request.json'].map(p=>ART+'/revisions/'+p)]
  for(const q of requests)paths.push(ART+`/originals/${q.slug}-v1.png`,ART+`/records/${q.slug}-v1.json`)
  for(const p of paths){await mkdir(dirname(join(root,p)),{recursive:true});await copyFile(join(source,p),join(root,p))}
  const previous=await json(join(root,ART,'revisions/before-feedback-v1-manifest.json')),selection=await json(join(root,ART,'revisions/before-feedback-v1-selection.json'))
  await save(root,ART+'/selection.json',{...selection,versions:{...selection.versions,glass:1}})
  const q=await json(join(root,ART,'revisions/glass-v1-request.json')),amendment=await json(join(root,FOOD,'artwork-revisions-v1.json'))
  const record={id:q.id,slug:'glass',version:1,path:'originals/glass-v1.png',tool:'built-in image_gen',promptSha256:hash(q.prompt),editTargetSha256:q.editTarget.sha256,styleReferenceSha256:q.styleReference.sha256,supersedes:amendment.target.supersedes,supersedesSha256:amendment.target.supersedesSha256,sha256:hash(testPng),bytes:testPng.length,width:1024,height:1024}
  return{...f,paths,previous,q,record}
}
const revisedOutputs=async root=>[...await outputs(root),await readFile(join(root,ART,'shared-glass-review.html'))]

test('pinned shared-glass amendment changes only glass, keeps35 original pictures and previews all3 stable source identities without modifying any source',async t=>{
  const{root,paths,previous,record}=await revisionFixture(t),protectedPaths=[...paths,FOOD+'/draft.json',FOOD+'/generation-approval.json',ART+'/requests.json','content/es-419-travel-2.json','public/images/approved/ja-cup-a6b3cf43ae54.jpg']
  const before=await Promise.all(protectedPaths.map(async p=>hash(await readFile(join(root,p)))))
  const pending=await buildFoodLevel2ArtReview(root),target=pending.images.find(i=>i.slug==='glass')
  assert.equal(pending.generatedImages,31);assert.equal(pending.reusedImages,4);assert.equal(pending.pendingImages,1);assert.equal(target.source,'pending');assert.equal(target.path,undefined)
  await save(root,ART+'/originals/glass-v1.png',testPng);await save(root,ART+'/records/glass-v1.json',record)
  const complete=await buildFoodLevel2ArtReview(root),glass=complete.images.find(i=>i.slug==='glass')
  assert.equal(complete.generatedImages,32);assert.equal(complete.reusedImages,4);assert.equal(complete.pendingImages,0);assert.equal(complete.expectedNewImages,32)
  assert.equal(glass.id,'es-419-travel-drinking-glass');assert.equal(glass.membership,'existing-spanish-item');assert.equal(glass.path,ART+'/originals/glass-v1.png');assert.equal(glass.sha256,hash(testPng))
  assert.equal(complete.amendmentEvidence.unchangedPictureCount,35);assert.equal(complete.amendmentEvidence.unchangedImages.length,35)
  assert.deepEqual(complete.images.filter(i=>i.slug!=='glass'),previous.images.filter(i=>i.slug!=='glass'))
  assert.deepEqual(complete.sharedReplacement.targets.map(t=>[t.id,t.language]),[['es-419-travel-drinking-glass','es-419'],['es-419-travel-drinking-glass','es-419'],['ja-cup','ja-JP']])
  for(const use of complete.sharedReplacement.targets){assert.equal(use.path,glass.path);assert.equal(use.sha256,glass.sha256)}
  assert.equal(complete.audioGenerationAuthorized,false);assert.equal(complete.runtimeActivationAuthorized,false)
  const html=await readFile(join(root,ART,'shared-glass-review.html'),'utf8');assert.equal((html.match(/<img /g)??[]).length,4);assert.equal((html.match(/src="..\/..\/artifacts\/spanish-food-2-art\/originals\/glass-v1.png"/g)??[]).length,3);assert.match(html,/Earlier picture/);assert.match(html,/does not enable retired Japanese practice/);assert.doesNotMatch(html,/<audio/)
  assert.deepEqual(await Promise.all(protectedPaths.map(async p=>hash(await readFile(join(root,p))))),before)
})

test('changed or missing amendment/reference/snapshot/supersession/shared mappings and late symlinks preserve every revised output',async t=>{
  const{root,record}=await revisionFixture(t),recordPath=ART+'/records/glass-v1.json',imagePath=ART+'/originals/glass-v1.png'
  await save(root,imagePath,testPng);await save(root,recordPath,record);await buildFoodLevel2ArtReview(root);const before=await revisedOutputs(root)
  const unchanged=async pattern=>{await assert.rejects(buildFoodLevel2ArtReview(root),pattern);assert.deepEqual(await revisedOutputs(root),before)}
  for(const p of [FOOD+'/artwork-revisions-v1.json',ART+'/revisions/glass-v1-request.json',ART+'/revisions/before-feedback-v1-manifest.json',ART+'/revisions/before-feedback-v1-selection.json',ART+'/revisions/before-feedback-v1-contact-sheet.png']){
    const original=await readFile(join(root,p));await save(root,p,Buffer.concat([original,Buffer.from(' ')]));await unchanged(/amendment bytes changed|snapshot\/request bytes changed/);await save(root,p,original)
  }
  const requestPath=ART+'/revisions/glass-v1-request.json',requestBytes=await readFile(join(root,requestPath));await rm(join(root,requestPath));await unchanged({code:'ENOENT'});await save(root,requestPath,requestBytes)
  const amendmentPath=FOOD+'/artwork-revisions-v1.json',amendmentBytes=await readFile(join(root,amendmentPath));await rm(join(root,amendmentPath));await unchanged(/selected version scope/);await save(root,amendmentPath,amendmentBytes)
  for(const patch of [{editTargetSha256:'0'.repeat(64)},{styleReferenceSha256:'0'.repeat(64)},{promptSha256:'0'.repeat(64)},{supersedes:'public/images/approved/other.jpg'},{supersedesSha256:'0'.repeat(64)}]){await save(root,recordPath,{...record,...patch});await unchanged(/revision record or supersession/);await save(root,recordPath,record)}
  const missingSupersession={...record};delete missingSupersession.supersedes;await save(root,recordPath,missingSupersession);await unchanged(/revision record or supersession/);await save(root,recordPath,record)
  for(const patch of [{bytes:testPng.length+1},{width:1023},{height:1023}]){await save(root,recordPath,{...record,...patch});await unchanged(/record measurements/);await save(root,recordPath,record)}
  // A valid replacement PNG with a self-consistent record still cannot change any of the other35 pictures.
  const unchangedImage=ART+'/originals/knife-v1.png',unchangedRecord=ART+'/records/knife-v1.json',oldUnchangedBytes=await readFile(join(root,unchangedImage)),oldUnchangedRecord=await readFile(join(root,unchangedRecord))
  await save(root,unchangedImage,testPng);await save(root,unchangedRecord,{...JSON.parse(oldUnchangedRecord),sha256:hash(testPng),bytes:testPng.length,width:1024,height:1024});await unchanged(/original artwork or selected version snapshot changed/);await save(root,unchangedImage,oldUnchangedBytes);await save(root,unchangedRecord,oldUnchangedRecord)
  const oldImage='public/images/approved/ja-cup-a6b3cf43ae54.jpg',oldBytes=await readFile(join(root,oldImage));await save(root,oldImage,'tampered old reference');await unchanged(/approved reuse bytes/);await save(root,oldImage,oldBytes)
  const jaPath='content/ja.json',jaBytes=await readFile(join(root,jaPath)),ja=JSON.parse(jaBytes);ja.items.find(i=>i.id==='ja-cup').image.src='images/approved/other.jpg';await save(root,jaPath,ja);await unchanged(/current shared glass source mapping/);await save(root,jaPath,jaBytes)
  await save(root,imagePath,'tampered replacement');await unchanged(/revision image bytes/);await save(root,imagePath,testPng)
  await save(root,'same-replacement.png',testPng);await rm(join(root,imagePath));await symlink(join(root,'same-replacement.png'),join(root,imagePath));await unchanged(/symlinks/);await rm(join(root,imagePath));await save(root,imagePath,testPng)
  await save(root,'shared-sentinel.html','unchanged');await rm(join(root,ART,'shared-glass-review.html'));await symlink(join(root,'shared-sentinel.html'),join(root,ART,'shared-glass-review.html'))
  await assert.rejects(buildFoodLevel2ArtReview(root),/symlinks/);assert.deepEqual(await outputs(root),before.slice(0,4));assert.equal(await readFile(join(root,'shared-sentinel.html'),'utf8'),'unchanged')
})

test('artwork acceptance binds exact current manifest/shared targets and changes HTML only; stale or malformed acceptance cannot rewrite outputs',async t=>{
  const{root}=await revisionFixture(t)
  assert.equal(await loadFoodLevel2ArtworkAcceptance(root,{}),null)
  const acceptancePath=FOOD+'/artwork-acceptance.json',manifestPath=ART+'/manifest.json'
  for(const p of [ART+'/originals/glass-v1.png',ART+'/records/glass-v1.json',manifestPath,acceptancePath])await copyFile(join(source,p),join(root,p))
  const acceptedBytes=await readFile(join(root,acceptancePath)),manifestBytes=await readFile(join(root,manifestPath)),manifest=await inspectFoodLevel2Art(root)
  assert.equal(hash(manifestBytes),'0e946432982fd6633986229ca822443e44a4ff63dcd6c861f442c4e166f885e6')
  const accepted=await loadFoodLevel2ArtworkAcceptance(root,manifest)
  assert.equal(accepted.status,'artwork-accepted');assert.equal(accepted.images.length,36);assert.equal(accepted.sharedReplacement.targets.length,3)
  await buildFoodLevel2ArtReview(root)
  assert.deepEqual(await readFile(join(root,manifestPath)),manifestBytes);assert.deepEqual(await readFile(join(root,acceptancePath)),acceptedBytes)
  for(const p of [ART+'/review.html',ART+'/artwork.html',FOOD+'/review.html',ART+'/shared-glass-review.html']){
    const html=await readFile(join(root,p),'utf8');assert.match(html,/Artwork accepted/);assert.match(html,/Audio generation is authorized separately/);assert.match(html,/activation remain pending/);assert.doesNotMatch(html,/<audio|Artwork acceptance remains pending|Artwork approval and production activation remain pending/)
  }
  const before=await revisedOutputs(root)
  const unchanged=async pattern=>{await assert.rejects(buildFoodLevel2ArtReview(root),pattern);assert.deepEqual(await revisedOutputs(root),before)}
  const stale=JSON.parse(acceptedBytes);stale.images.reverse();await save(root,acceptancePath,stale);await unchanged(/artwork acceptance record changed/);await save(root,acceptancePath,acceptedBytes)
  await save(root,acceptancePath,'{malformed');await unchanged(SyntaxError);await save(root,acceptancePath,acceptedBytes)
  const changedTargets=structuredClone(manifest);changedTargets.sharedReplacement.targets[2].id='another-id';await assert.rejects(loadFoodLevel2ArtworkAcceptance(root,changedTargets),/differs from the current verified manifest/)
  await save(root,manifestPath,manifestBytes.toString()+' ');await assert.rejects(loadFoodLevel2ArtworkAcceptance(root,manifest),/differs from the current verified manifest/);await save(root,manifestPath,manifestBytes)
  for(const p of [ART+'/selection.json',FOOD+'/artwork-revisions-v1.json']){
    const original=await readFile(join(root,p));await save(root,p,original.toString()+' ');await assert.rejects(loadFoodLevel2ArtworkAcceptance(root,manifest),/selection\/amendment\/shared targets changed/);await save(root,p,original)
  }
  const picture=manifest.images[0].path,pictureBytes=await readFile(join(root,picture));await save(root,picture,'changed selected picture');await assert.rejects(loadFoodLevel2ArtworkAcceptance(root,manifest),/accepted picture bytes changed/);await save(root,picture,pictureBytes)
  await save(root,'same-acceptance.json',acceptedBytes);await rm(join(root,acceptancePath));await symlink(join(root,'same-acceptance.json'),join(root,acceptancePath));await assert.rejects(loadFoodLevel2ArtworkAcceptance(root,manifest),/symlinks/)
  assert.deepEqual(await revisedOutputs(root),before)
})
