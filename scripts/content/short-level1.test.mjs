import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadShortLevel1, validateShortLevel1, root } from './short-level1.mjs'

const { bank } = loadShortLevel1()
const catalog = JSON.parse(readFileSync(resolve(root, bank.source.catalog), 'utf8'))

test('all level-1 words have two short prompts built from shared answer cards', () => {
  const report = validateShortLevel1(bank, catalog)
  assert.equal(report.words, 37)
  assert.equal(report.prompts, 74)
  assert.equal(report.answerSlots, 296)
  assert.ok(report.cardsUsedAcrossWords > report.sharedCards * 0.75)
  const one = bank.words.find(w => w.text === '一つ').id
  const two = bank.words.find(w => w.text === '二つ').id
  assert.deepEqual(new Set(bank.prompts.filter(p => p.targetItemId === one).map(p => p.answerSetId)),
    new Set(bank.prompts.filter(p => p.targetItemId === two).map(p => p.answerSetId)))
  assert.ok(report.inventory.every(card => card.appearances >= 2))
})

test('scope omissions, ambiguous references, lost target readings and disguised missing art fail validation', () => {
  for (const [change, expected] of [
    [b => b.prompts.pop(), /74 uniquely/],
    [b => { b.prompts[0].cardIds[1] = b.prompts[0].cardIds[0] }, /answer set/],
    [b => { b.prompts[0].correctCardId = 'not-an-answer' }, /answer set/],
    [b => { b.prompts[0].targetOccurrence.reading = 'ちがう' }, /misread/],
    [b => { b.cards.find(c => c.kind === 'planned-image').image = { path: 'placeholder.svg' } }, /Planned art/],
  ]) {
    const copy = structuredClone(bank)
    change(copy)
    assert.throws(() => validateShortLevel1(copy, catalog), expected)
  }
})
