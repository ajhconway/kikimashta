import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadContextualPilot, loadContextualPractice, projectRoot } from './validate-contextual.mjs'

const read = path => JSON.parse(readFileSync(resolve(projectRoot, path), 'utf8'))

test('all eighty effective questions have four validated choices while approved speech inputs remain unchanged', () => {
  const { banks, vocabulary } = loadContextualPractice()
  const original = ['ja-pilot.json', 'ja-simple-pilot.json', 'ja-simple-expansion.json']
    .flatMap(file => loadContextualPilot(projectRoot, 'content/contextual/' + file).bank.contexts.flatMap(context => context.questions))
  const questions = banks.flatMap(bank => bank.contexts.flatMap(context => context.questions))
  const amendments = read('content/contextual/answer-amendments.json').amendments
  assert.equal(questions.length, 80)
  assert.equal(amendments.length, 46)
  assert.equal(questions.filter(question => question.revision === 2).length, 46)
  for (const question of questions) {
    const source = original.find(candidate => candidate.id === question.id)
    assert.equal(question.options.length, 4)
    assert.equal(question.correctOptionId, source.correctOptionId)
    assert.deepEqual(question.prompt, source.prompt)
    assert.deepEqual(question.options.slice(0, source.options.length), source.options)
    if (source.options.length === 4) assert.deepEqual(question, source)
  }
  const tea = vocabulary.find(word => word.id === 'ja-contextual-tea')
  assert.ok(tea)
  assert.equal(tea.text, 'お茶')
  assert.ok(!read('content/catalog/ja.json').items.some(word => word.id === tea.id))
  assert.ok(!read('content/practice-pool.json').itemIds.includes(tea.id))
  assert.equal(amendments.filter(change => change.addedOption.imageItemId === tea.id).length, 8)
  const provenance = read('artifacts/contextual-answers-163/image-generation.json')
  assert.equal(provenance.delivery.src, 'public/' + tea.image.src)
  assert.equal(createHash('sha256').update(readFileSync(resolve(projectRoot, provenance.delivery.src))).digest('hex'), provenance.delivery.sha256)
})
