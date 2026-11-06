/** Local card feedback, separate from learning progress (#32). */
export function createFeedbackStore({ language, storage = () => localStorage }) {
  const notes = new Map()
  const key = id => `kikimashta:card-feedback:v1:${language}:${id}`

  function read(id) {
    if (!notes.has(id)) {
      try {
        notes.set(id, { text: storage().getItem(key(id)) ?? '', saved: true, dirty: false })
      } catch {
        notes.set(id, { text: '', saved: false, dirty: false })
      }
    }
    return notes.get(id)
  }

  function write(id, text) {
    const note = { text, saved: false, dirty: true }
    notes.set(id, note)
    try {
      if (text.trim()) storage().setItem(key(id), text)
      else storage().removeItem(key(id))
      note.saved = true
      note.dirty = false
    } catch {
      // Retain the draft across filtering and pagination, and include it in exports.
    }
    return note
  }

  return { read, write, hasUnsavedChanges: () => [...notes.values()].some(note => note.dirty) }
}

/** Adapt the loaded account repository without replacing a failed or newer draft. */
export function createAccountFeedbackStore({ language, repository, changed, canWrite = () => true }) {
  const notes = new Map()
  const queues = new Map()
  const listeners = new Set()
  const notify = () => { for (const listener of listeners) listener() }

  function read(id) {
    if (!notes.has(id)) notes.set(id, { text: repository.read(language, id), saved: true, dirty: false, pending: false })
    return notes.get(id)
  }

  function write(id, text) {
    const note = { text, saved: false, dirty: true, pending: true }
    notes.set(id, note)
    // Preserve input order even when persistence takes longer than the next edit.
    const saving = (queues.get(id) ?? Promise.resolve()).then(async () => {
      if (!canWrite()) throw new Error('The account changed before this note was saved.')
      await repository.write(language, id, text.trim() ? text : '')
      if (notes.get(id) === note) { note.saved = true; note.dirty = false }
      changed()
    }).catch(() => {
      // This draft remains available for retry and export. Older completions
      // never clear the dirty flag belonging to a later edit.
    }).finally(() => {
      note.pending = false
      if (queues.get(id) === saving) queues.delete(id)
      notify()
    })
    queues.set(id, saving)
    return note
  }

  function refresh() {
    for (const [id, note] of notes) {
      if (!note.dirty) notes.set(id, { text: repository.read(language, id), saved: true, dirty: false, pending: false })
    }
    notify()
  }

  return {
    read, write, refresh,
    hasUnsavedChanges: () => [...notes.values()].some(note => note.dirty),
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    whenIdle: () => Promise.all([...queues.values()]),
  }
}

export function exportFeedback(cards, store, language, exportedAt = new Date().toISOString()) {
  return {
    format: 'kikimashta-card-feedback', version: 1, language, exportedAt,
    notes: cards.flatMap(card => {
      const feedback = store.read(card.id).text
      return feedback.trim() ? [{
        itemId: card.id, text: card.text, reading: card.reading, meaning: card.meaning,
        sourceLevel: card.sourceLevel, feedback,
      }] : []
    }),
  }
}
