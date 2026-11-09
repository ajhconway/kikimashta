import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { buildLibrary, libraryMediaPath } from './build-vocabulary-library.mjs'

function fixture(t, { missingAudio = false, missingImage = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kikimashta-vocabulary-library-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content))
  }
  const item = {
    id: 'ja-test', sourceLevel: 3, text: '花', reading: 'はな', meaning: 'Flower',
    image: { src: 'images/vocabulary/flower.svg', alt: 'A pink flower' },
    audio: ['marin', 'cedar'].map(voice => ({ voice, src: `audio/vocabulary/${voice}-flower.mp3` })),
  }
  const visual = { id: item.id, concept: 'A pink flower with green leaves', visualGroup: 'flower', reviewRequired: true, reviewNote: 'Check flower versus blossom in context.' }
  const save = (items = [item], visuals = [visual]) => {
    put('content/catalog/ja.json', { items })
    put('content/visuals/level-3.json', visuals)
  }
  save()
  if (!missingImage) put('public/images/vocabulary/flower.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>')
  put('public/audio/vocabulary/marin-flower.mp3', 'fixture clip')
  if (!missingAudio) put('public/audio/vocabulary/cedar-flower.mp3', 'fixture clip')
  return { root, put, save, item, visual, readData: () => JSON.parse(readFileSync(join(root, 'public/vocabulary/library-data.json'), 'utf8')) }
}

test('builds a safely nested library from catalogue and visual metadata, with actual voice availability', t => {
  const { root, readData } = fixture(t)
  assert.deepEqual(buildLibrary({ root }), { cards: 1, availableAudio: 2, missingAudio: 0 })
  const [card] = readData().cards
  assert.equal(card.text, '花')
  assert.equal(card.sourceLevel, 3)
  assert.equal(card.image.src, '../images/vocabulary/flower.svg')
  assert.deepEqual(card.audio, [
    { voice: 'marin', src: '../audio/vocabulary/marin-flower.mp3', available: true },
    { voice: 'cedar', src: '../audio/vocabulary/cedar-flower.mp3', available: true },
  ])
  assert.equal(card.visualGroup, 'flower')
  assert.equal(card.reviewRequired, true)
  assert.equal(card.reviewNote, 'Check flower versus blossom in context.')
  const html = readFileSync(join(root, 'vocabulary/index.html'), 'utf8')
  assert.match(html, /<title>Vocabulary cards<\/title>/)
  assert.match(html, /src="\.\/library.js" type="module"/)
  assert.equal(existsSync(join(root, 'public/vocabulary/index.html')), false)
  assert.match(html, /href="\.\.\/"/)
  assert.match(html, /href="\.\.\/credits.html"/)
  assert.match(html, /value="all"/)
  assert.match(html, /<label>Card pack/)
  assert.match(html, /id="pack" name="pack"/)
  assert.doesNotMatch(html, /<audio\b/)
  const before = readFileSync(join(root, 'public/vocabulary/library-data.json'), 'utf8')
  buildLibrary({ root })
  assert.equal(readFileSync(join(root, 'public/vocabulary/library-data.json'), 'utf8'), before)
})

test('default rejects missing audio before writing output; preview accurately disables only the absent clip', t => {
  const { root, readData } = fixture(t, { missingAudio: true })
  assert.throws(() => buildLibrary({ root }), /Missing 1 audio files/)
  assert.equal(existsSync(join(root, 'vocabulary/index.html')), false)
  assert.deepEqual(buildLibrary({ root, allowMissingAudio: true }), { cards: 1, availableAudio: 1, missingAudio: 1 })
  assert.deepEqual(readData().cards[0].audio.map(clip => clip.available), [true, false])
})

test('preview still rejects a missing picture', t => {
  const { root } = fixture(t, { missingImage: true, missingAudio: true })
  assert.throws(() => buildLibrary({ root, allowMissingAudio: true }), /Missing image/)
})

