import assert from 'node:assert/strict'
import test from 'node:test'
import { createFeedbackStore, exportFeedback } from '../../public/vocabulary/feedback.js'

function memoryStorage() {
  const data = new Map()
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  }
}
const cards = [
  { id: 'ja-dog', text: '犬', reading: 'いぬ', meaning: 'Dog', sourceLevel: 2 },
  { id: 'ja-apple', text: 'リンゴ', reading: 'りんご', meaning: 'Apple', sourceLevel: 1 },
]

test('notes persist by item and language; blank text clears only its own note', () => {
  const storage = memoryStorage()
  const store = createFeedbackStore({ language: 'ja', storage: () => storage })
  store.write('ja-dog', '  Softer ending, please.\n犬  ')
  store.write('ja-apple', 'Picture is too small.')
  const reopened = createFeedbackStore({ language: 'ja', storage: () => storage })
  assert.equal(reopened.read('ja-dog').text, '  Softer ending, please.\n犬  ')
  assert.equal(reopened.read('ja-apple').text, 'Picture is too small.')
  assert.equal(createFeedbackStore({ language: 'fr', storage: () => storage }).read('ja-dog').text, '')
  reopened.write('ja-dog', ' \n ')
  const fresh = createFeedbackStore({ language: 'ja', storage: () => storage })
  assert.equal(fresh.read('ja-dog').text, '')
  assert.equal(fresh.read('ja-apple').text, 'Picture is too small.')
  assert.equal(reopened.hasUnsavedChanges(), false)
})

test('an unavailable storage getter does not lose a draft or prevent its export', () => {
  const store = createFeedbackStore({ language: 'ja', storage: () => { throw new Error('Blocked') } })
  assert.equal(store.read('ja-dog').saved, false)
  assert.equal(store.hasUnsavedChanges(), false)
  const note = store.write('ja-dog', 'Voice sounds clipped.')
  assert.equal(note.saved, false)
  assert.equal(store.read('ja-dog').text, 'Voice sounds clipped.')
  assert.equal(store.hasUnsavedChanges(), true)
  const data = exportFeedback(cards, store, 'ja', '2026-11-05T12:00:00.000Z')
  assert.equal(data.notes[0].feedback, 'Voice sounds clipped.')
})

test('failed writes retain the latest draft and recover on a later edit', () => {
  const storage = memoryStorage()
  const store = createFeedbackStore({ language: 'ja', storage: () => storage })
  store.write('ja-dog', 'Original')
  const save = storage.setItem
  storage.setItem = () => { throw new Error('Quota exceeded') }
  assert.equal(store.write('ja-dog', 'Changed').saved, false)
  assert.equal(store.read('ja-dog').text, 'Changed')
  assert.equal(createFeedbackStore({ language: 'ja', storage: () => storage }).read('ja-dog').text, 'Original')
  storage.setItem = save
  assert.equal(store.write('ja-dog', 'Try again').saved, true)
  assert.equal(store.hasUnsavedChanges(), false)
  assert.equal(createFeedbackStore({ language: 'ja', storage: () => storage }).read('ja-dog').text, 'Try again')
})

test('failed deletion is unsaved and does not resurrect a cleared note in this session', () => {
  const storage = memoryStorage()
  const store = createFeedbackStore({ language: 'ja', storage: () => storage })
  store.write('ja-dog', 'Old note')
  storage.removeItem = () => { throw new Error('Blocked') }
  assert.equal(store.write('ja-dog', '').saved, false)
  assert.equal(store.hasUnsavedChanges(), true)
  assert.equal(store.read('ja-dog').text, '')
  assert.deepEqual(exportFeedback(cards, store, 'ja').notes, [])
})

test('export contains all nonblank notes, metadata and literal text without changing stored notes', () => {
  const storage = memoryStorage()
  const store = createFeedbackStore({ language: 'ja', storage: () => storage })
  store.write('ja-apple', '<b>大きく</b>\nKeep this literal.')
  const data = exportFeedback(cards, store, 'ja', '2026-11-05T12:00:00.000Z')
  assert.deepEqual(data, {
    format: 'kikimashta-card-feedback', version: 1, language: 'ja', exportedAt: '2026-11-05T12:00:00.000Z',
    notes: [{ itemId: 'ja-apple', text: 'リンゴ', reading: 'りんご', meaning: 'Apple', sourceLevel: 1, feedback: '<b>大きく</b>\nKeep this literal.' }],
  })
  assert.equal(store.read('ja-apple').text, '<b>大きく</b>\nKeep this literal.')
})
