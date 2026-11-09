import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contextualSummary, validateContextualBank } from '../../src/content/contextual.ts'
import { withAnswerAmendments, withAnswerVocabulary } from '../../src/content/contextual-answers.ts'

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

/** Read-only preflight: no generation, approval changes, writes or network requests. */
export function loadContextualPilot(root = projectRoot, bankPath = 'content/contextual/ja-pilot.json') {
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
  const catalogue = read('content/catalog/ja.json')
  const overrides = read('content/catalog/review-overrides.json')
  const vocabulary = catalogue.items.map(item => ({ ...item, ...overrides[item.id] }))
  const eligibleTargetIds = new Set(read('content/practice-pool.json').itemIds)
  const catalogueIds = new Set(vocabulary.map(item => item.id))
  for (const word of read('content/ja.json').items) {
    if (catalogueIds.has(word.id)) eligibleTargetIds.add(word.id)
  }
  const refs = {
    vocabulary, eligibleTargetIds,
    imageExists: src => existsSync(resolve(root, 'public', src)),
    audioExists: src => existsSync(resolve(root, 'public', src)),
  }
  const bank = validateContextualBank(read(bankPath), refs)
  return { bank, vocabulary, refs }
}

/** Current answer content; frozen generation inputs remain available above. */
export function loadContextualPractice(root = projectRoot) {
  const files = ['ja-pilot.json', 'ja-simple-pilot.json', 'ja-simple-expansion.json']
  const loaded = files.map(file => loadContextualPilot(root, 'content/contextual/' + file))
  const changes = JSON.parse(readFileSync(resolve(root, 'content/contextual/answer-amendments.json'), 'utf8'))
  const banks = withAnswerAmendments(loaded.map(entry => entry.bank), changes)
  const additional = JSON.parse(readFileSync(resolve(root, 'content/contextual/answer-vocabulary.json'), 'utf8'))
  if (additional.schemaVersion !== 1 || additional.language !== changes.language) throw new Error('Invalid contextual answer vocabulary schema/language.')
  const vocabulary = withAnswerVocabulary(loaded[0].vocabulary, additional.items)
  banks.forEach((bank, index) => validateContextualBank(bank, { ...loaded[index].refs, vocabulary }))
  return { banks, vocabulary }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: node scripts/content/validate-contextual.mjs')
    const { banks } = loadContextualPractice()
    console.log(JSON.stringify({ choicesPerQuestion: 4, contrastive: contextualSummary(banks[0]),
      simple: contextualSummary(banks[1]), expansion: contextualSummary(banks[2]) }, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
