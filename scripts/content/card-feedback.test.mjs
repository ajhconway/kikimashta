import assert from 'node:assert/strict'
import test from 'node:test'
import { createAccountFeedbackStore, createFeedbackStore, exportFeedback } from '../../vocabulary/feedback.js'

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

function accountFixture(write = async () => {}) {
  const saved = new Map([['ja:ja-dog', 'Account note']])
  const writes = []
  let changes = 0
  let active = true
  const store = createAccountFeedbackStore({
    language: 'ja', canWrite: () => active, changed: () => { changes += 1 },
    repository: {
      read: (language, id) => saved.get(`${language}:${id}`) ?? '',
      write: async (language, id, text) => {
        writes.push({ language, id, text })
        await write(text)
        saved.set(`${language}:${id}`, text)
      },
    },
  })
  return { store, saved, writes, changes: () => changes, switchAccount: () => { active = false } }
}
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('account feedback saves asynchronously and clears notes with a tombstone', async () => {
  const { store, writes, changes } = accountFixture()
  assert.equal(store.read('ja-dog').text, 'Account note')
  assert.equal(store.hasUnsavedChanges(), false)
  const notifications = []
  const unsubscribe = store.subscribe(() => notifications.push(store.read('ja-dog').text))
  const draft = store.write('ja-dog', '  A new account note  ')
  assert.deepEqual(draft, { text: '  A new account note  ', saved: false, dirty: true, pending: true })
  assert.equal(store.hasUnsavedChanges(), true)
  await store.whenIdle()
  assert.equal(store.read('ja-dog').saved, true)
  assert.equal(store.hasUnsavedChanges(), false)
  assert.equal(changes(), 1)
  store.write('ja-dog', ' \n ')
  await store.whenIdle()
  assert.equal(writes[1].text, '')
  assert.deepEqual(exportFeedback(cards, store, 'ja').notes, [])
  assert.equal(notifications.length, 2)
  unsubscribe()
})

test('an older account save cannot replace or mark a later draft saved', async () => {
  const first = deferred()
  const second = deferred()
  const secondStarted = deferred()
  const { store, saved, writes } = accountFixture(async text => {
    if (text === 'First') await first.promise
    else { secondStarted.resolve(); await second.promise }
  })
  store.write('ja-dog', 'First')
  await Promise.resolve()
  store.write('ja-dog', 'Second')
  assert.equal(writes.length, 1)
  first.resolve()
  await secondStarted.promise
  assert.equal(store.read('ja-dog').text, 'Second')
  assert.equal(store.read('ja-dog').dirty, true)
  assert.equal(store.read('ja-dog').pending, true)
  saved.set('ja:ja-dog', 'Incoming sync while editing')
  store.refresh()
  assert.equal(store.read('ja-dog').text, 'Second')
  second.resolve()
  await store.whenIdle()
  assert.equal(store.read('ja-dog').saved, true)
  assert.equal(saved.get('ja:ja-dog'), 'Second')
  assert.deepEqual(writes.map(note => note.text), ['First', 'Second'])
})

test('failed account saves retain exportable drafts and a later edit retries', async () => {
  let failing = true
  const { store, saved, changes } = accountFixture(async () => { if (failing) throw new Error('Storage blocked') })
  store.write('ja-dog', 'Please fix this picture')
  await store.whenIdle()
  assert.deepEqual(store.read('ja-dog'), { text: 'Please fix this picture', saved: false, dirty: true, pending: false })
  assert.equal(saved.get('ja:ja-dog'), 'Account note')
  assert.equal(changes(), 0)
  assert.equal(exportFeedback(cards, store, 'ja').notes[0].feedback, 'Please fix this picture')
  store.refresh()
  assert.equal(store.read('ja-dog').text, 'Please fix this picture')
  failing = false
  store.write('ja-dog', 'Retry')
  await store.whenIdle()
  assert.equal(store.read('ja-dog').text, 'Retry')
  assert.equal(store.hasUnsavedChanges(), false)
  assert.equal(changes(), 1)
})

test('sync refreshes saved notes and deletions without overwriting a failed draft', async () => {
  const { store, saved } = accountFixture(async () => { throw new Error('Storage blocked') })
  store.read('ja-dog')
  store.write('ja-apple', 'Unsaved local feedback')
  await store.whenIdle()
  saved.set('ja:ja-dog', 'Another device edited the dog')
  saved.set('ja:ja-apple', 'Another device edited the apple')
  store.refresh()
  assert.equal(store.read('ja-dog').text, 'Another device edited the dog')
  assert.equal(store.read('ja-apple').text, 'Unsaved local feedback')
  saved.set('ja:ja-dog', '')
  store.refresh()
  assert.equal(store.read('ja-dog').text, '')
})

test('an account change blocks queued writes and retains drafts for export', async () => {
  const first = deferred()
  const { store, switchAccount, writes } = accountFixture(async () => first.promise)
  store.write('ja-dog', 'Already saving to the old account')
  await Promise.resolve()
  store.write('ja-dog', 'Draft from before the switch')
  switchAccount()
  first.resolve()
  await store.whenIdle()
  assert.equal(writes.length, 1)
  assert.equal(store.hasUnsavedChanges(), true)
  assert.equal(store.read('ja-dog').pending, false)
  assert.equal(exportFeedback(cards, store, 'ja').notes[0].feedback, 'Draft from before the switch')
  store.write('ja-apple', 'Still on the old page')
  await store.whenIdle()
  assert.equal(writes.length, 1)
})
