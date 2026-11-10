import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { buildFoodLevel2MediaReview, foodLevel2MediaReviewHtml } from './build-spanish-food-level-2-media-review.mjs'
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

test('production Food2 review keeps the accepted shared glass, exact media and all voices without modifying outputs', async () => {
  const draft = await json(join(source, FOOD, 'draft.json'))
  const protectedPaths = [ART + '/manifest.json', FOOD + '/artwork-acceptance.json', FOOD + '/draft.json', AUDIO + '/manifest.json']
  const before = await Promise.all(protectedPaths.map(path => readFile(join(source, path))))
  const inspected = await json(join(source, MEDIA, 'manifest.json'))
  assert.deepEqual(inspected.items.map(item => item.id), draft.items.map(item => item.id))
  assert.equal(inspected.images.length, 36)
  assert.equal(inspected.clips.length, 288)
  assert.equal(new Set(inspected.clips.map(clip => clip.id + ':' + clip.voice)).size, 288)
  assert.equal(inspected.clips.filter(clip => clip.source === 'new-generation').length, 248)
  assert.equal(inspected.clips.filter(clip => clip.source === 'accepted-reuse').length, 40)
  assert.equal(inspected.artworkStatus, 'accepted')
  assert.equal(inspected.runtimeActivationAuthorized, false)
  const html = foodLevel2MediaReviewHtml(inspected)
  assert.equal((html.match(/<article /g) ?? []).length, 36)
  assert.equal((html.match(/<img /g) ?? []).length, 36)
  assert.equal((html.match(/<audio controls /g) ?? []).length, 288)
  assert.match(html, /Food listening approval is pending/)
  assert.deepEqual(await Promise.all(protectedPaths.map(path => readFile(join(source, path)))), before)
})

test('a corrupt final new recording preserves every previous gallery output', async t => {
  const { root, generated } = await fixture(t)
  for (const path of [MEDIA + '/manifest.json', MEDIA + '/index.html', FOOD + '/media-review.html']) await save(root, path, 'previous output')
  const before = await outputs(root)
  await save(root, AUDIO + '/' + generated.clips.at(-1).file, 'changed final delivery')
  await assert.rejects(buildFoodLevel2MediaReview(root), /New Food recording bytes/)
  assert.deepEqual(await outputs(root), before)
})

test('a late output symlink preserves earlier galleries and its unrelated target', async t => {
  const { root } = await fixture(t)
  for (const path of [MEDIA + '/manifest.json', MEDIA + '/index.html']) await save(root, path, 'previous output')
  await save(root, 'sentinel.html', 'unrelated target')
  await symlink(join(root, 'sentinel.html'), join(root, FOOD, 'media-review.html'))
  await assert.rejects(buildFoodLevel2MediaReview(root), /symlinks/)
  assert.equal(await readFile(join(root, MEDIA, 'manifest.json'), 'utf8'), 'previous output')
  assert.equal(await readFile(join(root, MEDIA, 'index.html'), 'utf8'), 'previous output')
  assert.equal(await readFile(join(root, 'sentinel.html'), 'utf8'), 'unrelated target')
})
