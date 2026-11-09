/* One shared player; render only the current page. Vocabulary library for #27. */
import { createAccountFeedbackStore, createFeedbackStore, exportFeedback } from './feedback.js'
import { getLibraryAccount } from '../src/sync/library-bridge'
import { learningLanguages } from '../src/core/languages'
import { initialPackIds, selectedPracticeCards } from '../src/core/packs'
import { cardKey } from '../src/core/cards'
import { cardMastery, packMastery } from '../src/core/mastery'
import { deriveSchedules } from '../src/core/scheduler'
import { initialVoiceIds, practiceVoicesFor, voicePreferenceKeyFor } from '../src/core/voices'
import { ProgressStore } from '../src/progress/store'
import { mountContextualLibrary } from './contextual'

(async () => {
  'use strict'
  const parameters = new URLSearchParams(location.search)
  const language = learningLanguages.find(language => language.id === parameters.get('language')) || learningLanguages[0]
  const practicePool = language.pool
  const cardPacks = language.packs
  // Preserve the existing Japanese notes namespace; new languages use their stable ID.
  const feedbackLanguage = language.id === 'ja-JP' ? 'ja' : language.id
  const japanese = language.id === 'ja-JP'
  const practiceVoices = practiceVoicesFor(language.id)
  const voicePreferenceKey = voicePreferenceKeyFor(language.id)
  const pageSize = 24
  const cardsElement = document.getElementById('cards')
  const packElement = document.getElementById('pack')
  for (const pack of cardPacks) {
    const option = document.createElement('option')
    option.value = pack.id
    option.textContent = pack.title
    packElement.append(option)
  }
  const requestedPack = parameters.get('pack')
  if (cardPacks.some(pack => pack.id === requestedPack)) packElement.value = requestedPack
  const practicePacks = document.getElementById('practice-packs')
  const selectionStatus = document.getElementById('pack-selection-status')
  const selectionError = document.getElementById('pack-selection-error')
  const packPreferenceKey = language.packPreferenceKey
  let selectedPackIds = initialPackIds(cardPacks, packPreferenceKey)
  function updateSelection() {
    for (const input of practicePacks.querySelectorAll('input')) input.checked = selectedPackIds.includes(input.value)
    document.getElementById('pack-selection-summary').textContent = `Practice packs · ${selectedPackIds.length} selected`
    selectionStatus.textContent = selectedPackIds.length ? `${selectedPackIds.length} ${selectedPackIds.length === 1 ? 'pack' : 'packs'} selected for practice.` : 'No packs selected. Select a pack to start practicing.'
  }
  for (const pack of cardPacks) {
    const label = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.value = pack.id
    input.setAttribute('aria-label', pack.title)
    input.setAttribute('aria-describedby', `pack-mastery-${pack.id}`)
    const text = document.createElement('span')
    text.textContent = pack.title
    const mastery = document.createElement('small')
    mastery.id = `pack-mastery-${pack.id}`
    mastery.textContent = 'Mastery loading…'
    text.append(mastery)
    label.append(input, text)
    practicePacks.append(label)
    input.addEventListener('change', () => {
      const next = cardPacks.filter(pack => pack.id === input.value ? input.checked : selectedPackIds.includes(pack.id)).map(pack => pack.id)
      try {
        localStorage.setItem(packPreferenceKey, JSON.stringify(next))
        selectedPackIds = next
        selectionError.hidden = true
      } catch {
        selectionError.textContent = 'Your pack selection could not be saved on this device. Try again.'
        selectionError.hidden = false
      }
      updateSelection()
    })
  }
  updateSelection()
  window.addEventListener('storage', () => { selectedPackIds = initialPackIds(cardPacks, packPreferenceKey); updateSelection() })
  const practiceVoiceInputs = document.getElementById('practice-voices')
  practiceVoiceInputs.closest('details').hidden = !practiceVoices.length
  const voiceSelectionError = document.getElementById('voice-selection-error')
  let selectedVoiceIds = initialVoiceIds(language.id)
  function updateVoiceSelection() {
    for (const input of practiceVoiceInputs.querySelectorAll('input')) {
      input.checked = selectedVoiceIds.includes(input.value)
    }
    document.getElementById('voice-selection-summary').textContent = `Practice voices · ${selectedVoiceIds.length} selected`
    document.getElementById('voice-selection-status').textContent = `Selected: ${practiceVoices.filter(voice => selectedVoiceIds.includes(voice.id)).map(voice => voice.name).join(', ')}.`
  }
  for (const voice of practiceVoices) {
    const label = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.value = voice.id
    input.setAttribute('aria-label', voice.name)
    const text = document.createElement('span')
    text.textContent = voice.name
    const accent = document.createElement('small')
    accent.id = `practice-voice-accent-${voice.id}`
    accent.textContent = voice.description
    input.setAttribute('aria-describedby', accent.id)
    text.append(accent)
    label.append(input, text)
    practiceVoiceInputs.append(label)
    input.addEventListener('change', () => {
      const next = practiceVoices.filter(voice => voice.id === input.value ? input.checked : selectedVoiceIds.includes(voice.id)).map(voice => voice.id)
      if (!next.length) {
        voiceSelectionError.textContent = 'Keep at least one voice selected for practice.'
        voiceSelectionError.hidden = false
      } else {
        try {
          localStorage.setItem(voicePreferenceKey, JSON.stringify(next))
          selectedVoiceIds = next
          voiceSelectionError.hidden = true
        } catch {
          voiceSelectionError.textContent = 'Your voice selection could not be saved on this device. Try again.'
          voiceSelectionError.hidden = false
        }
      }
      updateVoiceSelection()
    })
  }
  updateVoiceSelection()
  const refreshVoiceSelection = () => { selectedVoiceIds = initialVoiceIds(language.id); updateVoiceSelection() }
  window.addEventListener('storage', refreshVoiceSelection)
  window.addEventListener('pageshow', refreshVoiceSelection)
  const searchElement = document.getElementById('search')
  if (!japanese) {
    document.title = `${language.title} cards`
    document.querySelector('h1').textContent = `${language.title} cards`
    document.querySelector('.page-header p').textContent = 'Browse the travel pack, inspect each picture and meaning, and listen to the pronunciation.'
    searchElement.placeholder = 'Spanish or English'
  }
  const resultsStatus = document.getElementById('results-status')
  const pageStatus = document.getElementById('page-status')
  const previous = document.getElementById('previous')
  const next = document.getElementById('next')
  const audioStatus = document.getElementById('audio-status')
  const audioError = document.getElementById('audio-error')
  const exportButton = document.getElementById('export-feedback')
  const accountStatus = document.getElementById('account-status')
  const wordLibrary = document.getElementById('word-library')
  const contextualLibrary = document.getElementById('contextual-library')
  const wordToggle = document.getElementById('show-words')
  const contextualToggle = document.getElementById('show-contexts')
  const wordHeading = document.querySelector('h1').textContent
  const wordDescription = document.querySelector('.page-header p').textContent
  let contextView = null
  let stopWordAudio = () => {}
  function showLibraryView(view, push = false) {
    const contextual = view === 'contextual'
    stopWordAudio()
    contextView?.stop()
    wordLibrary.hidden = contextual
    contextualLibrary.hidden = !contextual
    wordToggle.setAttribute('aria-pressed', String(!contextual))
    contextualToggle.setAttribute('aria-pressed', String(contextual))
    document.querySelector('h1').textContent = contextual ? 'Contextual questions' : wordHeading
    document.querySelector('.page-header p').textContent = contextual
      ? 'Browse authored sentences, questions, answers and recordings. Browsing does not change your practice progress.' : wordDescription
    document.title = contextual ? 'Contextual questions · Card library' : wordHeading
    if (contextual && !contextView) contextView = mountContextualLibrary({ container: contextualLibrary, language })
    if (push) {
      const url = new URL(location.href)
      if (contextual) url.searchParams.set('view', 'contextual')
      else url.searchParams.delete('view')
      history.pushState(null, '', url)
    }
  }
  wordToggle.addEventListener('click', () => { if (wordLibrary.hidden) showLibraryView('words', true) })
  contextualToggle.addEventListener('click', () => { if (contextualLibrary.hidden) showLibraryView('contextual', true) })
  window.addEventListener('popstate', () => showLibraryView(new URLSearchParams(location.search).get('view')))
  showLibraryView(parameters.get('view'))

  // Resolve identity before reading feedback so guest and account notes stay separate.
  const account = await getLibraryAccount()
  const feedbackStore = account ? createAccountFeedbackStore({
    language: feedbackLanguage, repository: account.notes, changed: account.changed,
    canWrite: () => account.currentUserId() === account.userId,
  }) : createFeedbackStore({ language: feedbackLanguage })
  if (account) document.getElementById('feedback-description').textContent = 'Feedback is saved to this account. Export it to share or back it up.'
  const feedbackViews = new Map()
  const masteryViews = new Map()
  const progress = account?.progress ?? new ProgressStore()
  let schedules = null
  let masteryRequest = 0
  let pageActive = true
  let closingProgress = Promise.resolve()
  function updateMastery() {
    for (const update of masteryViews.values()) update()
    for (const pack of cardPacks) {
      const option = Array.from(packElement.options).find(option => option.value === pack.id)
      const summary = schedules && packMastery(selectedPracticeCards(practicePool.items, [pack.id], cardPacks), schedules)
      const text = summary ? `Lowest: ${summary.lowest.label} · Average: ${summary.average.label}` : 'Mastery unavailable'
      option.textContent = `${pack.title} · ${text}`
      document.getElementById(`pack-mastery-${pack.id}`).textContent = text
    }
  }
  async function refreshMastery() {
    if (!pageActive) return
    if (account && account.currentUserId() !== account.userId) {
      schedules = null
      updateMastery()
      return
    }
    const request = ++masteryRequest
    try {
      const history = await progress.history(practicePool.language)
      const derived = await deriveSchedules(history, practicePool.language)
      if (request !== masteryRequest || (account && account.currentUserId() !== account.userId)) return
      schedules = new Map(derived.map(word => [cardKey(word), word]))
    } catch {
      if (request !== masteryRequest) return
      schedules = null
    }
    updateMastery()
  }
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
      activeButton.querySelector('.voice-name').textContent = activeButton.dataset.label
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

  stopWordAudio = stopAudio

  function failAudio(request, voice) {
    if (request !== playRequest || !activeButton) return
    audio.pause()
    resetButton()
    audioStatus.textContent = ''
    audioError.textContent = `Could not play ${voice}. Try again, or try another voice.`
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
    button.querySelector('.voice-name').textContent = `Stop ${voice}`
    button.setAttribute('aria-label', `Stop ${voice}: ${card.meaning}`)
    audioStatus.textContent = `Playing ${card.reading || card.text} · ${voice}`
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

  function renderFeedback(card, exercise) {
    const viewId = `${card.id}-${exercise}`
    const details = element('details', 'card-feedback')
    const summary = element('summary')
    const label = element('label', '', 'Your notes')
    const input = element('textarea')
    input.id = `feedback-${viewId}`
    input.rows = 4
    input.placeholder = 'Card, pronunciation, meaning…'
    label.htmlFor = input.id
    const status = element('p', 'feedback-status')
    status.id = `feedback-status-${viewId}`
    status.setAttribute('role', 'status')
    input.setAttribute('aria-describedby', status.id)
    input.value = feedbackStore.read(card.id).text
    let edited = false

    function update(note) {
      if (input.value !== note.text) input.value = note.text
      summary.textContent = note.text.trim() ? 'Your feedback · Has notes' : 'Your feedback'
      status.textContent = note.pending ? 'Saving…' : !note.saved ? (note.dirty && !note.text.trim()
        ? 'Could not clear the saved feedback. Try editing and clearing this box again.'
        : 'Could not save on this device. Keep this page open and export your feedback.')
        : note.text.trim() ? 'Saved on this device.' : edited ? 'Feedback cleared.' : ''
      status.classList.toggle('save-error', !note.saved && !note.pending)
    }
    update(feedbackStore.read(card.id))
    feedbackViews.set(viewId, () => update(feedbackStore.read(card.id)))
    input.addEventListener('input', () => {
      edited = true
      update(feedbackStore.write(card.id, input.value))
      for (const refresh of feedbackViews.values()) refresh()
      updateFeedbackCount()
    })
    details.append(summary, label, input, status)
    return details
  }

  exportButton.addEventListener('click', () => {
    const data = exportFeedback(cards, feedbackStore, feedbackLanguage)
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

  if (account) {
    feedbackStore.subscribe(() => {
      for (const update of feedbackViews.values()) update()
      updateFeedbackCount()
    })
    account.subscribe(() => {
      if (account.currentUserId() !== account.userId) {
        stopAudio()
        masteryRequest++
        schedules = null
        updateMastery()
        if (!feedbackStore.hasUnsavedChanges()) { window.location.reload(); return }
        document.getElementById('feedback-description').textContent = 'These notes belong to the previous account.'
        accountStatus.textContent = 'Account changed. Export your unsaved feedback, then reload this page to switch accounts.'
        accountStatus.hidden = false
        return
      }
      feedbackStore.refresh()
      updateFeedbackCount()
      void refreshMastery()
    })
  }

  function renderCard(card, exercise) {
    const writing = exercise === 'audio-text'
    const article = element('article', 'card')
    const headingId = `word-${card.id}-${exercise}`
    article.dataset.itemId = card.id
    article.dataset.exercise = exercise
    article.setAttribute('aria-labelledby', `${headingId} ${headingId}-format`)
    if (writing) {
      const face = element('div', 'card-writing', card.text)
      face.lang = language.id
      article.append(face)
    } else {
      const image = element('img', 'card-image')
      image.src = card.image.src
      image.alt = card.image.alt
      image.width = 256
      image.height = 256
      image.loading = 'lazy'
      image.decoding = 'async'
      article.append(image)
    }
    const content = element('div', 'card-content')
    const heading = element('h2', 'word-text', card.text)
    heading.id = headingId
    heading.lang = language.id
    const reading = element('p', 'reading', card.reading)
    reading.lang = language.id
    const packs = element('p', 'pack-labels')
    packs.setAttribute('aria-label', 'Packs')
    for (const pack of cardPacks.filter(pack => pack.exercise === exercise && pack.itemIds.includes(card.id))) {
      packs.append(element('span', '', pack.title))
    }
    const mastery = element('p', 'card-mastery')
    const update = () => {
      mastery.textContent = `Mastery: ${schedules ? cardMastery(schedules.get(cardKey({ language: practicePool.language, itemId: card.id, exercise }))).label : 'unavailable'}`
    }
    masteryViews.set(headingId, update)
    update()
    const format = element('p', 'card-format', writing ? 'Writing' : 'Pictures')
    format.id = `${headingId}-format`
    content.append(format, packs, heading)
    if (card.reading) content.append(reading)
    content.append(element('p', 'meaning', card.meaning), mastery)
    if (!writing && card.reviewRequired) content.append(element('span', 'review-badge', 'Review in context'))
    const voices = element('div', 'voices')
    voices.setAttribute('role', 'group')
    voices.setAttribute('aria-label', `${language.title} voices for ${card.meaning}`)
    for (const clip of card.audio) {
      const voice = clip.voiceName || clip.voice.charAt(0).toUpperCase() + clip.voice.slice(1)
      const button = element('button', 'voice-button')
      const accent = element('small', 'voice-accent', practiceVoices.find(voice => voice.id === clip.voice)?.description ?? 'Accent unspecified')
      accent.id = `voice-accent-${headingId}-${clip.voice}`
      button.append(element('span', 'voice-name', clip.available ? voice : `${voice} unavailable`))
      button.append(accent)
      button.setAttribute('aria-describedby', accent.id)
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
    if (!writing) {
      const notes = element('details', 'picture-notes')
      notes.append(element('summary', '', 'Picture notes'), element('p', '', card.concept))
      if (card.reviewNote) notes.append(element('p', '', card.reviewNote))
      if (card.teachingNote) notes.append(element('p', 'teaching-note', card.teachingNote))
      if (cards.some(other => other.id !== card.id && other.visualGroup === card.visualGroup)) {
        notes.append(element('p', '', 'Other cards share this picture idea. Consider them together when reviewing.'))
      }
      content.append(notes)
    }
    content.append(renderFeedback(card, exercise))
    article.append(content)
    return article
  }

  const normalized = value => {
    const text = value.normalize('NFKC').toLocaleLowerCase().trim()
    return japanese ? text.replace(/[ァ-ヶ]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60))
      : text.normalize('NFD').replace(/\p{M}/gu, '')
  }
  function render() {
    stopAudio()
    feedbackViews.clear()
    masteryViews.clear()
    audioError.hidden = true
    const query = normalized(searchElement.value)
    const pack = cardPacks.find(pack => pack.id === packElement.value)
    const itemIds = pack ? new Set(pack.itemIds) : null
    const filtered = cards.filter(card => (!itemIds || itemIds.has(card.id)) &&
      (!query || [card.text, card.reading, card.meaning].some(value => normalized(value).includes(query))))
      .flatMap(card => (pack ? [pack.exercise] : [...new Set(cardPacks.filter(pack => pack.itemIds.includes(card.id)).map(pack => pack.exercise))]).map(exercise => ({ card, exercise })))
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
    page = Math.min(page, totalPages)
    const offset = (page - 1) * pageSize
    const fragment = document.createDocumentFragment()
    for (const { card, exercise } of filtered.slice(offset, offset + pageSize)) fragment.append(renderCard(card, exercise))
    cardsElement.replaceChildren(fragment)
    previous.disabled = page === 1
    next.disabled = page === totalPages
    pageStatus.textContent = `Page ${page} of ${totalPages}`
    resultsStatus.textContent = filtered.length ? `${filtered.length} cards · Showing ${offset + 1}–${Math.min(offset + pageSize, filtered.length)}` : 'No matching words. Try another search or pack.'
  }

  document.getElementById('filters').addEventListener('submit', event => event.preventDefault())
  searchElement.addEventListener('input', () => { page = 1; render() })
  packElement.addEventListener('change', () => { page = 1; render() })
  previous.addEventListener('click', () => { page -= 1; render() })
  next.addEventListener('click', () => { page += 1; render() })
  window.addEventListener('pagehide', () => {
    stopAudio()
    pageActive = false
    masteryRequest++
    if (!account) closingProgress = progress.close().catch(() => {})
  })
  async function refreshAfterReturn() {
    // A BFCache restore can happen while the previous guest connection closes.
    // Wait before reopening it; retain the existing identity and stale-read guards.
    await closingProgress
    if (pageActive) void refreshMastery()
  }
  window.addEventListener('pageshow', () => { pageActive = true; selectedPackIds = initialPackIds(cardPacks, packPreferenceKey); updateSelection(); void refreshAfterReturn() })
  window.addEventListener('focus', () => { void refreshAfterReturn() })

  await refreshMastery()
  const loadCards = japanese ? fetch('./library-data.json').then(response => {
    if (!response.ok) throw new Error('Vocabulary request failed')
    return response.json()
  }) : Promise.resolve({ cards: language.pool.items.map(item => ({
    id: item.id, text: item.text, reading: item.reading || '', meaning: item.label,
    image: { ...item.image, src: '../' + item.image.src },
    audio: item.audio.map(clip => ({ ...clip, src: '../' + clip.src, available: true })),
    concept: item.image.alt, visualGroup: item.image.src,
  })) })
  loadCards
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
})().catch(() => {
  document.getElementById('results-status').textContent = ''
  const error = document.getElementById('library-error')
  error.textContent = 'The vocabulary cards could not load. Reload the page to try again.'
  error.hidden = false
})
