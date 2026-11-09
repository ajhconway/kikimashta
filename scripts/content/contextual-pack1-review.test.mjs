import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { renderPack1AudioReview } from './build-contextual-pack1-audio-review.mjs'

test('one native player handles single pairs, the filtered queue, filter changes and an empty result', async t => {
  const vocabulary = [{ id: 'ja-cat', text: '猫', meaning: 'cat' }, { id: 'ja-dog', text: '犬', meaning: 'dog' }]
  const contexts = [{ id: 'ja-cat-context', targetItemId: 'ja-cat', stage: 'simple' }, { id: 'ja-dog-context', targetItemId: 'ja-dog', stage: 'contrastive' }]
  const review = { contexts, gapMs: 650, voices: [{ voice: 'otani', name: 'Otani' }, { voice: 'morioki', name: 'Morioki' }],
    samples: [['ja-cat-context', 'otani', 'target'], ['ja-cat-context', 'morioki', 'detail'], ['ja-dog-context', 'otani', 'target']]
      .map(([contextId, voice, kind], index) => ({ contextId, voice, voiceName: voice,
        src: `samples/pair-${index}.wav`, sentence: { text: '猫です。', reading: 'ねこです。', meaning: 'It is a cat.' },
        question: { id: `${contextId}-${kind}`, text: '何ですか。', reading: 'なんですか。', meaning: 'What is it?', correctAnswer: '猫', correctMeaning: 'cat' } })) }
  const played = []
  let pauses = 0
  const dom = new JSDOM(renderPack1AudioReview(review, vocabulary), { url: 'http://127.0.0.1/review/index.html', runScripts: 'dangerously',
    beforeParse(window) {
      // Native media is the boundary; exercise the actual rendered interaction code.
      window.HTMLMediaElement.prototype.play = function () { played.push(this.getAttribute('src')); return Promise.resolve() }
      window.HTMLMediaElement.prototype.pause = function () { pauses++ }
    } })
  t.after(() => dom.window.close())
  const document = dom.window.document, audio = document.querySelector('audio')
  assert.equal(document.querySelectorAll('audio').length, 1)
  assert.equal(document.querySelectorAll('.play-pair').length, 3)
  audio.currentTime = 5
  document.getElementById('play').click()
  assert.equal(played.at(-1), 'samples/pair-0.wav')
  assert.equal(audio.currentTime, 0, 'each presentation resets the native media clock')
  audio.dispatchEvent(new dom.window.Event('ended'))
  assert.equal(played.at(-1), 'samples/pair-1.wav')
  assert.match(document.getElementById('status').textContent, /^2\/3/)
  const change = (id, value) => {
    const select = document.getElementById(id); select.value = value
    select.dispatchEvent(new dom.window.Event('change'))
  }
  change('voice', 'morioki')
  const stoppedAt = played.length
  audio.dispatchEvent(new dom.window.Event('ended'))
  assert.equal(played.length, stoppedAt, 'filtering stops the previous queue')
  assert.equal(document.getElementById('count').textContent, '1 visible pairs')
  document.getElementById('play').click()
  assert.equal(played.at(-1), 'samples/pair-1.wav')
  change('target', 'ja-dog')
  assert.equal(document.getElementById('count').textContent, '0 visible pairs')
  assert.equal(document.getElementById('play').disabled, true)
  const emptyAt = played.length
  document.getElementById('play').click()
  assert.equal(played.length, emptyAt)
  change('voice', ''); change('target', '')
  document.querySelectorAll('.play-pair')[2].click()
  assert.equal(played.at(-1), 'samples/pair-2.wav')
  assert.match(document.getElementById('status').textContent, /^1\/1/)
  const singleAt = played.length
  audio.dispatchEvent(new dom.window.Event('ended'))
  assert.equal(played.length, singleAt, 'single-pair playback does not start another pair')
  assert.equal(document.getElementById('status').textContent, 'Finished')
  assert.ok(pauses > 0)
})

for (const action of ['filter and restart', 'advance to next pair']) {
  test(`an earlier play rejection cannot overwrite playback after ${action}`, async t => {
    const vocabulary = [{ id: 'ja-cat', text: '猫', meaning: 'cat' }]
    const review = { gapMs: 650, contexts: [{ id: 'ja-context', targetItemId: 'ja-cat', stage: 'simple' }],
      voices: [{ voice: 'otani', name: 'Otani' }, { voice: 'morioki', name: 'Morioki' }],
      samples: ['otani', 'morioki'].map((voice, index) => ({ contextId: 'ja-context', voice, voiceName: voice,
        src: `samples/pair-${index}.wav`, sentence: { text: '猫です。', reading: 'ねこです。', meaning: 'It is a cat.' },
        question: { id: `ja-context-${index ? 'detail' : 'target'}`, text: '何ですか。', reading: 'なんですか。', meaning: 'What is it?', correctAnswer: '猫', correctMeaning: 'cat' } })) }
    let rejectEarlier, calls = 0
    const dom = new JSDOM(renderPack1AudioReview(review, vocabulary), { url: 'http://127.0.0.1/review/index.html', runScripts: 'dangerously',
      beforeParse(window) {
        window.HTMLMediaElement.prototype.play = function () {
          calls++
          return calls === 1 ? new Promise((_resolve, reject) => { rejectEarlier = reject }) : Promise.resolve()
        }
        window.HTMLMediaElement.prototype.pause = function () {}
      } })
    t.after(() => dom.window.close())
    const document = dom.window.document, audio = document.querySelector('audio')
    document.getElementById('play').click()
    if (action === 'filter and restart') {
      const voice = document.getElementById('voice'); voice.value = 'morioki'
      voice.dispatchEvent(new dom.window.Event('change'))
      document.getElementById('play').click()
    } else audio.dispatchEvent(new dom.window.Event('ended'))
    assert.equal(audio.getAttribute('src'), 'samples/pair-1.wav')
    const expected = document.getElementById('status').textContent
    rejectEarlier(new Error('the old source was interrupted'))
    await Promise.resolve()
    assert.equal(document.getElementById('status').textContent, expected)
    audio.dispatchEvent(new dom.window.Event('ended'))
    assert.equal(document.getElementById('status').textContent, 'Finished', 'the new queue remains active')
    assert.equal(calls, 2)
  })
}
