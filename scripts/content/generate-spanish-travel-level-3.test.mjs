import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bank from '../../content/spanish-travel-3/draft.json' with { type: 'json' }
import config from '../../content/spanish-travel-3/audio-config.json' with { type: 'json' }
import approval from '../../content/spanish-travel-3/audio-approval.json' with { type: 'json' }
import { spanishTravelLevel3Plan, generateSpanishTravelLevel3Pack } from './generate-spanish-travel-level-3.mjs'

test('level 3 generation binds all approved words and regional voices, separate from earlier packs', () => {
  const plan = spanishTravelLevel3Plan(bank, config, approval)
  assert.equal(plan.issue, 174)
  assert.equal(plan.expectedClips, 288)
  assert.equal(plan.characters, 2336)
  assert.equal(plan.items[0].text, 'banqueta')
  assert.equal(plan.items.at(-1).text, 'espejo')
  assert.deepEqual(plan.voices.map(v => v.voice), ['juan', 'pamela', 'albeiro', 'carito', 'santiago', 'agustina', 'carlos-figueroa', 'veronica'])
  for (const mutate of [
    d => { d.bank.generation.authorized = false },
    d => { d.bank.items[0].text = 'el tren' },
    d => { d.bank.items[0].meaning = 'A changed meaning' },
    d => { d.config.voices[0].id = 'another-voice' },
    d => { d.config.issue = 155 },
    d => { d.approval.characters = 2337 },
  ]) {
    const data = structuredClone({ bank, config, approval }); mutate(data)
    assert.throws(() => spanishTravelLevel3Plan(data.bank, data.config, data.approval))
  }
})

test('level 3 originals cannot be written into public assets or through an escaping symlink', async t => {
  const fail = () => assert.fail('Generation must not be called')
  await assert.rejects(generateSpanishTravelLevel3Pack({ output: 'public/audio', apiKey: 'fixture-secret', generate: fail }), /Keep originals/)
  const target = await mkdtemp(join(tmpdir(), 'spanish-level3-public-'))
  const link = join(process.cwd(), 'artifacts/generated-originals', `level3-symlink-${process.pid}`)
  t.after(async () => { await rm(link, { force: true }); await rm(target, { recursive: true, force: true }) })
  await mkdir(join(process.cwd(), 'artifacts/generated-originals'), { recursive: true })
  await symlink(target, link)
  await assert.rejects(generateSpanishTravelLevel3Pack({ output: join(link, 'new-batch'), apiKey: 'fixture-secret', generate: fail }), /Keep originals/)
})
