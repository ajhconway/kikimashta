import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bank from '../../content/spanish-travel-art/plan.json' with { type: 'json' }
import config from '../../content/es-419-voices.json' with { type: 'json' }
import approval from '../../content/spanish-travel-audio/approval.json' with { type: 'json' }
import { spanishTravelPlan, generateSpanishTravelPack } from './generate-spanish-travel-pack.mjs'
import { generateCards, generationPlan } from './generate-elevenlabs-cards.mjs'

test('locks the approved 36 words and four regional pairs, excluding Cesar and retired words', () => {
  const plan = spanishTravelPlan(bank, config, approval)
  assert.equal(plan.expectedClips, 288)
  assert.equal(plan.characters, 1824)
  assert.deepEqual(plan.voices.map(v => v.voice), ['juan', 'pamela', 'albeiro', 'carito', 'santiago', 'agustina', 'carlos-figueroa', 'veronica'])
  assert(!plan.items.some(i => /entrance|exit/.test(i.id)))
  const changed = structuredClone(bank)
  changed.items[0].text = 'el hotel'
  assert.throws(() => spanishTravelPlan(changed, config, approval), /Approved Spanish text or voices changed/)
  const voices = structuredClone(config)
  voices.voices[0].id = 'different-provider-voice'
  assert.throws(() => spanishTravelPlan(bank, voices, approval), /Approved Spanish text or voices changed/)
})

test('Spanish requests use es and resume without regenerating any verified word/voice pair', async t => {
  const output = await mkdtemp(join(tmpdir(), 'spanish-travel-fixture-'))
  t.after(() => rm(output, { recursive: true, force: true }))
  const approved = spanishTravelPlan(bank, config, approval)
  const plan = generationPlan(approved.items.slice(0, 2), { ...config, voices: config.voices.slice(0, 2) })
  const calls = []
  const args = { plan, output, apiKey: 'fixture-secret', concurrency: 2, budget: 100, log: () => {},
    balance: async () => ({ usedCredits: 0, remainingCredits: 1000, creditLimit: 1000 }),
    speak: async (_key, voice, request) => { calls.push({ voice, request }); return { audio: Buffer.from('ID3 fixture ' + voice + request.text) } },
  }
  await generateCards(args)
  assert.equal(calls.length, 4)
  assert(calls.every(c => c.request.language_code === 'es'))
  await generateCards(args)
  assert.equal(calls.length, 4)
  const records = (await readFile(join(output, 'originals.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  assert.equal(new Set(records.map(r => r.voice + ':' + r.id)).size, 4)
  assert.doesNotMatch(JSON.stringify(records), /fixture-secret/)
  assert.throws(() => generationPlan([{ id: 'ja-hotel', text: 'hotel', spelling: 'hotel', meaning: 'Hotel' }], config), /Invalid card selection/)
})

test('rejects originals outside the private originals directory before generation', async () => {
  await assert.rejects(generateSpanishTravelPack({ output: 'public/audio', apiKey: 'fixture-secret', generate: () => assert.fail('Must not generate') }), /Keep originals/)
})

test('rejects a private output path whose ancestor symlink points outside originals', async t => {
  const target = await mkdtemp(join(tmpdir(), 'spanish-travel-public-'))
  const link = join(process.cwd(), 'artifacts/generated-originals', `symlink-fixture-${process.pid}`)
  t.after(async () => { await rm(link, { force: true }); await rm(target, { recursive: true, force: true }) })
  await mkdir(join(process.cwd(), 'artifacts/generated-originals'), { recursive: true })
  await symlink(target, link)
  await assert.rejects(generateSpanishTravelPack({ output: join(link, 'new-batch'), apiKey: 'fixture-secret', generate: () => assert.fail('Must not generate') }), /Keep originals/)
})
