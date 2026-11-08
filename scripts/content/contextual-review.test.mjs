import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildContextualReview, renderContextualMarkdown } from './build-contextual-review.mjs'
import { loadContextualPilot } from './validate-contextual.mjs'
import { AUDIO_CONTEXT_IDS } from './contextual-audio-plan.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'contextual-review-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value))
  }
  const vocabulary = [
    { id: 'book', text: '本', reading: 'ほん', meaning: 'Book', image: { src: 'images/book.svg', alt: 'A book' } },
    { id: 'notebook', text: 'ノート', reading: 'のーと', meaning: 'Notebook', image: { src: 'images/notebook.svg', alt: 'A notebook' } },
  ]
  const prompt = (text, reading, meaning) => ({ text, reading, meaning, grammarTags: ['existence'], supportingVocabularyIds: [] })
  const bank = {
    schemaVersion: 1, id: 'review-fixture', language: 'ja-JP', grammarProfile: 'genki-1',
    grammarReference: 'https://bookclub2.japantimes.co.jp/download/files/genki3/genki-3rd_syllabus_E.pdf',
    grammarPoints: [{ id: 'existence', label: 'あります', genkiLesson: 4 }], supportingVocabulary: [],
    contexts: [{
      id: 'book-on-table', revision: 1, targetItemId: 'book', targetOccurrence: { surface: '本', reading: 'ほん' },
      sentence: prompt('本があります。', 'ほんがあります。', 'There is a book.'),
      questions: [{
        id: 'what-is-there', revision: 1, kind: 'target', formats: ['picture', 'text'],
        prompt: prompt('何がありますか。', 'なにがありますか。', 'What is there?'),
        options: [
          { id: 'choose-book', ...prompt('本', 'ほん', 'Book'), vocabularyItemId: 'book', imageItemId: 'book' },
          { id: 'choose-notebook', ...prompt('ノート', 'のーと', 'Notebook'), vocabularyItemId: 'notebook', imageItemId: 'notebook' },
        ],
        correctOptionId: 'choose-book', explanation: 'The sentence says book, not notebook.',
      }],
      recordings: [], review: { text: 'pending', audio: 'not-generated' }, reviewNotes: 'Review the object pictures.',
    }],
  }
  const save = () => {
    put('content/contextual/ja-pilot.json', bank)
    put('content/catalog/ja.json', { items: vocabulary })
  }
  save()
  put('content/catalog/review-overrides.json', {})
  put('content/practice-pool.json', { itemIds: ['book'] })
  put('content/ja.json', { items: [] })
  for (const word of vocabulary) put(`public/${word.image.src}`, '<svg xmlns="http://www.w3.org/2000/svg"/>')
  return { root, bank, vocabulary, put, save, html: () => readFileSync(join(root, 'artifacts/contextual-pilot/review.html'), 'utf8') }
}

test('builds a review showing the actual sentence, question, readings, meaning, all choices and proposed pictures', t => {
  const { root, html } = fixture(t)
  const result = buildContextualReview({ root })
  assert.equal(result.contexts, 1)
  assert.equal(result.questions, 1)
  assert.equal(result.readyPictureQuestions, 0)
  const output = html()
  assert.match(output, /本があります。/)
  assert.match(output, /ほんがあります。/)
  assert.match(output, /What is there\?/)
  assert.match(output, /Authored correct answer/)
  assert.match(output, /ノート/)
  assert.match(output, /Text: pending · Audio: not-generated/)
  assert.match(output, /src="\.\.\/\.\.\/public\/images\/book.svg"/)
  assert.match(output, /Genki I 4/)
  assert.doesNotMatch(output, /<audio\b|<script\b/)
  buildContextualReview({ root })
  assert.equal(html(), output, 'rebuilding the same reviewed input is deterministic')
  assert.equal(existsSync(join(root, 'public/contextual-review')), false, 'review generation does not publish a practice page')
})

test('escapes authored text, target labels and image descriptions in the HTML and GitHub review', t => {
  const { root, bank, vocabulary, save, html } = fixture(t)
  bank.contexts[0].reviewNotes = '<script>alert("notes")</script>'
  bank.contexts[0].questions[0].explanation = '<img src=x onerror=alert(1)>'
  vocabulary[0].meaning = '<b>Book</b>'
  vocabulary[0].image.alt = '"><script>alert("picture")</script>'
  save()
  buildContextualReview({ root })
  assert.doesNotMatch(html(), /<script\b|<img src=x/)
  assert.match(html(), /&lt;script&gt;/)
  assert.match(html(), /&quot;&gt;&lt;script&gt;/)
  const loaded = loadContextualPilot(root)
  const markdown = renderContextualMarkdown(loaded.bank, loaded.vocabulary)
  assert.doesNotMatch(markdown, /<script\b|alt=""><script/)
  assert.match(markdown, /&lt;script&gt;/)
  assert.match(markdown, /raw.githubusercontent.com\/ajhconway\/kikimashta\/codex\/contextual-pilot-119\/public\/images\/book.svg/)
})

test('rejects incomplete media and removed catalogue references before creating a review artifact', t => {
  const { root, put } = fixture(t)
  rmSync(join(root, 'public/images/book.svg'))
  assert.throws(() => buildContextualReview({ root }), /missing picture/)
  assert.equal(existsSync(join(root, 'artifacts/contextual-pilot/review.html')), false)
  put('public/images/book.svg', '<svg/>')
  put('content/catalog/review-overrides.json', { book: { removalReason: 'Owner removed it.' } })
  assert.throws(() => loadContextualPilot(root), /removed/)
})

test('GitHub review includes every question and identifies each authored correct choice', t => {
  const { root } = fixture(t)
  const { bank, vocabulary } = loadContextualPilot(root)
  const markdown = renderContextualMarkdown(bank, vocabulary)
  assert.match(markdown, /<details><summary>1\. 本 — book-on-table<\/summary>/)
  assert.match(markdown, /\*\*what-is-there\*\*/)
  assert.match(markdown, /\| 本 \| ほん \| Book \| Correct \|/)
  assert.match(markdown, /\| ノート \| のーと \| Notebook \| Distractor \|/)
  assert.match(markdown, /Text approved for 0\/1 contexts/)
})

test('the checked-in pilot covers both question kinds and formats with approved text and no active audio', () => {
  const { bank } = loadContextualPilot()
  const targets = new Map()
  for (const context of bank.contexts) {
    const contexts = targets.get(context.targetItemId) ?? []
    contexts.push(context)
    targets.set(context.targetItemId, contexts)
    assert.deepEqual(new Set(context.questions.map(question => question.kind)), new Set(['target', 'detail']))
    assert.equal(context.review.text, 'approved')
    assert.equal(context.review.audio, AUDIO_CONTEXT_IDS.includes(context.id) ? 'pending' : 'not-generated')
    assert.deepEqual(context.recordings, [])
  }
  assert.equal(targets.size, 10)
  for (const contexts of targets.values()) assert.ok(contexts.length >= 2 && contexts.length <= 3)
  const questions = bank.contexts.flatMap(context => context.questions)
  assert.ok(questions.some(question => question.formats.includes('picture')))
  assert.ok(questions.some(question => question.formats.includes('text')))
})
