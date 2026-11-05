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
