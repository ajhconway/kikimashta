import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contextualFixture, sha256 } from './contextual-audio-fixtures.mjs'
import { loadContextualAudition } from './contextual-audio-plan.mjs'
import { generateCards } from './generate-elevenlabs-cards.mjs'
import { contextualAuditionSummary, generateContextualAudition } from './generate-contextual-audition.mjs'

const balance = async () => ({ usedCredits: 0, creditLimit: 10000, remainingCredits: 10000 })
const json = async path => JSON.parse(await readFile(path, 'utf8'))

test('CLI dry run needs no credentials, writes nothing and reports the approved bounded audition', async t => {
  const fixture = await contextualFixture(t)
  const before = await readdir(fixture.root, { recursive: true })
  const blocker = join(fixture.root, 'no-external-effects.mjs')
  await writeFile(blocker, `import fs from 'node:fs/promises';
for (const name of ['writeFile','mkdir','appendFile','open','unlink','rename','copyFile']) fs[name]=()=>{throw new Error('dry-run write')};
globalThis.fetch=()=>{throw new Error('dry-run network')};\n`)
  const result = JSON.parse(execFileSync(process.execPath, ['--import', blocker,
    fileURLToPath(new URL('./generate-contextual-audition.mjs', import.meta.url)), '--dry-run', '--output', fixture.output],
  { env: { ...process.env, ELEVENLABS_API_KEY: '', HOME: join(fixture.root, 'no-private-key') }, encoding: 'utf8' }))
  assert.deepEqual(result.voices, ['Otani', 'Morioki'])
  assert.equal(result.contexts, 3)
  assert.equal(result.requests, 18)
  assert.equal(result.characters, 274)
  assert.equal(result.budget, 274)
  assert.equal(result.pairs, 12)
  assert.equal(result.gapMs, 650)
  assert.equal(existsSync(fixture.output), false)
  assert.deepEqual((await readdir(fixture.root, { recursive: true })).filter(path => path !== 'no-external-effects.mjs').sort(), before.sort())
})

test('changed or unapproved text fails before the generation boundary and any output creation', async t => {
  const fixture = await contextualFixture(t)
  let calls = 0
  const args = { root: fixture.root, output: fixture.output, apiKey: 'fixture-secret', generate: async () => { calls++ } }
  fixture.bank.contexts[0].sentence.meaning = 'Changed after approval.'
  await fixture.saveBank({ approve: false })
  await assert.rejects(generateContextualAudition(args), /approval.*differs/)
  await fixture.saveBank()
  fixture.bank.contexts[0].review.text = 'pending'
  await fixture.saveBank()
  await assert.rejects(generateContextualAudition(args), /approval.*missing/)
  assert.equal(calls, 0)
  assert.equal(existsSync(fixture.output), false)
})

test('live generation requires a key and an ignored originals destination before external effects', async t => {
  const fixture = await contextualFixture(t)
  let calls = 0
  const args = { root: fixture.root, output: fixture.output, generate: async () => { calls++ } }
  await assert.rejects(generateContextualAudition(args), /API_KEY is required/)
  await assert.rejects(generateContextualAudition({ ...args, apiKey: 'fixture-secret', output: 'public/audio/contextual' }), /must stay under/)
  await assert.rejects(generateContextualAudition({ ...args, apiKey: 'fixture-secret', output: undefined }), /Choose --output/)
  assert.equal(calls, 0)
  assert.equal(existsSync(fixture.output), false)
  assert.equal(existsSync(join(fixture.root, 'public')), false)
})

test('uses sequential exact-budget generation and preserves the full approval and pairing plan without credentials', async t => {
  const fixture = await contextualFixture(t)
  const { plan } = loadContextualAudition(fixture.root)
  let boundaryCalls = 0
  const result = await generateContextualAudition({ root: fixture.root, output: fixture.output, apiKey: 'fixture-secret',
    generate: async args => {
      boundaryCalls++
      assert.equal(args.concurrency, 1)
      assert.equal(args.budget, plan.generation.characters)
      assert.deepEqual(args.plan, plan.generation)
      assert.equal(args.apiKey, 'fixture-secret')
      return generateCards({ ...args, balance, log: () => {},
        speak: async () => ({ audio: Buffer.from('ID3 local fixture') }) })
    } })
  assert.equal(boundaryCalls, 1)
  assert.equal(result.completed, 18)
  assert.equal(contextualAuditionSummary(plan).requests, 18)
  assert.deepEqual(await json(join(fixture.output, 'audition-plan.json')), plan)
  assert.doesNotMatch(await readFile(join(fixture.output, 'audition-plan.json'), 'utf8'), /fixture-secret/)
})

test('an artifact output symlink cannot redirect generation into production media', async t => {
  const fixture = await contextualFixture(t)
  const production = join(fixture.root, 'public/audio')
  const alias = join(fixture.root, 'artifacts/generated-originals/production-alias')
  await mkdir(production, { recursive: true })
  await mkdir(join(fixture.root, 'artifacts/generated-originals'), { recursive: true })
  await symlink(production, alias)
  let calls = 0
  await assert.rejects(generateContextualAudition({ root: fixture.root, output: join(alias, 'audition'), apiKey: 'fixture-secret',
    generate: async () => { calls++ } }), /must stay under/)
  assert.equal(calls, 0)
  assert.equal(existsSync(join(production, 'audition')), false)
})

