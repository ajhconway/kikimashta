import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, access, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { auditionPlan, generateAudition, speechBody, synthesize } from './audition-elevenlabs.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kikimashta-elevenlabs-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, output: join(root, 'audition') }
}

test('dry run works without credentials, reports paid request count, and creates no files', async t => {
  const { root } = await fixture(t)
  const script = fileURLToPath(new URL('./audition-elevenlabs.mjs', import.meta.url))
  for (const voices of [[], ['--voice', 'voiceA', '--voice', 'voiceB']]) {
    const result = spawnSync(process.execPath, [script, '--dry-run', ...voices], { cwd: root, env: {}, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    const plan = JSON.parse(result.stdout)
    assert.equal(plan.requestsPerVoice, 7)
    assert.equal(plan.requests, voices.length ? 14 : null)
    assert.equal(plan.samples.filter(sample => sample.kind === 'word').length, 3)
    assert.equal(plan.samples.filter(sample => sample.kind === 'sentence').length, 4)
    assert.equal(plan.textCharactersPerVoice, plan.samples.reduce((sum, item) => sum + [...item.text].length, 0))
  }
  assert.deepEqual(await readdir(root), [])
})

test('Node env-file loading configures audition voices without exposing the key in dry-run output', async t => {
  const { root } = await fixture(t)
  const script = fileURLToPath(new URL('./audition-elevenlabs.mjs', import.meta.url))
  await writeFile(join(root, '.env.local'), 'ELEVENLABS_API_KEY=test-secret\nELEVENLABS_VOICE_IDS=voiceA,voiceB\n')
  const result = spawnSync(process.execPath, ['--env-file-if-exists=.env.local', script, '--dry-run'], { cwd: root, env: {}, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout).voices, ['voiceA', 'voiceB'])
  assert.doesNotMatch(result.stdout + result.stderr, /test-secret/)
  assert.deepEqual(await readdir(root), ['.env.local'])
})

test('SDK request uses the chosen voice, Japanese text and documented MP3 format, with no key in body', async t => {
  const audio = Buffer.from([0x49, 0x44, 0x33, 1, 2, 3])
  let calls = 0
  const plan = auditionPlan({ voices: ['native_voice'] })
  const body = speechBody(plan, 'ねこ')
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++
    assert.equal(url, 'https://api.elevenlabs.io/v1/text-to-speech/native_voice?output_format=mp3_44100_128')
    assert.equal(new Headers(options.headers).get('xi-api-key'), 'test-secret')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), { text: 'ねこ', model_id: 'eleven_v4', language_code: 'ja', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
    assert.ok(options.signal instanceof AbortSignal)
    return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'request-id': 'request-123' } })
  })
  const result = await synthesize('test-secret', plan.voices[0], body, { timeoutMs: 1000 })
  assert.equal(calls, 1)
  assert.deepEqual(result.audio, audio)
  assert.equal(result.requestId, 'request-123')
  assert.equal(speechBody(auditionPlan({ model: 'eleven_multilingual_v2' }), 'ねこ').language_code, undefined)
})

test('SDK rejects HTTP errors, nonaudio, empty responses and transport failure without retrying or exposing secrets', async t => {
  for (const [response, pattern] of [
    [() => new Response('test-secret', { status: 401 }), /HTTP 401/],
    [() => new Response('test-secret', { status: 429 }), /HTTP 429/],
    [() => new Response('test-secret', { status: 500 }), /HTTP 500/],
    [() => new Response('{}', { headers: { 'Content-Type': 'application/json' } }), /MP3/],
    [() => new Response('', { headers: { 'Content-Type': 'audio/mpeg' } }), /empty/],
    [() => { throw new Error('test-secret') }, /connection failed/],
    [() => new Response(new ReadableStream({ start(controller) { controller.error(new Error('test-secret')) } }), { headers: { 'Content-Type': 'audio/mpeg' } }), /download failed/],
  ]) {
    let calls = 0
    t.mock.method(globalThis, 'fetch', async () => { calls++; return response() })
    await assert.rejects(synthesize('test-secret', 'voiceA', speechBody(auditionPlan(), 'ねこ'), { timeoutMs: 1000 }), error => {
      assert.match(error.message, pattern)
      assert.doesNotMatch(error.message, /test-secret/)
      return true
    })
    assert.equal(calls, 1)
  }
})

