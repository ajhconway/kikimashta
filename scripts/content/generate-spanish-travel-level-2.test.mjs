import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bank from '../../content/spanish-travel-2/draft.json' with { type: 'json' }
import config from '../../content/spanish-travel-2/audio-config.json' with { type: 'json' }
import approval from '../../content/spanish-travel-2/audio-approval.json' with { type: 'json' }
import { spanishTravelLevel2Plan, generateSpanishTravelLevel2Pack } from './generate-spanish-travel-level-2.mjs'

test('level 2 generation binds all approved words and regional voices, separate from level 1', () => {
  const plan = spanishTravelLevel2Plan(bank, config, approval)
  assert.equal(plan.issue, 166)
  assert.equal(plan.expectedClips, 288)
  assert.equal(plan.characters, 2240)
  assert.equal(plan.items[0].text, 'estación de tren')
  assert.equal(plan.items.at(-1).text, 'lentes de sol')
  assert.deepEqual(plan.voices.map(v => v.voice), ['juan', 'pamela', 'albeiro', 'carito', 'santiago', 'agustina', 'carlos-figueroa', 'veronica'])
  for (const mutate of [
    d => { d.bank.generation.authorized = false },
    d => { d.bank.items[0].text = 'el tren' },
    d => { d.bank.items[0].meaning = 'A changed meaning' },
    d => { d.config.voices[0].id = 'another-voice' },
    d => { d.config.issue = 155 },
    d => { d.approval.characters = 2241 },
  ]) {
    const data = structuredClone({ bank, config, approval }); mutate(data)
    assert.throws(() => spanishTravelLevel2Plan(data.bank, data.config, data.approval))
  }
})

test('level 2 originals cannot be written into public assets or through an escaping symlink', async t => {
  const fail = () => assert.fail('Generation must not be called')
  await assert.rejects(generateSpanishTravelLevel2Pack({ output: 'public/audio', apiKey: 'fixture-secret', generate: fail }), /Keep originals/)
  const target = await mkdtemp(join(tmpdir(), 'spanish-level2-public-'))
  const link = join(process.cwd(), 'artifacts/generated-originals', `level2-symlink-${process.pid}`)
  t.after(async () => { await rm(link, { force: true }); await rm(target, { recursive: true, force: true }) })
  await mkdir(join(process.cwd(), 'artifacts/generated-originals'), { recursive: true })
  await symlink(target, link)
  await assert.rejects(generateSpanishTravelLevel2Pack({ output: join(link, 'new-batch'), apiKey: 'fixture-secret', generate: fail }), /Keep originals/)
})
