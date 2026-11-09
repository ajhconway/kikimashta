import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, mkdir, copyFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spanishBasicLevel1Plan, loadSpanishBasicLevel1Plan, generateSpanishBasicLevel1 } from './generate-spanish-basic-level-1.mjs'

async function fixture() {
  const [draftText, registry, config, approval, authorizationText] = await Promise.all([
    'content/spanish-basic-1/draft.json', 'content/es-419-voices.json', 'content/spanish-basic-1/audio-config.json',
    'content/spanish-basic-1/audio-approval.json', 'content/spanish-basic-1/generation-approval.json',
  ].map(async (path, index) => { const text = await readFile(path, 'utf8'); return [0, 4].includes(index) ? text : JSON.parse(text) }))
  return { draftText, registry, config, approval, authorizationText }
}
const planFor = f => spanishBasicLevel1Plan(f.draftText, f.registry, f.config, f.approval, f.authorizationText)

test('locks canonical words and all contextual parts to the exact reviewed draft and eight voices', async () => {
  const plan = planFor(await fixture())
  assert.equal(plan.expectedClips, 336)
  assert.equal(plan.characters, 4760)
  assert.equal(plan.items.filter(i => i.role === 'word').length, 24)
  assert.equal(plan.items.filter(i => i.role === 'sentence').length, 9)
  assert.equal(plan.items.filter(i => i.role === 'question').length, 9)
  assert.equal(plan.items.find(i => i.id === 'es-419-basic-have').text, 'tener')
  assert.deepEqual(plan.items.find(i => i.id === 'es-419-basic-ctx-have-01-question'), {
    id: 'es-419-basic-ctx-have-01-question', text: '¿Qué tengo?', spelling: '¿Qué tengo?', meaning: 'What do I have?',
    role: 'question', contextId: 'es-419-basic-ctx-have-01', targetItemId: 'es-419-basic-have', contextRevision: 1,
  })
  assert.equal(plan.items.find(i => i.id === 'es-419-basic-ctx-have-01-sentence').text, 'Tengo una llave. Necesito un boleto.')
  assert.deepEqual(plan.voices.map(v => v.voice), ['juan', 'pamela', 'albeiro', 'carito', 'santiago', 'agustina', 'carlos-figueroa', 'veronica'])
})

test('rejects changed draft bytes, approvals, spoken roles, voices and generation bounds', async () => {
  for (const mutate of [
    f => { f.draftText += '\n' },
    f => { f.draftText = f.draftText.replace('¿Qué tengo?', '¿Qué quiero?') },
    f => { f.authorizationText = f.authorizationText.replace('336', '344') },
    f => { f.approval.items[24].role = 'word' },
    f => { f.approval.generationApprovalSha256 = 'changed' },
    f => { f.config.voices[0].id = 'different-provider-voice' },
    f => { f.registry.voices[0].id = 'different-registry-voice' },
    f => { f.config.issue = 174 },
    f => { f.approval.characters = 4761 },
  ]) {
    const data = await fixture(); mutate(data)
    assert.throws(() => planFor(data))
  }
})

test('draft tampering stops the paid generation boundary before any provider call', async t => {
  const root = await mkdtemp(join(tmpdir(), 'spanish-basic-approval-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const file of ['content/spanish-basic-1/draft.json', 'content/es-419-voices.json', 'content/spanish-basic-1/audio-config.json', 'content/spanish-basic-1/audio-approval.json', 'content/spanish-basic-1/generation-approval.json']) {
    await mkdir(dirname(join(root, file)), { recursive: true }); await copyFile(file, join(root, file))
  }
  const path = join(root, 'content/spanish-basic-1/draft.json')
  await writeFile(path, (await readFile(path, 'utf8')).replace('Tengo una llave.', 'Quiero una llave.'))
  await assert.rejects(generateSpanishBasicLevel1({ root, output: 'artifacts/generated-originals/test', apiKey: 'fixture-secret', generate: () => assert.fail('No paid call may start') }), /authorization changed/)
})

test('refuses public output, escaping ancestor symlinks and dangling symlinks before generation', async t => {
  const generate = () => assert.fail('No provider call may start')
  await assert.rejects(generateSpanishBasicLevel1({ output: 'public/audio', apiKey: 'fixture-secret', generate }), /Keep originals/)
  const outside = await mkdtemp(join(tmpdir(), 'spanish-basic-public-'))
  const privateRoot = join(process.cwd(), 'artifacts/generated-originals'), link = join(privateRoot, `basic-symlink-${process.pid}`)
  await mkdir(privateRoot, { recursive: true })
  t.after(async () => { await rm(link, { force: true }); await rm(outside, { recursive: true, force: true }) })
  for (const target of [outside, join(outside, 'missing')]) {
    await symlink(target, link)
    await assert.rejects(generateSpanishBasicLevel1({ output: join(link, 'batch'), apiKey: 'fixture-secret', generate }), /Keep originals/)
    await rm(link)
  }
  assert.equal((await loadSpanishBasicLevel1Plan()).plan.issue, 191)
})