test('rejects traversal, foreign URLs, and media-family mismatches', () => {
  for (const path of ['../images/a.svg', '/images/a.svg', 'https://example.com/a.svg', 'images/../a.svg', 'images/%2e%2e/a.svg', 'images/a.svg?x=1', 'images/a.svg#x', 'images//a.svg', 'audio/a.svg']) {
    assert.throws(() => libraryMediaPath(path, 'images'), /Unsafe images media path/)
  }
  assert.throws(() => libraryMediaPath('images/a.html', 'images'), /Unsupported library image/)
  for (const extension of ['jpg', 'png', 'webp']) {
    assert.equal(libraryMediaPath(`images/apple.${extension}`, 'images'), `../images/apple.${extension}`)
  }
  assert.throws(() => libraryMediaPath('audio/a.wav', 'audio'), /must be MP3/)
  assert.equal(libraryMediaPath('images/apple.svg', 'images'), '../images/apple.svg')
})

test('requires complete unique visual records and catalogue items', t => {
  const { root, item, visual, put, save } = fixture(t)
  save([item], [])
  assert.throws(() => buildLibrary({ root }), /Incomplete visual metadata/)
  save([item], [{ ...visual, reviewNote: undefined }])
  assert.throws(() => buildLibrary({ root }), /Incomplete visual metadata/)
  save()
  put('content/visuals/other.json', [visual])
  assert.throws(() => buildLibrary({ root }), /duplicate visual metadata ID/)
  rmSync(join(root, 'content/visuals/other.json'))
  save([item, item])
  assert.throws(() => buildLibrary({ root }), /duplicate catalogue ID/)
  save([{ ...item, reading: '' }])
  assert.throws(() => buildLibrary({ root }), /Incomplete catalogue item/)
})

test('supports eight named voices in input order and counts their individual availability', t => {
  const { root, item, put, save, readData } = fixture(t)
  const names = ['Otani', 'Morioki', 'Goro', 'Tsuki', 'Takeshi', 'Lime', 'Ritsuto', 'Itsuki']
  const audio = names.map(voiceName => ({ voice: voiceName.toLowerCase(), voiceName, src: `audio/elevenlabs/${voiceName.toLowerCase()}/flower.mp3` }))
  for (const clip of audio.slice(0, -1)) put(`public/${clip.src}`, 'fixture clip')
  save([{ ...item, audio }])
  assert.throws(() => buildLibrary({ root }), /Missing 1 audio files/)
  assert.deepEqual(buildLibrary({ root, allowMissingAudio: true }), { cards: 1, availableAudio: 7, missingAudio: 1 })
  assert.deepEqual(readData().cards[0].audio.map(clip => clip.voiceName), names)
  assert.deepEqual(readData().cards[0].audio.map(clip => clip.available), [true, true, true, true, true, true, true, false])
  put(`public/${audio[7].src}`, 'fixture clip')
  assert.deepEqual(buildLibrary({ root }), { cards: 1, availableAudio: 8, missingAudio: 0 })
})

test('a single recording is sufficient without a special provider or voice name', t => {
  const { root, item, save, readData } = fixture(t)
  save([{ ...item, audio: [item.audio[0]] }])
  assert.deepEqual(buildLibrary({ root }), { cards: 1, availableAudio: 1, missingAudio: 0 })
  assert.deepEqual(readData().cards[0].audio, [{ voice: 'marin', src: '../audio/vocabulary/marin-flower.mp3', available: true }])
})

