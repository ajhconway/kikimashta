import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contextualSummary, validateContextualBank } from '../../src/content/contextual.ts'

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
  const bank = validateContextualBank(read(bankPath), {
    vocabulary, eligibleTargetIds,
    imageExists: src => existsSync(resolve(root, 'public', src)),
    audioExists: src => existsSync(resolve(root, 'public', src)),
  })
  return { bank, vocabulary }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: node scripts/content/validate-contextual.mjs')
    const { bank } = loadContextualPilot()
    const { bank: simple } = loadContextualPilot(projectRoot, 'content/contextual/ja-simple-pilot.json')
    console.log(JSON.stringify({ contrastive: contextualSummary(bank), simple: contextualSummary(simple) }, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
