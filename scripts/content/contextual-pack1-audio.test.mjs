import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { contextualAuditionPlan, loadContextualAudition, contextualTextDigest } from './contextual-audio-plan.mjs'
import { generateContextualAudition } from './generate-contextual-audition.mjs'
import { projectRoot } from './validate-contextual.mjs'

const bankPath = 'content/contextual/ja-wanikani-1-draft.json'
const approvalPath = 'content/contextual/pack-1/text-approval.json'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

test('pack 1 binds the frozen approved text and preserves every context/question through exact speech aliases', () => {
  const { bank, plan } = loadContextualAudition(projectRoot, { batch: 'pack1' })
  assert.equal(hash(readFileSync(join(projectRoot, bankPath))), plan.approval.sourceFileSha256)
  assert.equal(contextualTextDigest(bank), plan.approval.textSha256)
  assert.equal(bank.contexts.length, 116)
  assert.equal(plan.contexts.length, 116)
  assert.equal(new Set(bank.contexts.map(context => context.targetItemId)).size, 29)
  assert.equal(plan.logicalRecordings, 696)
  assert.equal(plan.generation.expectedClips, 654)
  assert.equal(plan.generation.characters, 13228)
  assert.equal(plan.aliases.length, 348)
  assert.equal(new Set(plan.aliases.map(alias => alias.id)).size, 348)
  assert.deepEqual(plan.generation.voices.map(voice => voice.voice), ['otani', 'morioki'])
  assert.ok(bank.contexts.every(context => context.review.text === 'pending' && context.review.audio === 'not-generated'))
  const items = new Map(plan.generation.items.map(item => [item.id, item]))
  for (const alias of plan.aliases) {
    const item = items.get(alias.itemId)
    assert.equal(item.text, alias.text)
    assert.equal(item.reading, alias.reading)
  }
  const questionIds = []
  for (const context of plan.contexts) {
    const authored = bank.contexts.find(entry => entry.id === context.id)
    assert.equal(items.get(context.sentenceItemId).text, authored.sentence.text)
    for (const question of context.questions) {
      questionIds.push(question.id)
      const original = authored.questions.find(entry => entry.id === question.id)
      assert.equal(items.get(question.itemId).text, original.prompt.text)
      assert.equal(items.get(question.itemId).reading, original.prompt.reading)
    }
  }
  assert.equal(new Set(questionIds).size, 232, 'shared audio never aliases runtime question identities')
})

test('pack 1 uses the existing locked, sequential, exact-budget generation boundary', async () => {
  let calls = 0
  const output = 'artifacts/generated-originals/pack1-boundary-fixture'
  const { plan } = loadContextualAudition(projectRoot, { batch: 'pack1' })
  await generateContextualAudition({ root: projectRoot, batch: 'pack1', output, apiKey: 'fixture-secret',
    generate: async args => {
      calls++
      assert.equal(args.concurrency, 1)
      assert.equal(args.budget, 13228)
      assert.deepEqual(args.plan, plan.generation)
      assert.equal(typeof args.beforeRequests, 'function')
      return { completed: args.plan.expectedClips }
    } })
  assert.equal(calls, 1)
  assert.equal(existsSync(join(projectRoot, output)), false)
})

test('identical written Japanese with different approved readings cannot share a canonical recording', () => {
  const { bank, plan } = loadContextualAudition(projectRoot, { batch: 'pack1' })
  const config = JSON.parse(readFileSync(join(projectRoot, 'content/elevenlabs-voices.json')))
  // In-memory approval fixture only: no frozen repository text or paid call changes.
  const duplicate = plan.aliases.find(alias => alias.kind === 'question' && alias.id !== alias.itemId)
  const context = bank.contexts.find(entry => entry.id === duplicate.contextId)
  context.questions.find(question => question.id === duplicate.id).prompt.reading = 'べつのよみです。'
  const approved = { ...plan.approval, textSha256: contextualTextDigest(bank) }
  const changed = contextualAuditionPlan({ bank, approval: approved, config, batch: 'pack1' })
  const altered = changed.aliases.find(alias => alias.id === duplicate.id)
  assert.equal(altered.itemId, duplicate.id)
  assert.notEqual(altered.itemId, duplicate.itemId)
  assert.equal(changed.generation.expectedClips, plan.generation.expectedClips + 2)
})

test('changed frozen bytes or authored text fail before output, credentials or paid generation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'kikimashta-pack1-audio-approval-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const original = readFileSync(join(projectRoot, bankPath))
  const approval = JSON.parse(readFileSync(join(projectRoot, approvalPath)))
  const save = async (path, bytes) => {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), bytes)
  }
  await save('content/elevenlabs-voices.json', readFileSync(join(projectRoot, 'content/elevenlabs-voices.json')))
  await save(approvalPath, JSON.stringify(approval))
  await save(bankPath, Buffer.concat([original, Buffer.from('\n')]))
  let calls = 0
  const output = 'artifacts/generated-originals/pack1-invalid'
  const run = () => generateContextualAudition({ root, batch: 'pack1', output, apiKey: 'fixture-secret',
    generate: async () => { calls++ } })
  await assert.rejects(run(), /Frozen pack 1 source hash differs/)
  const changed = JSON.parse(original)
  changed.contexts[0].questions[0].prompt.text += '変更'
  const bytes = Buffer.from(JSON.stringify(changed))
  await save(bankPath, bytes)
  await save(approvalPath, JSON.stringify({ ...approval, sourceFileSha256: hash(bytes) }))
  await assert.rejects(run(), /approval.*differs/)
  assert.equal(calls, 0)
  assert.equal(existsSync(join(root, output)), false)
})