for (const [description, audio, pattern] of [
  ['no recordings', [], /at least one audio recording/],
  ['missing recordings', undefined, /at least one audio recording/],
  ['null recording', [null], /Invalid audio voice/],
  ['empty voice', [{ voice: '', src: 'audio/a.mp3' }], /Invalid audio voice/],
  ['unsafe voice', [{ voice: '../voice', src: 'audio/a.mp3' }], /Invalid audio voice/],
  ['blank display name', [{ voice: 'otani', voiceName: ' ', src: 'audio/a.mp3' }], /Invalid audio voice name/],
  ['duplicate voice', [{ voice: 'otani', src: 'audio/a.mp3' }, { voice: 'otani', src: 'audio/b.mp3' }], /Duplicate audio voice/],
]) test(`rejects ${description} before emitting library files`, t => {
  const { root, item, save } = fixture(t)
  save([{ ...item, audio }])
  assert.throws(() => buildLibrary({ root, allowMissingAudio: true }), pattern)
  assert.equal(existsSync(join(root, 'vocabulary/index.html')), false)
  assert.equal(existsSync(join(root, 'public/vocabulary/library-data.json')), false)
})

test('preserves text as data without interpolating it into markup; hides starter implementation notes', t => {
  const { root, item, visual, save, readData } = fixture(t)
  const text = '<img src=x onerror=alert(1)>'
  save([{ ...item, text, meaning: '& " <script>bad()</script>', reuseStarterAssets: true }], [{ ...visual, concept: 'Existing starter illustration' }])
  buildLibrary({ root })
  assert.equal(readData().cards[0].text, text)
  assert.equal(readData().cards[0].concept, 'A pink flower')
  assert.doesNotMatch(readFileSync(join(root, 'vocabulary/index.html'), 'utf8'), /onerror|bad\(\)|Existing starter/)
})


test('optional teaching overrides refine picture groups and flag context review without rewriting source text', t => {
  const { root, put, item, visual, save, readData } = fixture(t)
  save([item], [{ ...visual, reviewRequired: false, reviewNote: undefined }])
  put('content/catalog/review-overrides.json', { [item.id]: { visualGroup: 'blossom-family', teachingNote: 'Use this sense in a garden context.' } })
  buildLibrary({ root })
  const card = readData().cards[0]
  assert.equal(card.visualGroup, 'blossom-family')
  assert.equal(card.teachingNote, 'Use this sense in a garden context.')
  assert.equal(card.reviewRequired, true)
  assert.equal(card.text, item.text)
  assert.equal(card.meaning, item.meaning)
  put('content/catalog/review-overrides.json', { 'unknown-id': { visualGroup: 'flower' } })
  assert.throws(() => buildLibrary({ root }), /Unknown review override ID/)
  put('content/catalog/review-overrides.json', { [item.id]: { teachingNote: '' } })
  assert.throws(() => buildLibrary({ root }), /Invalid review override/)
})

test('owner removals survive repeated library rebuilds without changing retained source entries or media', t => {
  const { root, put, item, visual, save, readData } = fixture(t)
  const removed = { ...item, id: 'ja-removed', text: '～形', reading: 'けい', meaning: 'Form' }
  save([item, removed], [visual, { ...visual, id: removed.id }])
  buildLibrary({ root })
  const retained = readData().cards[0]
  const source = readFileSync(join(root, 'content/catalog/ja.json'))
  put('content/catalog/review-overrides.json', { [removed.id]: { removalReason: 'Owner removed this vocabulary entry.' } })
  for (let rebuild = 0; rebuild < 2; rebuild++) {
    assert.deepEqual(buildLibrary({ root }), { cards: 1, availableAudio: 2, missingAudio: 0 })
    assert.deepEqual(readData().cards, [retained])
    assert.deepEqual(readFileSync(join(root, 'content/catalog/ja.json')), source)
    assert.ok(existsSync(join(root, 'public', removed.image.src)))
    for (const clip of removed.audio) assert.ok(existsSync(join(root, 'public', clip.src)))
  }
  for (const removalReason of ['', true, null]) {
    put('content/catalog/review-overrides.json', { [removed.id]: { removalReason } })
    assert.throws(() => buildLibrary({ root }), /Invalid review override/)
    assert.deepEqual(readData().cards, [retained])
  }
})
