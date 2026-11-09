import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import config from '../../content/elevenlabs-voices.json' with { type: 'json' }
import catalog from '../../content/catalog/ja.json' with { type: 'json' }
import starter from '../../content/ja.json' with { type: 'json' }
import overrides from '../../content/catalog/review-overrides.json' with { type: 'json' }
import provenance from '../../content/elevenlabs-audio-provenance.json' with { type: 'json' }
import { cardItems, generationPlan, generateCards } from './generate-elevenlabs-cards.mjs'

const item = { id: 'ja-cat', text: 'ねこ', spelling: '猫', meaning: 'Cat' }
const plan = () => generationPlan([item, { ...item, id: 'ja-dog', text: 'いぬ' }], { ...config, voices: config.voices.slice(0, 2) })
const balance = async () => ({ tier: 'starter', usedCredits: 0, creditLimit: 1000, remainingCredits: 1000 })
async function fixture(t) {
  const output = await mkdtemp(join(tmpdir(), 'kikimashta-card-generation-'))
  t.after(() => rm(output, { recursive: true, force: true }))
  return output
}
test('preserves distinct IDs and the canonical starter reading when the banks overlap', () => {
  const catalog = { language: 'ja-JP', items: [{ id: 'ja-apple', reading: 'リンゴ', text: '林檎', meaning: 'Apple' }, { id: 'ja-library-cat', reading: 'ねこ', text: '猫', meaning: 'Cat' }] }
  const starter = { language: 'ja-JP', items: [{ id: 'ja-apple', reading: 'りんご', text: 'りんご', label: 'Apple' }] }
  const items = cardItems(catalog, starter)
  assert.equal(items.length, 2)
  assert.equal(items.find(i => i.id === 'ja-apple').text, 'りんご')
  assert.equal(generationPlan(items, config).expectedClips, 16)
  assert.equal(generationPlan(items, config).characters, 40)
  assert.throws(() => cardItems({ ...catalog, items: [catalog.items[0], catalog.items[0]] }, starter), /duplicate/)
})
test('selects nonremoved catalogue cards without reviving starter-only entries or mutating source metadata', () => {
  const catalog = { language: 'ja-JP', items: [{ id: 'ja-apple', text: 'りんご', meaning: 'Apple' }, { id: 'ja-form', text: '～形', reading: 'けい', meaning: 'Form' }] }
  const starter = { language: 'ja-JP', items: [{ id: 'ja-apple', text: '林檎', reading: 'りんご', label: 'Apple' }, { id: 'ja-cat', text: '猫', reading: 'ねこ', label: 'Cat' }] }
  const before = structuredClone({ catalog, starter })
  assert.deepEqual(cardItems(catalog, starter, { 'ja-form': { removalReason: 'Owner removed this entry.' } }), [{ id: 'ja-apple', text: 'りんご', spelling: '林檎', meaning: 'Apple' }])
  assert.deepEqual({ catalog, starter }, before)
})
test('the current selection and retained provenance cover exactly 440 cards with eight voices', async () => {
  const selected = cardItems(catalog, starter, overrides)
  const plan = generationPlan(selected, config)
  assert.equal(selected.length, 440)
  assert.equal(plan.expectedClips, 3520)
  assert.equal(plan.characters, 11456)
  assert.equal(provenance.cards, selected.length)
  assert.equal(provenance.recordings, plan.expectedClips)
  assert.equal(provenance.inputCharacters, plan.characters)
  for (const voice of provenance.voices) {
    const records = JSON.parse(await readFile(new URL('../../' + voice.provenance, import.meta.url)))
    assert.deepEqual(records.clips.map(clip => clip.id).sort(), selected.map(item => item.id).sort())
    assert.ok(records.clips.every(clip => clip.voice === voice.voice && clip.planIdentity === provenance.generationIdentity))
  }
})
test('resumes from verified sidecars without repeat paid calls, even if the journal was interrupted', async t => {
  const output = await fixture(t)
  let calls = 0
  const speak = async (_key, voice, request) => { calls++; return { audio: Buffer.from(`ID3:${voice}:${request.text}`), requestId: `request-${calls}` } }
  const args = { plan: plan(), output, apiKey: 'test-secret', speak, balance, log: () => {}, concurrency: 2, budget: 100 }
  const result = await generateCards(args)
  assert.equal(result.completed, 4)
  assert.equal(calls, 4)
  const records = (await readFile(join(output, 'originals.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  assert.equal(new Set(records.map(r => r.id + r.voice)).size, 4)
  assert.ok(records.every(r => r.request.model_id === 'eleven_v4' && r.request.language_code === 'ja'))
  assert.doesNotMatch(JSON.stringify(records), /test-secret/)
  await writeFile(join(output, 'originals.jsonl'), '')
  assert.equal((await generateCards(args)).completed, 4)
  assert.equal(calls, 4)
  assert.equal((await readFile(join(output, 'originals.jsonl'), 'utf8')).trim().split('\n').length, 4)
  await writeFile(join(output, records[0].file), 'damaged')
  await assert.rejects(generateCards(args), /hash mismatch/)
  assert.equal(calls, 4)
})
test('stops on failure, preserves completed clips, sanitizes errors and blocks an uncertain paid retry', async t => {
  const output = await fixture(t)
  let calls = 0
  const args = { plan: plan(), output, apiKey: 'test-secret', balance, log: () => {}, concurrency: 1, budget: 100,
    speak: async () => { if (++calls === 2) throw new Error('Secret test-secret'); return { audio: Buffer.from('ID3 success') } } }
  await assert.rejects(generateCards(args), error => { assert.doesNotMatch(error.message, /test-secret/); return /stopped/.test(error.message) })
  assert.equal(calls, 2)
  const summary = JSON.parse(await readFile(join(output, 'summary.json'), 'utf8'))
  assert.equal(summary.completed, 1)
  assert.equal(summary.status, 'stopped')
  await assert.rejects(generateCards(args), /Unresolved earlier request/)
  assert.equal(calls, 2)
})
test('changed plans, insufficient balance and an existing lock prevent generation', async t => {
  const output = await fixture(t)
  let calls = 0
  const args = { plan: plan(), output, apiKey: 'test-secret', balance: async () => ({ ...await balance(), remainingCredits: 0 }), budget: 100, log: () => {}, speak: async () => { calls++; throw new Error('Must not call') } }
  await assert.rejects(generateCards(args), /Insufficient/)
  await assert.rejects(generateCards({ ...args, plan: generationPlan([{ ...item, text: 'ねこです' }], { ...config, voices: config.voices.slice(0, 2) }) }), /plan differs/)
  await writeFile(join(output, 'generation.lock'), 'another process')
  await assert.rejects(generateCards(args), { code: 'EEXIST' })
  assert.equal(calls, 0)
})

test('completed and partial resumes need credits only for pending work', async t => {
  const output = await fixture(t)
  let calls = 0
  const args = { plan: plan(), output, apiKey: 'test-secret', balance, budget: 100, concurrency: 1, log: () => {}, speak: async () => { calls++; return { audio: Buffer.from('ID3 recording') } } }
  await generateCards(args)
  assert.equal(calls, 4)
  await generateCards({ ...args, balance: async () => ({ ...await balance(), usedCredits: 1000, remainingCredits: 0 }) })
  assert.equal(calls, 4)
  const records = (await readFile(join(output, 'originals.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  const last = records.at(-1)
  for (const path of [join(output, last.file), join(output, 'records', `${last.voice}-${last.id}.json`), join(output, 'pending', `${last.voice}-${last.id}.json`)]) await rm(path)
  await generateCards({ ...args, balance: async () => ({ ...await balance(), usedCredits: 6, remainingCredits: 2 }) })
  assert.equal(calls, 5)
})

test('periodic balance guard reserves the pending cost before launching further requests', async t => {
  const output = await fixture(t)
  const items = Array.from({ length: 125 }, (_, i) => ({ ...item, id: `ja-test-${i}`, text: 'き' }))
  const bigPlan = generationPlan(items, { ...config, voices: config.voices.slice(0, 1) })
  let calls = 0
  let checks = 0
  const checkBalance = async () => ({ tier: 'starter', usedCredits: checks++ ? 140 : 0, creditLimit: 1000, remainingCredits: 1000 })
  await assert.rejects(generateCards({ plan: bigPlan, output, apiKey: 'test-secret', concurrency: 1, budget: 150, log: () => {}, balance: checkBalance,
    speak: async () => { calls++; return { audio: Buffer.from('ID3 recording') } } }), /stopped/)
  assert.equal(calls, 100)
  assert.equal(JSON.parse(await readFile(join(output, 'summary.json'), 'utf8')).completed, 100)
})

test('pre-request metadata preparation runs under the exclusive lock before provider activity', async t => {
  const output = await fixture(t)
  const events = []
  await generateCards({ plan: plan(), output, apiKey: 'fixture-key', concurrency: 1, budget: 100, log: () => {},
    beforeRequests: async () => {
      assert.ok(JSON.parse(await readFile(join(output, 'generation.lock'), 'utf8')).pid)
      events.push('prepare')
    },
    balance: async () => { assert.equal(events[0], 'prepare'); events.push('balance'); return balance() },
    speak: async () => { assert.equal(events[0], 'prepare'); events.push('speech'); return { audio: Buffer.from('ID3 fixture') } },
  })
  assert.equal(events.filter(event => event === 'speech').length, 4)
  assert.equal(events[0], 'prepare')
})

test('failed pre-request preparation releases the lock without contacting the provider', async t => {
  const output = await fixture(t)
  const never = async () => assert.fail('No provider call may occur before metadata preparation succeeds')
  await assert.rejects(generateCards({ plan: plan(), output, apiKey: 'fixture-key', concurrency: 1, budget: 100,
    beforeRequests: async () => { throw new Error('Approval metadata differs') }, balance: never, speak: never,
  }), /Approval metadata differs/)
  await assert.rejects(readFile(join(output, 'generation.lock')), { code: 'ENOENT' })
})