test('a held engine lock cannot create audition metadata or reach balance and speech boundaries', async t => {
  const fixture = await contextualFixture(t)
  const { plan } = loadContextualAudition(fixture.root)
  await mkdir(fixture.output, { recursive: true })
  await writeFile(join(fixture.output, 'plan.json'), JSON.stringify({ ...plan.generation, identity: sha256(JSON.stringify(plan.generation)) }))
  await writeFile(join(fixture.output, 'generation.lock'), 'another process')
  let balanceCalls = 0
  let speechCalls = 0
  await assert.rejects(generateContextualAudition({ root: fixture.root, output: fixture.output, apiKey: 'fixture-secret',
    generate: args => generateCards({ ...args, log: () => {}, balance: async () => { balanceCalls++; return balance() },
      speak: async () => { speechCalls++; return { audio: Buffer.from('ID3 local fixture') } } }) }), { code: 'EEXIST' })
  assert.equal(existsSync(join(fixture.output, 'audition-plan.json')), false)
  assert.equal(balanceCalls, 0)
  assert.equal(speechCalls, 0)
  assert.equal(await readFile(join(fixture.output, 'generation.lock'), 'utf8'), 'another process')
})

test('a metadata conflict appearing after the wrapper precheck stops under the engine lock before paid boundaries', async t => {
  const fixture = await contextualFixture(t)
  const { plan } = loadContextualAudition(fixture.root)
  const conflicting = { ...plan, gapMs: 700 }
  let balanceCalls = 0
  let speechCalls = 0
  await assert.rejects(generateContextualAudition({ root: fixture.root, output: fixture.output, apiKey: 'fixture-secret',
    generate: async args => {
      // Simulate a competing metadata publication between precheck and lock.
      await mkdir(args.output, { recursive: true })
      await writeFile(join(args.output, 'plan.json'), JSON.stringify({ ...args.plan, identity: sha256(JSON.stringify(args.plan)) }))
      await writeFile(join(args.output, 'audition-plan.json'), JSON.stringify(conflicting))
      return generateCards({ ...args, log: () => {}, balance: async () => { balanceCalls++; return balance() },
        speak: async () => { speechCalls++; return { audio: Buffer.from('ID3 local fixture') } } })
    } }), /Saved audition plan differs/)
  assert.equal(balanceCalls, 0)
  assert.equal(speechCalls, 0)
  assert.deepEqual(await json(join(fixture.output, 'audition-plan.json')), conflicting)
  assert.equal(existsSync(join(fixture.output, 'generation.lock')), false)
})

test('preserves partial successes and audition metadata, sanitizes provider failure and blocks ambiguous retries', async t => {
  const fixture = await contextualFixture(t)
  let requests = 0
  const generate = args => generateCards({ ...args, balance, log: () => {}, speak: async () => {
    if (++requests === 2) throw new Error('do not expose fixture-secret')
    return { audio: Buffer.from('ID3 fixture recording') }
  } })
  const args = { root: fixture.root, output: fixture.output, apiKey: 'fixture-secret', generate }
  await assert.rejects(generateContextualAudition(args), error => {
    assert.doesNotMatch(error.message, /fixture-secret/)
    return /stopped/.test(error.message)
  })
  assert.equal(requests, 2)
  const saved = await json(join(fixture.output, 'audition-plan.json'))
  assert.equal(saved.contexts.length, 3)
  const records = (await readFile(join(fixture.output, 'originals.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  assert.equal(records.length, 1)
  assert.equal(records[0].contextId, saved.contexts[0].id)
  assert.equal(records[0].textApprovalSha256, saved.approval.textSha256)
  await assert.rejects(generateContextualAudition(args), /Unresolved earlier request/)
  assert.equal(requests, 2)
})

test('verified complete resumes reuse recordings and reject changed pairing metadata before calling the engine', async t => {
  const fixture = await contextualFixture(t)
  let requests = 0
  let boundaryCalls = 0
  const generate = args => {
    boundaryCalls++
    return generateCards({ ...args, balance, log: () => {}, speak: async () => {
      requests++
      return { audio: Buffer.from('ID3 local fixture') }
    } })
  }
  const args = { root: fixture.root, output: fixture.output, apiKey: 'fixture-secret', generate }
  assert.equal((await generateContextualAudition(args)).completed, 18)
  assert.equal((await generateContextualAudition(args)).completed, 18)
  assert.equal(requests, 18)
  assert.equal(boundaryCalls, 2)
  const path = join(fixture.output, 'audition-plan.json')
  await writeFile(path, JSON.stringify({ ...await json(path), gapMs: 700 }))
  await assert.rejects(generateContextualAudition(args), /Saved audition plan differs/)
  assert.equal(boundaryCalls, 2)
  assert.equal(requests, 18)
})
