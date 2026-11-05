/* One shared player; render only the current page. Vocabulary library for #27. */
import { createFeedbackStore, exportFeedback } from './feedback.js'

(() => {
  'use strict'
  const pageSize = 24
  const cardsElement = document.getElementById('cards')
  const levelElement = document.getElementById('level')
  const searchElement = document.getElementById('search')
  const resultsStatus = document.getElementById('results-status')
  const pageStatus = document.getElementById('page-status')
  const previous = document.getElementById('previous')
  const next = document.getElementById('next')
  const audioStatus = document.getElementById('audio-status')
  const audioError = document.getElementById('audio-error')
  const exportButton = document.getElementById('export-feedback')
  const feedbackStore = createFeedbackStore({ language: 'ja' })
  const audio = new Audio()
  audio.preload = 'none'
  let cards = []
  let page = 1
  let activeButton = null
  let activeSource = null
  let playRequest = 0

  function element(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  function resetButton() {
    if (activeButton) {
      activeButton.setAttribute('aria-pressed', 'false')
      activeButton.textContent = activeButton.dataset.label
      activeButton.setAttribute('aria-label', activeButton.dataset.accessibleLabel)
      activeButton.classList.remove('is-playing')
    }
    activeButton = null
    activeSource = null
  }

  function stopAudio() {
    playRequest += 1
    audio.pause()
    resetButton()
    audioStatus.textContent = ''
  }

  function failAudio(request, voice) {
    if (request !== playRequest || !activeButton) return
    audio.pause()
    resetButton()
    audioStatus.textContent = ''
    audioError.textContent = `Could not play ${voice}. Try again, or try the other voice.`
    audioError.hidden = false
  }

  function playClip(button, clip, card) {
    if (activeButton === button) {
      stopAudio()
      return
    }
    stopAudio()
    const request = playRequest
    audioError.hidden = true
    audioError.textContent = ''
    const voice = button.dataset.label
    activeButton = button
    activeSource = new URL(clip.src, document.baseURI).href
    button.setAttribute('aria-pressed', 'true')
    button.classList.add('is-playing')
    button.textContent = `Stop ${voice}`
    button.setAttribute('aria-label', `Stop ${voice}: ${card.meaning}`)
    audioStatus.textContent = `Playing ${card.reading} · ${voice}`
    audio.src = activeSource
    // Call play synchronously inside the tap handler to preserve Safari's user gesture.
    try {
      const playing = audio.play()
      if (playing && typeof playing.catch === 'function') playing.catch(() => failAudio(request, voice))
    } catch {
      failAudio(request, voice)
    }
  }

  audio.addEventListener('ended', () => {
    if (!activeSource || audio.currentSrc !== activeSource) return
    resetButton()
    audioStatus.textContent = ''
  })
  audio.addEventListener('error', () => {
    if (activeSource && audio.currentSrc === activeSource) failAudio(playRequest, activeButton.dataset.label)
  })

  function updateFeedbackCount() {
    const count = cards.filter(card => feedbackStore.read(card.id).text.trim()).length
    exportButton.disabled = count === 0
    exportButton.textContent = count ? `Export feedback (${count})` : 'Export feedback'
  }

  function renderFeedback(card) {
    const details = element('details', 'card-feedback')
    const summary = element('summary')
    const label = element('label', '', 'Your notes')
    const input = element('textarea')
    input.id = `feedback-${card.id}`
    input.rows = 4
    input.placeholder = 'Picture, pronunciation, meaning…'
    label.htmlFor = input.id
    const status = element('p', 'feedback-status')
    status.id = `feedback-status-${card.id}`
    status.setAttribute('role', 'status')
    input.setAttribute('aria-describedby', status.id)
    input.value = feedbackStore.read(card.id).text

    function update(note, edited = false) {
      summary.textContent = note.text.trim() ? 'Your feedback · Has notes' : 'Your feedback'
      status.textContent = !note.saved ? (note.dirty && !note.text.trim()
        ? 'Could not clear the saved feedback. Try editing and clearing this box again.'
        : 'Could not save on this device. Keep this page open and export your feedback.')
        : note.text.trim() ? 'Saved on this device.' : edited ? 'Feedback cleared.' : ''
      status.classList.toggle('save-error', !note.saved)
    }
    update(feedbackStore.read(card.id))
    input.addEventListener('input', () => {
      update(feedbackStore.write(card.id, input.value), true)
      updateFeedbackCount()
    })
    details.append(summary, label, input, status)
    return details
  }

  exportButton.addEventListener('click', () => {
    const data = exportFeedback(cards, feedbackStore, 'ja')
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }))
    const link = element('a')
    link.href = url
    link.download = `kikimashta-feedback-${data.exportedAt.slice(0, 10)}.json`
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })

  window.addEventListener('beforeunload', event => {
    if (!feedbackStore.hasUnsavedChanges()) return
    event.preventDefault()
    event.returnValue = ''
  })

  function renderCard(card) {
    const article = element('article', 'card')
    const headingId = `word-${card.id}`
    article.setAttribute('aria-labelledby', headingId)
    const image = element('img', 'card-image')
    image.src = card.image.src
    image.alt = card.image.alt
    image.width = 256
    image.height = 256
    image.loading = 'lazy'
    image.decoding = 'async'
    article.append(image)
    const content = element('div', 'card-content')
    const heading = element('h2', 'japanese', card.text)
    heading.id = headingId
    heading.lang = 'ja'
    const reading = element('p', 'reading', card.reading)
    reading.lang = 'ja'
    content.append(element('p', 'level-label', `Level ${card.sourceLevel}`), heading, reading, element('p', 'meaning', card.meaning))
    if (card.reviewRequired) content.append(element('span', 'review-badge', 'Review in context'))
    const voices = element('div', 'voices')
    voices.setAttribute('role', 'group')
    voices.setAttribute('aria-label', `Japanese voices for ${card.meaning}`)
    for (const clip of card.audio) {
      const voice = clip.voice === 'marin' ? 'Marin' : 'Cedar'
      const button = element('button', 'voice-button', clip.available ? voice : `${voice} unavailable`)
      button.type = 'button'
      button.dataset.label = voice
      button.setAttribute('aria-pressed', 'false')
      button.dataset.accessibleLabel = `${voice}: ${card.meaning}${clip.available ? '' : ', audio unavailable'}`
      button.setAttribute('aria-label', button.dataset.accessibleLabel)
      button.disabled = !clip.available
      if (clip.available) button.addEventListener('click', () => playClip(button, clip, card))
      voices.append(button)
    }
    content.append(voices)
    const notes = element('details', 'picture-notes')
    notes.append(element('summary', '', 'Picture notes'), element('p', '', card.concept))
    if (card.reviewNote) notes.append(element('p', '', card.reviewNote))
    if (card.teachingNote) notes.append(element('p', 'teaching-note', card.teachingNote))
    if (cards.some(other => other.id !== card.id && other.visualGroup === card.visualGroup)) {
      notes.append(element('p', '', 'Other cards share this picture idea. Consider them together when reviewing.'))
    }
    content.append(notes, renderFeedback(card))
    article.append(content)
    return article
  }

  const normalized = value => value.normalize('NFKC').toLocaleLowerCase()
    .replace(/[ァ-ヶ]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60)).trim()
  function render() {
    stopAudio()
    audioError.hidden = true
    const query = normalized(searchElement.value)
    const level = levelElement.value
    const filtered = cards.filter(card => (level === 'all' || card.sourceLevel === Number(level)) &&
      (!query || [card.text, card.reading, card.meaning].some(value => normalized(value).includes(query))))
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
    page = Math.min(page, totalPages)
    const offset = (page - 1) * pageSize
    const fragment = document.createDocumentFragment()
    for (const card of filtered.slice(offset, offset + pageSize)) fragment.append(renderCard(card))
    cardsElement.replaceChildren(fragment)
    previous.disabled = page === 1
    next.disabled = page === totalPages
    pageStatus.textContent = `Page ${page} of ${totalPages}`
    resultsStatus.textContent = filtered.length ? `${filtered.length} cards · Showing ${offset + 1}–${Math.min(offset + pageSize, filtered.length)}` : 'No matching words. Try another search or level.'
  }

  document.getElementById('filters').addEventListener('submit', event => event.preventDefault())
  searchElement.addEventListener('input', () => { page = 1; render() })
  levelElement.addEventListener('change', () => { page = 1; render() })
  previous.addEventListener('click', () => { page -= 1; render() })
  next.addEventListener('click', () => { page += 1; render() })
  window.addEventListener('pagehide', stopAudio)

  fetch('./library-data.json')
    .then(response => {
      if (!response.ok) throw new Error('Vocabulary request failed')
      return response.json()
    })
    .then(data => {
      if (!Array.isArray(data.cards) || !data.cards.length) throw new Error('Vocabulary is empty')
      cards = data.cards
      updateFeedbackCount()
      render()
    })
    .catch(() => {
      resultsStatus.textContent = ''
      const error = document.getElementById('library-error')
      error.textContent = 'The vocabulary cards could not load. Reload the page to try again.'
      error.hidden = false
    })
})()
