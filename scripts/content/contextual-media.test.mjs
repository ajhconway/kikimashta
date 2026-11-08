import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadContextualPilot, projectRoot } from './validate-contextual.mjs'

test('accepted contextual practice media preserves the exact verified deliveries and authored identities', () => {
  const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'content/contextual/accepted-media.json'), 'utf8'))
  const generated = JSON.parse(readFileSync(resolve(projectRoot, 'content/contextual/generated-media.json'), 'utf8'))
  const banks = ['ja-pilot.json', 'ja-simple-pilot.json', 'ja-simple-expansion.json'].map(file => loadContextualPilot(projectRoot, 'content/contextual/' + file).bank)
  assert.equal(manifest.evidenceUrl, 'https://github.com/ajhconway/kikimashta/issues/139#issuecomment-6726427897')
  const firstAcceptance = manifest.previousAcceptances.find(acceptance => acceptance.evidenceUrl ===
    'https://github.com/ajhconway/kikimashta/issues/136#issuecomment-6725637626')
  assert.equal(firstAcceptance.contextIds.length, 6)
  assert.equal(manifest.reviewedCommit, 'b0a8ca3810944d6670c65dd1a7fb275a7573780f')
  assert.equal(manifest.contexts.length, 40)
  assert.equal(generated.contexts.length, 0)
  const all = [...manifest.contexts, ...generated.contexts]
  assert.equal(new Set(all.map(context => context.contextId)).size, 40)
  let clips = 0
  for (const media of all) {
    const context = banks.flatMap(bank => bank.contexts).find(context => context.id === media.contextId)
    assert.equal(context.revision, media.contextRevision)
    assert.equal(context.targetItemId, media.targetItemId)
    assert.equal(context.sentence.text, media.sentenceText)
    for (const question of context.questions) {
      assert.equal(media.questions[question.id], question.prompt.text)
      assert.equal(media.questionRevisions[question.id], question.revision)
    }
    assert.deepEqual(media.recordings.map(recording => recording.voice), ['otani', 'morioki'])
    for (const recording of media.recordings) {
      assert.equal(Object.keys(recording.hashes).length, 3)
      for (const src of [recording.sentenceSrc, ...Object.values(recording.questionSrcs)]) {
        const bytes = readFileSync(resolve(projectRoot, 'public', src))
        assert.equal(createHash('sha256').update(bytes).digest('hex'), recording.hashes[src])
        clips++
      }
    }
  }
  assert.equal(clips, 240)
})
