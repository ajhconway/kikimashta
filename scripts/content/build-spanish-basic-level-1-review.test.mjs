import test from 'node:test'
import assert from 'node:assert/strict'
import draft from '../../content/spanish-basic-1/draft.json' with { type: 'json' }
import { validateBasicDraft, basicReviewHtml } from './build-spanish-basic-level-1-review.mjs'

test('all abstract words have distinct four-choice contexts with one answer', () => {
  validateBasicDraft(draft)
  assert.deepEqual(draft.contexts.map(c => c.targetItemId).sort(), draft.items.filter(i => i.practice.kind === 'contextual').map(i => i.id).sort())
  assert(draft.contexts.every(c => c.options.every(o => o.vocabularyItemId.startsWith('es-419-travel-'))))
})
test('missing, duplicate or foreign contextual targets and answers are refused', () => {
  for (const change of [d => d.contexts.pop(), d => { d.contexts[1].targetItemId = d.contexts[0].targetItemId }, d => { d.contexts[0].targetItemId = 'foreign' }, d => { d.contexts[0].options[1] = d.contexts[0].options[0] }, d => { d.contexts[0].correctOptionId = 'foreign' }, d => { d.contexts[0].options[0].image.src = '../../secret' }]) {
    const d = structuredClone(draft); change(d); assert.throws(() => validateBasicDraft(d))
  }
})
test('the review escapes authored text and retains every context answer without marking media accepted', () => {
  const d = structuredClone(draft); d.items[0].reviewNotes.push('<img onerror="alert(1)">')
  const html = basicReviewHtml(d)
  assert(!html.includes('<img onerror='))
  assert(html.includes('&lt;img onerror='))
  assert.equal((html.match(/<article /g) || []).length, 24)
  assert.equal((html.match(/<summary>/g) || []).length, 9)
  assert(html.includes('This pack is not active.'))
})