test('preserves exact provider bytes, request settings and hashes for every sample and refuses overwrite', async t => {
  const { output } = await fixture(t)
  const plan = auditionPlan({ voices: ['voiceA', 'voiceB'] })
  const audio = Buffer.from('ID3 fixture provider audio')
  const calls = []
  const speak = async (_key, voice, body) => { calls.push({ voice, body }); return { audio, requestId: 'request-123' } }
  const manifest = await generateAudition({ plan, output, apiKey: 'test-secret', speak })
  assert.equal(calls.length, 14)
  assert.equal(manifest.clips.length, 14)
  assert.deepEqual(manifest.failures, [])
  const serialized = await readFile(join(output, 'provenance.json'), 'utf8')
  assert.doesNotMatch(serialized, /test-secret/)
  assert.deepEqual(JSON.parse(serialized), manifest)
  for (const [i, clip] of manifest.clips.entries()) {
    assert.deepEqual(await readFile(join(output, clip.file)), audio)
    assert.equal(clip.sha256, createHash('sha256').update(audio).digest('hex'))
    assert.equal(clip.original, clip.file)
    assert.deepEqual(clip.request, calls[i].body)
    assert.equal(clip.voice, calls[i].voice)
  }
  const html = await readFile(join(output, 'index.html'), 'utf8')
  assert.equal((html.match(/<audio /g) ?? []).length, 14)
  for (const clip of manifest.clips) assert.ok(html.includes(`src="${clip.file}"`))
  await assert.rejects(generateAudition({ plan, output, apiKey: 'test-secret', speak }), { code: 'EEXIST' })
  assert.equal(calls.length, 14)
})

test('stops immediately after a failed request and retains playable successes and sanitized failure provenance', async t => {
  const { output } = await fixture(t)
  let calls = 0
  await assert.rejects(generateAudition({ plan: auditionPlan({ voices: ['voiceA', 'voiceB'] }), output, apiKey: 'test-secret',
    speak: async () => {
      if (++calls === 2) throw new Error('provider leaked test-secret')
      return { audio: Buffer.from('ID3 fixture') }
    },
  }), /Successful samples preserved/)
  assert.equal(calls, 2)
  const serialized = await readFile(join(output, 'provenance.json'), 'utf8')
  assert.doesNotMatch(serialized, /test-secret/)
  const manifest = JSON.parse(serialized)
  assert.equal(manifest.clips.length, 1)
  assert.deepEqual(manifest.failures.map(({ id, voice }) => ({ id, voice })), [{ id: 'apple', voice: 'voiceA' }])
  assert.equal((await readFile(join(output, 'voiceA-cat.mp3'))).toString(), 'ID3 fixture')
  const html = await readFile(join(output, 'index.html'), 'utf8')
  assert.match(html, /voiceA-cat.mp3/)
  assert.doesNotMatch(html, /voiceA-apple.mp3/)
})

test('validates configuration and credentials before making requests or creating output', async t => {
  const { output } = await fixture(t)
  for (const voices of [['voiceA', 'voiceA'], ['../escape'], ['a', 'b', 'c', 'd'], [''], [null]]) {
    assert.throws(() => auditionPlan({ voices }), /voice IDs/)
  }
  assert.throws(() => auditionPlan({ model: '' }), /model ID/)
  for (const [plan, apiKey, pattern] of [
    [auditionPlan(), 'test-secret', /VOICE_IDS/],
    [auditionPlan({ voices: ['voiceA'] }), '', /API_KEY/],
  ]) {
    await assert.rejects(generateAudition({ plan, apiKey, output, speak: async () => assert.fail('Must not call provider') }), pattern)
    await assert.rejects(access(output), { code: 'ENOENT' })
  }
})
