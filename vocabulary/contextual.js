import { contextualInspectionBanks, contextualVocabulary } from '../src/content/contextual-runtime'
import { contextualMediaPath } from '../src/content/contextual'
import { practiceVoicesFor } from '../src/core/voices'

let sharedAudio
let stopActivePlayback
let mountSequence = 0
const pageSize = 12
const asset = (path, family) => import.meta.env.BASE_URL + contextualMediaPath(path, family)
const voiceName = voice => voice.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' ')
const stageName = context => context.introduction ? 'Foundation' : (context.stage ?? 'contrastive') === 'simple' ? 'Simple' : 'Contrastive'
const element = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
function pairs({ context, question }) {
  return context.recordings.flatMap(recording => {
    try {
      const sentence = asset(recording.sentenceSrc, 'audio')
      const questionSrc = asset(recording.questionSrcs[question.id], 'audio')
      return sentence === questionSrc ? [] : [{ voice: recording.voice, sentence, question: questionSrc }]
    } catch { return [] }
  })
}

/** Read-only authored cards. Listening never grades answers or touches progress. */
export function mountContextualLibrary({ container, language }) {
  const languageId = typeof language === 'string' ? language : language.id
  const banks = contextualInspectionBanks.filter(bank => bank.language === languageId)
  const entries = banks.flatMap(bank => bank.contexts.flatMap(context => context.questions.map(question => ({ bankId: bank.id, context, question }))))
  const vocabulary = new Map(contextualVocabulary.filter(word => word.language === languageId).map(word => [word.id, word]))
  const prefix = `context-library-${++mountSequence}`
  const root = element('section', 'contextual-library')
  root.setAttribute('aria-label', 'Contextual cards')
  const filters = element('form', 'context-filters')
  filters.setAttribute('role', 'search')
  filters.setAttribute('aria-label', 'Find contextual cards')
  filters.addEventListener('submit', event => event.preventDefault())
  const searchLabel = element('label', 'context-search', 'Search contexts')
  const search = element('input')
  search.type = 'search'
  search.placeholder = languageId === 'ja-JP' ? 'Japanese, reading, English or word' : 'Spanish, English or word'
  search.autocomplete = 'off'
  searchLabel.append(search)
  filters.append(searchLabel)
  function select(label, options) {
    const wrapper = element('label', '', label)
    const input = element('select')
    for (const [value, text] of options) {
      const option = element('option', '', text)
      option.value = value
      input.append(option)
    }
    wrapper.append(input)
    filters.append(wrapper)
    return input
  }
  const stage = select('Context stage', [['all', 'Both stages'], ['simple', 'Simple'], ['contrastive', 'Contrastive']])
  const collection = select('Context collection', [['all', 'All collections'], ...banks.map(bank => [bank.id,
    bank.id === 'ja-contextual-wanikani-1-draft-v1' ? 'WaniKani level 1' : bank.id])])
  if (new URLSearchParams(location.search).get('contextPack') === '1') collection.value = 'ja-contextual-wanikani-1-draft-v1'
  const targets = [...new Set(entries.map(entry => entry.context.targetItemId))]
  const target = select('Context target', [['all', 'All words'], ...targets.map(id => {
    const word = vocabulary.get(id)
    return [id, word ? `${word.text} · ${word.label}` : id]
  })])
  const kind = select('Question kind', [['all', 'Both focuses'], ['target', 'Target meaning'], ['detail', 'Situation meaning']])
  const format = select('Answer format', [['all', 'All formats'], ['picture', 'Pictures'], ['text', 'Writing']])
  const regionalVoices = practiceVoicesFor(languageId)
  const voices = [...new Set(entries.flatMap(entry => pairs(entry).map(pair => pair.voice)))]
  const voice = select('Context voice', [['all', 'All voices'], ...voices.map(id => { const v = regionalVoices.find(v => v.id === id); return [id, v ? `${v.name} · ${v.description}` : voiceName(id)] })])
  const resultStatus = element('p', 'context-results-status')
  resultStatus.setAttribute('role', 'status')
  const playbackStatus = element('p', 'context-playback-status')
  playbackStatus.setAttribute('role', 'status')
  const playbackError = element('p', 'context-playback-error')
  playbackError.setAttribute('role', 'alert')
  playbackError.hidden = true
  const cards = element('div', 'context-cards')
  const pages = element('nav', 'context-pagination')
  pages.setAttribute('aria-label', 'Contextual card pages')
  const previous = element('button', '', '← Previous')
  const next = element('button', '', 'Next →')
  const pageStatus = element('span', 'context-page-status')
  previous.type = next.type = 'button'
  previous.setAttribute('aria-label', 'Previous contextual page')
  next.setAttribute('aria-label', 'Next contextual page')
  pages.append(previous, pageStatus, next)
  root.append(filters, resultStatus, playbackStatus, playbackError, pages, cards)
  container.append(root)

  let page = 0
  let generation = 0
  let gap
  let activeButton
  let activeLabel
  let activeVoice
  function clearButton() {
    if (!activeButton) return
    activeButton.textContent = `Play ${activeVoice}`
    activeButton.setAttribute('aria-label', `Play ${activeVoice}: ${activeLabel}`)
    activeButton.setAttribute('aria-pressed', 'false')
    activeButton = null
  }
  function stop() {
    generation++
    clearTimeout(gap)
    gap = undefined
    if (stopActivePlayback === stop) {
      sharedAudio.onended = sharedAudio.onerror = null
      sharedAudio.pause()
      sharedAudio.removeAttribute('src')
      stopActivePlayback = undefined
    }
    clearButton()
    playbackStatus.textContent = ''
    playbackError.hidden = true
    playbackError.textContent = ''
  }
  function play(entry, pair, button) {
    if (button === activeButton) { stop(); return }
    stopActivePlayback?.()
    stop()
    sharedAudio ??= new Audio()
    sharedAudio.preload = 'none'
    stopActivePlayback = stop
    activeButton = button
    activeLabel = entry.question.id
    activeVoice = voiceName(pair.voice)
    button.textContent = `Stop ${activeVoice}`
    button.setAttribute('aria-label', `Stop ${activeVoice}: ${entry.question.id}`)
    button.setAttribute('aria-pressed', 'true')
    const token = generation
    let segment = 'sentence'
    const current = () => token === generation && stopActivePlayback === stop
    function failed() {
      if (!current()) return
      const failedSegment = segment === 'gap' ? 'question' : segment
      stop()
      playbackError.textContent = `The ${failedSegment} audio could not play. Select Play ${voiceName(pair.voice)} to retry the sentence and question.`
      playbackError.hidden = false
    }
    function startSegment(src, name) {
      if (!current()) return
      segment = name
      sharedAudio.src = src
      playbackStatus.textContent = `Playing ${name} · ${voiceName(pair.voice)}`
      try { Promise.resolve(sharedAudio.play()).catch(failed) } catch { failed() }
    }
    sharedAudio.onerror = failed
    sharedAudio.onended = () => {
      if (!current()) return
      if (segment === 'sentence') {
        segment = 'gap'
        playbackStatus.textContent = `Question next · ${voiceName(pair.voice)}`
        gap = setTimeout(() => { gap = undefined; startSegment(pair.question, 'question') }, 650)
      } else if (segment === 'question') {
        stop()
        playbackStatus.textContent = `Playback complete · ${voiceName(pair.voice)}`
      }
    }
    startSegment(pair.sentence, 'sentence')
  }
  function prompt(title, value) {
    const block = element('div', 'context-prompt')
    block.append(element('h4', '', title))
    const japanese = element('p', 'context-japanese', value.text)
    japanese.lang = languageId
    block.append(japanese)
    if (value.reading && value.reading !== value.text) {
      const reading = element('p', 'context-reading', value.reading)
      reading.lang = languageId
      block.append(reading)
    }
    block.append(element('p', 'context-meaning', value.meaning))
    return block
  }
  function card(entry, index) {
    const { context, question } = entry
    const targetWord = vocabulary.get(context.targetItemId)
    const article = element('article', 'context-card')
    article.dataset.questionId = question.id
    const heading = element('h3', 'context-card-heading', targetWord ? `${targetWord.text} · ${targetWord.label}` : context.targetItemId)
    heading.id = `${prefix}-card-${index}`
    article.setAttribute('aria-labelledby', heading.id)
    const available = pairs(entry).filter(pair => voice.value === 'all' || pair.voice === voice.value)
    article.append(heading, element('p', 'context-card-meta', `${stageName(context)} · ${(question.focus ?? question.kind) === 'target' ? 'Target meaning' : 'Situation meaning'} · ${question.formats.map(value => value === 'text' ? 'Writing' : 'Pictures').join(' / ')}`))
    const textState = context.review.text === 'approved' ? 'Text approved' : context.review.text === 'rejected' ? 'Text rejected' : 'Text awaiting review'
    const audioState = !available.length ? 'Audio unavailable' : context.review.audio === 'approved' ? 'Audio approved' : context.review.audio === 'rejected' ? 'Audio rejected' : 'Audio awaiting review'
    article.append(element('p', 'context-review-state', `${textState} · ${audioState}`), prompt('Sentence', context.sentence), prompt('Question', question.prompt))
    const recordings = element('div', 'context-voices')
    for (const pair of available) {
      const button = element('button', 'context-voice-button', `Play ${voiceName(pair.voice)}`)
      button.type = 'button'
      const regionalVoice = regionalVoices.find(v => v.id === pair.voice)
      if (regionalVoice) button.title = `${regionalVoice.name} · ${regionalVoice.description}`
      button.setAttribute('aria-label', `Play ${voiceName(pair.voice)}: ${question.id}`)
      button.setAttribute('aria-pressed', 'false')
      button.addEventListener('click', () => play(entry, pair, button))
      recordings.append(button)
    }
    article.append(recordings, element('h4', 'context-answers-heading', 'Authored answers'))
    const answers = element('ol', 'context-answers')
    for (const option of question.options) {
      const answer = element('li', 'context-answer')
      if (option.id === question.correctOptionId) {
        answer.classList.add('context-answer-correct')
        answer.append(element('span', 'context-correct-label', 'Correct answer'))
      }
      if (format.value !== 'text' && question.formats.includes('picture')) {
        const image = vocabulary.get(option.imageItemId)?.image
        try {
          const picture = element('img', 'context-answer-image')
          picture.src = asset(image?.src, 'images')
          picture.alt = image.alt
          picture.loading = 'lazy'
          picture.draggable = false
          answer.append(picture)
        } catch { answer.append(element('span', 'context-image-unavailable', 'Picture unavailable')) }
      }
      const text = element('span', 'context-answer-text', option.text)
      text.lang = languageId
      answer.append(text)
      if (option.reading && option.reading !== option.text) {
        const reading = element('span', 'context-answer-reading', option.reading)
        reading.lang = languageId
        answer.append(reading)
      }
      answer.append(element('span', 'context-answer-meaning', option.meaning))
      answers.append(answer)
    }
    article.append(answers)
    const details = element('details', 'context-content-details')
    details.append(element('summary', '', 'Content details'),
      element('p', '', `Sentence: ${context.id} · revision ${context.revision}`),
      element('p', '', `Question: ${question.id} · revision ${question.revision}`),
      element('p', '', question.explanation), element('p', '', context.reviewNotes))
    article.append(details)
    return article
  }
  function render() {
    stop()
    const query = search.value.normalize('NFKC').trim().toLowerCase()
    const filtered = entries.filter(entry => {
      const { context, question } = entry
      const word = vocabulary.get(context.targetItemId)
      const searchable = [context.id, question.id, word?.text, word?.reading, word?.label,
        ...[context.sentence, question.prompt, ...question.options].flatMap(value => [value.text, value.reading, value.meaning])].join(' ').normalize('NFKC').toLowerCase()
      return (!query || searchable.includes(query)) &&
        (collection.value === 'all' || entry.bankId === collection.value) &&
        (stage.value === 'all' || (context.stage ?? 'contrastive') === stage.value) &&
        (target.value === 'all' || context.targetItemId === target.value) &&
        (kind.value === 'all' || (question.focus ?? question.kind) === kind.value) &&
        (format.value === 'all' || question.formats.includes(format.value)) &&
        (voice.value === 'all' || pairs(entry).some(pair => pair.voice === voice.value))
    })
    const count = Math.max(1, Math.ceil(filtered.length / pageSize))
    page = Math.max(0, Math.min(page, count - 1))
    resultStatus.textContent = `${filtered.length} contextual ${filtered.length === 1 ? 'question' : 'questions'}`
    pageStatus.textContent = `Page ${page + 1} of ${count}`
    previous.disabled = page === 0
    next.disabled = page + 1 >= count
    cards.replaceChildren(...filtered.slice(page * pageSize, (page + 1) * pageSize).map(card))
    if (!filtered.length) cards.append(element('p', 'context-empty', entries.length ? 'No contextual cards match these filters.' : 'No contextual cards are available in this language yet.'))
  }
  search.addEventListener('input', () => { page = 0; render() })
  for (const input of [stage, collection, target, kind, format, voice]) input.addEventListener('change', () => { page = 0; render() })
  previous.addEventListener('click', () => { page--; render(); (previous.disabled ? next : previous).focus() })
  next.addEventListener('click', () => { page++; render(); (next.disabled ? previous : next).focus() })
  window.addEventListener('pagehide', stop)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stop() })
  render()
  return { stop }
}
