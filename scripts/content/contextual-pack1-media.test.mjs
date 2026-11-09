import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pack1MediaFixture as fixture } from './contextual-pack1-media-fixtures.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const available = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0

test('verified aliases retain logical question IDs and English, then stage every exact public delivery without accepting media',
  { skip: !available && 'FFmpeg required for real normalization/decode' }, async t => {
    const data = await fixture(t)
    const provenance = JSON.parse(await readFile(data.provenancePath))
    assert.equal(provenance.originalRecordings, 6)
    assert.equal(provenance.logicalRecordings, 696)
    assert.equal(provenance.samples.length, 464)
    const first = provenance.samples.find(sample => sample.voice === 'otani' && sample.question.id === 'ja-ctx-wk1-fixture-1-target')
    const alias = provenance.samples.find(sample => sample.voice === 'otani' && sample.question.id === 'ja-ctx-wk1-fixture-2-target')
    assert.equal(alias.question.itemId, first.question.id)
    assert.notEqual(alias.question.id, alias.question.itemId)
    assert.equal(alias.question.meaning, data.bank.contexts[1].questions[0].prompt.meaning)
    assert.notEqual(alias.question.meaning, first.question.meaning)
    assert.equal(alias.sentence.meaning, data.bank.contexts[1].sentence.meaning)
    assert.notEqual(alias.sentence.meaning, first.sentence.meaning)
    assert.equal(alias.sha256, first.sha256, 'identical text and voice share exact audio, not question identities or translations')
    const manifestPath = join(data.root, 'content/contextual/pack-1/generated-media.json')
    const before = await readFile(data.provenancePath)
    for (const [name, mutate, pattern] of [
      ['canonical ID substituted for logical ID', review => { review.samples[2].question.id = review.samples[0].question.id }, /logical question identity/],
      ['canonical English substituted for logical English', review => { review.samples[2].question.meaning = review.samples[0].question.meaning }, /question text\/revision\/answer/],
      ['wrong source alias', review => { review.samples[2].question.itemId = 'ja-not-this-recording' }, /question text\/revision\/answer/],
    ]) {
      await t.test(name, async () => {
        const changed = JSON.parse(before); mutate(changed)
        await writeFile(data.provenancePath, JSON.stringify(changed))
        assert.throws(data.stage, pattern)
        assert.equal(existsSync(manifestPath), false)
        await writeFile(data.provenancePath, before)
      })
    }
    await t.test('changed listening preview rejected before staging', async () => {
      const file = join(data.root, data.review, alias.src), bytes = await readFile(file)
      await writeFile(file, Buffer.concat([bytes, Buffer.from([0])]))
      assert.throws(data.stage, /listening preview hash/)
      assert.equal(existsSync(manifestPath), false)
      await writeFile(file, bytes)
    })
    const result = data.stage()
    assert.equal(result.contexts, 116)
    assert.equal(result.uniqueRecordings, 6)
    assert.equal(result.logicalRecordings, 696)
    assert.equal(result.audioReview, 'pending')
    assert.equal(hash(await readFile(manifestPath)), result.generatedMediaSha256)
    assert.deepEqual(data.stage(), result, 'verified staging is idempotent')
    const manifest = JSON.parse(await readFile(manifestPath))
    const approvalBytes = await readFile(join(data.root, 'content/contextual/pack-1/text-approval.json'))
    const approval = JSON.parse(approvalBytes)
    assert.equal(manifest.textApprovalSha256, hash(approvalBytes))
    assert.equal(manifest.authoredTextSha256, approval.textSha256)
    assert.notEqual(manifest.textApprovalSha256, manifest.authoredTextSha256)
    assert.ok(manifest.contexts.every(context => context.textApprovalSha256 === hash(approvalBytes)))
    let publicFiles = 0
    for (const context of manifest.contexts) for (const recording of context.recordings) {
      for (const [src, expected] of Object.entries(recording.hashes)) {
        publicFiles++
        assert.equal(hash(await readFile(join(data.root, 'public', src))), expected)
      }
    }
    assert.equal(publicFiles, 696)
    assert.equal(existsSync(join(data.root, 'content/contextual/pack-1/acceptance.json')), false)
    assert.deepEqual(await readFile(join(data.root, 'content/contextual/ja-wanikani-1-draft.json')), data.bankBytes)
    const html = await readFile(join(data.root, data.review, 'index.html'), 'utf8')
    assert.match(html, /Play visible pairs/)
    assert.match(html, /await your listening approval/)
    assert.equal((html.match(/class="sample"/g) ?? []).length, 464)
  })
