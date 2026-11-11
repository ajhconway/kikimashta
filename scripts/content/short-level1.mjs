/** Short beginner context authoring, shared card validation and review inventory (#253). */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../../', import.meta.url))
export const BANK = 'content/contextual/short-level-1/bank.json'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const require = (condition, message) => { if (!condition) throw new Error(message) }
const nonempty = v => typeof v === 'string' && v.trim().length > 0
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every(id => b.includes(id))

export function validateShortLevel1(bank, catalog, readMedia) {
  require(bank.schemaVersion === 1 && bank.issue === 253 && bank.language === 'ja-JP', 'Unknown short-context bank.')
  const selected = catalog.items.filter(i => i.sourceLevel === 1)
  require(selected.length === 37 && sameSet(bank.words.map(w => w.id), selected.map(w => w.id)), 'Expected the complete 37-word level-1 scope.')
  for (const word of bank.words) {
    const original = selected.find(i => i.id === word.id)
    require(['text', 'reading', 'meaning'].every(key => word[key] === original[key]), 'Frozen target identity changed: ' + word.id)
  }
  require(bank.prompts.length === 74 && new Set(bank.prompts.map(p => p.id)).size === 74, 'Expected 74 uniquely identified prompts.')
  require(new Set(bank.cards.map(c => c.id)).size === bank.cards.length, 'Duplicate shared card ID.')
  const cards = new Map(bank.cards.map(card => [card.id, card]))
  for (const [id, set] of Object.entries(bank.answerSets)) {
    require(set.length === 4 && new Set(set).size === 4 && set.every(c => cards.has(c)), 'Expected four known distinct shared cards: ' + id)
  }
  const uses = new Map(bank.cards.map(c => [c.id, { id: c.id, appearances: 0, correct: 0, distractor: 0, targetItemIds: new Set(), promptIds: [] }]))
  for (const word of bank.words) {
    const prompts = bank.prompts.filter(p => p.targetItemId === word.id)
    require(prompts.length === 2 && sameSet(prompts.map(p => p.variant), [1, 2]), 'Expected exactly variants 1 and 2: ' + word.text)
  }
  for (const p of bank.prompts) {
    require(bank.words.some(w => w.id === p.targetItemId), 'Unknown target: ' + p.id)
    require(sameSet(p.cardIds, bank.answerSets[p.answerSetId] ?? []) && p.cardIds.includes(p.correctCardId), 'Invalid answer set/key: ' + p.id)
    require(['text', 'reading', 'meaning'].every(k => nonempty(p.sentence[k])) && p.sentence.text.length <= 18, 'Incomplete or long sentence: ' + p.id)
    require(!p.question || (['text', 'reading', 'meaning'].every(k => nonempty(p.question[k])) && p.question.text.length <= 12), 'Incomplete or long question: ' + p.id)
    const occurrence = p.targetOccurrence
    const segment = occurrence?.segment === 'sentence' ? p.sentence : occurrence?.segment === 'question' ? p.question : undefined
    require(segment && nonempty(occurrence.surface) && segment.text.includes(occurrence.surface) &&
      nonempty(occurrence.reading) && segment.reading.includes(occurrence.reading), 'Target occurrence is absent or misread: ' + p.id)
    require(p.review.text === 'pending' && p.review.audio === 'not-generated', 'Draft must not imply text or audio acceptance: ' + p.id)
    for (const id of p.cardIds) {
      const use = uses.get(id)
      use.appearances++; use[p.correctCardId === id ? 'correct' : 'distractor']++
      use.targetItemIds.add(p.targetItemId); use.promptIds.push(p.id)
    }
  }
  for (const card of bank.cards) {
    require(uses.get(card.id).appearances >= 2, 'A card is not reused: ' + card.id)
    require(['image', 'planned-image'].includes(card.kind) && nonempty(card.label), 'Invalid shared card: ' + card.id)
    if (card.kind === 'planned-image') {
      require(nonempty(card.brief) && card.source.status === 'artwork-needed' && !card.image, 'Planned art must stay explicit: ' + card.id)
    } else {
      require(nonempty(card.image.path) && /^[a-f0-9]{64}$/.test(card.image.sha256) &&
        ['previously-approved', 'pending-owner-review'].includes(card.source.status), 'Missing source/status for image: ' + card.id)
      const within = relative(root, resolve(root, card.image.path))
      require(!isAbsolute(within) && !within.startsWith('..'), 'Media escapes the repository: ' + card.id)
      if (readMedia) require(hash(readMedia(card.image.path)) === card.image.sha256, 'Shared image bytes changed: ' + card.id)
    }
  }
  const inventory = [...uses.values()].map(u => ({ ...u, targetItemIds: [...u.targetItemIds] }))
  const actual = bank.cards.filter(c => c.kind === 'image')
  return { words: selected.length, prompts: bank.prompts.length, answerSlots: bank.prompts.length * 4,
    sharedCards: bank.cards.length, existingImages: actual.length, plannedImages: bank.cards.length - actual.length,
    maxSentenceCharacters: Math.max(...bank.prompts.map(p => p.sentence.text.length)),
    maxQuestionCharacters: Math.max(...bank.prompts.map(p => p.question?.text.length ?? 0)),
    cardsUsedAcrossWords: inventory.filter(u => u.targetItemIds.length > 1).length,
    cardsUsedAsCorrectAndDistractor: inventory.filter(u => u.correct && u.distractor).length, inventory }
}

export function loadShortLevel1({ checkMedia = false, repository = root } = {}) {
  const bank = JSON.parse(readFileSync(resolve(repository, BANK), 'utf8'))
  const bytes = readFileSync(resolve(repository, bank.source.catalog))
  require(hash(bytes) === bank.source.catalogSha256, 'Frozen source catalog changed; review the level-1 scope before updating it.')
  const report = validateShortLevel1(bank, JSON.parse(bytes), checkMedia ? p => readFileSync(resolve(repository, p)) : undefined)
  return { bank, report }
}
