import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entriesForLevel, generateLevel, instructionsFor } from './generate-catalog-audio.mjs'

const item = { id: 'ja-v-0123456789ab', sourceLevel: 1, text: '人口', reading: 'じんこう', meaning: 'Population' }
test('selects a level without regenerating existing starter assets', () => {
  const catalog = { items: [item, { ...item, id: 'ja-dog', reuseStarterAssets: true }, { ...item, sourceLevel: 2 }] }
  assert.deepEqual(entriesForLevel(catalog, 1), [item])
  assert.throws(() => entriesForLevel(catalog, 0), /level/)
  assert.throws(() => entriesForLevel({ items: [item, item] }, 1), /Invalid/)
  assert.match(instructionsFor(item), /人口.*じんこう.*Population/)
})
test('preserves successes and provenance when another voice fails, without retrying', async t => {
  const root = await mkdtemp(join(tmpdir(), 'kikimashta-catalog-audio-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const output = join(root, 'output')
  const pcm = Buffer.alloc(24000)
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(4000, i)
  const calls = []
  const speak = async (_key, voice, text, options) => {
    calls.push({ voice, text, options })
    if (voice === 'marin') throw new Error('External provider failed')
    return { pcm, transcript: text, usage: { output_tokens: 1 } }
  }
  // The real encoder is synchronous; use a synchronous fixture at that boundary.
  const { writeFileSync } = await import('node:fs')
  const result = await generateLevel({ catalog: { language: 'ja-JP', items: [item] }, level: 1, output, apiKey: 'test-only', speak,
    encodeFile: (wav, mp3) => { assert.match(wav, /cedar-ja-v-/); writeFileSync(mp3, 'fake mp3') } })
  assert.equal(calls.length, 2)
  assert.equal(calls[1].text, item.reading)
  assert.equal(calls[1].options.maxOutputTokens, 256)
  assert.equal(result.failures.length, 1)
  assert.equal(result.clips.length, 1)
  assert.equal((await readFile(join(output, 'cedar-' + item.id + '.wav'))).toString('ascii', 0, 4), 'RIFF')
  assert.deepEqual(JSON.parse(await readFile(join(output, 'provenance.json'), 'utf8')), result)
})
