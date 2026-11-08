import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { contextualFixture, sha256 } from './contextual-audio-fixtures.mjs'
import { contextualTextDigest } from './contextual-audio-plan.mjs'
import { prepareContextualDeliveries } from './prepare-contextual-deliveries.mjs'

async function fixture(t) {
  const data = await contextualFixture(t)
  const template = data.bank.contexts[0]
  data.bank.contexts = Array.from({ length: 17 }, (_, index) => {
    const context = structuredClone(template)
    context.id = 'ja-ctx-generated-' + index
    context.questions.forEach(question => { question.id = context.id + '-' + question.kind })
    return context
  })
  await data.saveBank()
  await data.put('content/contextual/accepted-media.json', { contexts: [] })
  await data.put('content/contextual/generated-media.json', { schemaVersion: 1, contexts: [] })
  const review = { issue: 139, bankId: data.bank.id, approval: { textSha256: contextualTextDigest(data.bank) },
    generationIdentity: 'fixture', contexts: data.bank.contexts.map(context => ({ id: context.id, revision: context.revision, targetItemId: context.targetItemId })),
    voices: [{ voice: 'otani' }, { voice: 'morioki' }], samples: [] }
  const bytes = Buffer.from('Verified audio boundary fixture')
  for (const context of data.bank.contexts) for (const voice of review.voices) {
    const sentence = { ...context.sentence, normalizedFile: voice.voice + '/' + context.id + '-sentence.mp3', deliverySha256: sha256(bytes) }
    await data.put('delivery/' + sentence.normalizedFile, bytes)
    for (const question of context.questions) {
      const correct = question.options.find(option => option.id === question.correctOptionId)
      const prompt = { ...question.prompt, id: question.id, revision: question.revision, kind: question.kind,
        correctAnswer: correct.text, correctMeaning: correct.meaning, normalizedFile: voice.voice + '/' + question.id + '.mp3', deliverySha256: sha256(bytes) }
      await data.put('delivery/' + prompt.normalizedFile, bytes)
      review.samples.push({ contextId: context.id, contextRevision: context.revision, targetItemId: context.targetItemId, voice: voice.voice, sentence, question: prompt })
    }
  }
  await data.put('review/review-provenance.json', review)
  return { ...data, review, bytes, prepare: () => prepareContextualDeliveries({ root: data.root, review: 'review', delivery: 'delivery' }) }
}

test('prepares exactly the verified expansion deliveries as pending media and safely reuses identical files', async t => {
  const data = await fixture(t)
  assert.deepEqual(data.prepare(), { contexts: 17, clips: 102, totalGeneratedContexts: 17, audioReview: 'pending' })
  const manifest = JSON.parse(await readFile(join(data.root, 'content/contextual/generated-media.json'), 'utf8'))
  assert.equal(manifest.contexts.length, 17)
  for (const context of manifest.contexts) for (const recording of context.recordings) {
    assert.equal(Object.keys(recording.hashes).length, 3)
    for (const src of [recording.sentenceSrc, ...Object.values(recording.questionSrcs)]) {
      assert.deepEqual(await readFile(join(data.root, 'public', src)), data.bytes)
    }
  }
  assert.equal(data.prepare().totalGeneratedContexts, 17)
  assert.deepEqual(JSON.parse(await readFile(join(data.root, 'content/contextual/accepted-media.json'), 'utf8')), { contexts: [] })
})

test('a late corrupt source prevents all public copying and manifest changes', async t => {
  const data = await fixture(t)
  await data.put('delivery/' + data.review.samples.at(-1).question.normalizedFile, 'changed bytes')
  assert.throws(data.prepare, /hash mismatch/)
  assert.equal(existsSync(join(data.root, 'public/audio')), false)
  assert.deepEqual(JSON.parse(await readFile(join(data.root, 'content/contextual/generated-media.json'), 'utf8')), { schemaVersion: 1, contexts: [] })
})

test('wrong question identity and unsafe source paths fail before public writes', async t => {
  const data = await fixture(t)
  data.review.samples[0].question.text = '違います。'
  await data.put('review/review-provenance.json', data.review)
  assert.throws(data.prepare, /Question identity/)
  data.review.samples[0].question.text = data.bank.contexts[0].questions[0].prompt.text
  data.review.samples[0].sentence.normalizedFile = '../outside.mp3'
  await data.put('review/review-provenance.json', data.review)
  assert.throws(data.prepare, /source path/)
  assert.equal(existsSync(join(data.root, 'public/audio')), false)
})
