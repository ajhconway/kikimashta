import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, mkdir, copyFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spanishTravelLevel4ReplacementPlan, loadSpanishTravelLevel4ReplacementPlan, generateSpanishTravelLevel4ReplacementPack } from './generate-spanish-travel-level-4-replacement.mjs'
const files=['content/spanish-travel-4/word-replacement.json','content/es-419-voices.json','content/spanish-travel-4/audio-config.json','content/spanish-travel-4/replacement-audio-approval.json','content/spanish-travel-4/draft.json']
async function fixture(){return Promise.all(files.map(async(p,i)=>{const s=await readFile(p,'utf8');return i===0||i===4?s:JSON.parse(s)}))}
test('locks the selected enchufe amendment, immutable base and exact eight-voice configuration',async()=>{
 const f=await fixture(),plan=spanishTravelLevel4ReplacementPlan(...f)
 assert.equal(plan.issue,207);assert.equal(plan.expectedClips,8);assert.equal(plan.characters,56)
 assert.equal(plan.items[0].text,'enchufe');assert.equal(plan.items.at(-1).text,'enchufe')
 assert.deepEqual(plan.voices.map(v=>v.voice),['juan','pamela','albeiro','carito','santiago','agustina','carlos-figueroa','veronica'])
 for(const change of [f=>{f[0]+='\n'},f=>{f[0]=f[0].replace('enchufe','contacto')},f=>{f[1].voices[0].id='changed'},f=>{f[2].voices[0].id='changed'},f=>{f[3].items[0].text='changed'},f=>{f[2].voiceSettings.stability=0.9},f=>{f[2].model='eleven_multilingual_v2'},f=>{f[3].characters++},f=>{f[3].replacementSha256='changed'},f=>{f[4]=f[4].replace('supermercado','mercado')}]){const v=structuredClone(f);change(v);assert.throws(()=>spanishTravelLevel4ReplacementPlan(...v))}
})
test('draft tampering blocks the paid boundary before output is created',async t=>{
 const root=await mkdtemp(join(tmpdir(),'spanish-level4-approval-'));t.after(()=>rm(root,{recursive:true,force:true}))
 for(const p of files){await mkdir(dirname(join(root,p)),{recursive:true});await copyFile(p,join(root,p))}
 await writeFile(join(root,files[0]),(await readFile(join(root,files[0]),'utf8'))+'\n')
 await assert.rejects(generateSpanishTravelLevel4ReplacementPack({root,output:'artifacts/generated-originals/test',apiKey:'fixture-secret',generate:()=>assert.fail('No paid request')}),/authorization changed/)
})
test('refuses public paths, escaping and dangling symlinks before paid generation',async t=>{
 const generate=()=>assert.fail('No paid request');await assert.rejects(generateSpanishTravelLevel4ReplacementPack({output:'public/audio',apiKey:'fixture-secret',generate}),/Keep originals/)
 const outside=await mkdtemp(join(tmpdir(),'spanish-level4-outside-')),privateRoot=join(process.cwd(),'artifacts/generated-originals'),link=join(privateRoot,`level4-symlink-${process.pid}`)
 await mkdir(privateRoot,{recursive:true});t.after(async()=>{await rm(link,{force:true});await rm(outside,{recursive:true,force:true})})
 for(const target of [outside,join(outside,'missing')]){await symlink(target,link);await assert.rejects(generateSpanishTravelLevel4ReplacementPack({output:join(link,'new'),apiKey:'fixture-secret',generate}),/Keep originals/);await rm(link,{force:true})}
 assert.equal((await loadSpanishTravelLevel4ReplacementPlan()).plan.expectedClips,8)
})
