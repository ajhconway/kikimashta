import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { audioCollector, levelAudio, SENTENCE_INSTRUCTIONS, synthesize, wavFromPcm } from './audition-openai.mjs'

const pcm = Buffer.alloc(24000)
for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(i % 4 ? 4000 : -4000, i)
const delta = buffer => ({ type: 'response.output_audio.delta', delta: buffer.toString('base64') })
const completed = { type: 'response.done', response: { status: 'completed', usage: { output_tokens: 10 } } }

test('assembles streamed PCM in order, including chunks split inside a sample', () => {
  const collect = audioCollector()
  collect(delta(pcm.subarray(0, 3)))
  collect(delta(pcm.subarray(3)))
  collect({ type: 'response.output_audio_transcript.done', transcript: 'ねこ' })
  const result = collect(completed)
  assert.deepEqual(result.pcm, pcm)
  assert.equal(result.transcript, 'ねこ')
  const wav = wavFromPcm(result.pcm)
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.readUInt32LE(24), 24000)
  assert.equal(wav.readUInt32LE(40), pcm.length)
  assert.deepEqual(wav.subarray(44), pcm)
})

test('rejects failed, empty, invalid, and unexpectedly long output', () => {
  assert.throws(() => audioCollector()({ type: 'error', error: { code: 'insufficient_quota' } }), /insufficient_quota/)
  assert.throws(() => audioCollector()({ type: 'response.done', response: { status: 'incomplete' } }), /did not complete/)
  assert.throws(() => audioCollector()(completed), /Missing or invalid/)
  const odd = audioCollector()
  odd(delta(Buffer.alloc(24001)))
  assert.throws(() => odd(completed), /Missing or invalid/)
  assert.throws(() => audioCollector()(delta(Buffer.alloc(24000 * 2 * 8 + 2))), /Unexpectedly long/)
})

test('balances speech independently of silence and leaves peak headroom', () => {
  const withSilence = Buffer.concat([Buffer.alloc(24000), pcm, Buffer.alloc(24000)])
  assert.deepEqual(levelAudio(withSilence), levelAudio(pcm))
  const quiet = Buffer.alloc(24000)
  const highCrest = Buffer.alloc(24000)
  for (let i = 0; i < quiet.length; i += 2) {
    quiet.writeInt16LE(400, i)
    highCrest.writeInt16LE(1000, i)
  }
  highCrest.writeInt16LE(32000, 0)
  assert.ok(levelAudio(quiet).gainDb <= 9)
  const levels = levelAudio(highCrest)
  assert.ok(levels.rmsDb < -22) // The RMS target alone would boost this clip.
  assert.ok(Math.abs(levels.peakDb + levels.gainDb + 4) < 0.000001)
  assert.throws(() => levelAudio(Buffer.alloc(24000)), /no usable speech/)
})

function fakeTransport(run) {
  let instance
  class Socket extends EventEmitter {
    constructor(url, options) {
      super()
      this.sent = []
      this.url = url
      this.options = options
      instance = this
      queueMicrotask(() => run(this))
    }
    addEventListener(type, handler) { this.on(type, handler) }
    event(event) { this.emit('message', { data: JSON.stringify(event) }) }
    send(json) { this.sent.push(JSON.parse(json)) }
    close() { this.closed = true; this.emit('close') }
  }
  return { Socket, get instance() { return instance } }
}

test('waits for session configuration, sends one exact-word request, and closes on success', async () => {
  const transport = fakeTransport(socket => {
    socket.event({ type: 'session.created' })
    assert.equal(socket.sent.length, 1)
    assert.equal(socket.sent[0].session.audio.output.voice, 'marin')
    socket.event({ type: 'session.updated' })
    socket.event({ type: 'session.updated' })
    assert.equal(socket.sent.length, 2)
    assert.equal(socket.sent[1].response.input[0].content[0].text, 'ねこ')
    assert.equal(socket.sent[1].response.conversation, 'none')
    socket.event(delta(pcm))
    socket.event(completed)
  })
  const result = await synthesize('local-test-key', 'marin', 'ねこ', transport)
  assert.deepEqual(result.pcm, pcm)
  assert.equal(transport.instance.closed, true)
  assert.equal(transport.instance.options.headers.Authorization, 'Bearer local-test-key')
  assert.ok(!transport.instance.url.includes('local-test-key'))
})

test('early close and timeout reject without retrying or exposing the key', async () => {
  const early = fakeTransport(socket => socket.close())
  await assert.rejects(synthesize('local-test-key', 'marin', 'ねこ', early), /closed before/)
  const stalled = fakeTransport(() => {})
  await assert.rejects(synthesize('local-test-key', 'marin', 'ねこ', { ...stalled, timeoutMs: 5 }), /timed out/)
  assert.equal(stalled.instance.closed, true)
})

test('sentence generation preserves the full text and accepts speech beyond the word limit', async () => {
  const text = '雨が降っているので、かさを持っていきます。'
  const longerPcm = Buffer.alloc(24000 * 2 * 9)
  const transport = fakeTransport(socket => {
    socket.event({ type: 'session.created' })
    assert.equal(socket.sent[0].session.instructions, SENTENCE_INSTRUCTIONS)
    assert.match(socket.sent[0].session.instructions, /complete sentences/)
    socket.event({ type: 'session.updated' })
    assert.equal(socket.sent[1].response.input[0].content[0].text, text)
    assert.equal(socket.sent[1].response.max_output_tokens, 512)
    socket.event(delta(longerPcm))
    socket.event(completed)
  })
  const result = await synthesize('local-test-key', 'cedar', text, {
    Socket: transport.Socket, instructions: SENTENCE_INSTRUCTIONS, maxOutputTokens: 512, maxSeconds: 12,
  })
  assert.deepEqual(result.pcm, longerPcm)
  assert.throws(() => audioCollector(12)(delta(Buffer.alloc(24000 * 2 * 12 + 2))), /Unexpectedly long/)
})
