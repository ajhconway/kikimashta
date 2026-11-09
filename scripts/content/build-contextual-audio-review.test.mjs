import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFile, mkdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contextualFixture, sha256 } from './contextual-audio-fixtures.mjs'
import { generateContextualAudition } from './generate-contextual-audition.mjs'
import { generateCards } from './generate-elevenlabs-cards.mjs'
import { buildContextualAudioReview, contextualAudioReviewHtml } from './build-contextual-audio-review.mjs'

const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const hasFfmpeg = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const journal = async path => (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)
const jsonl = records => records.map(record => JSON.stringify(record) + '\n').join('')

async function mediaFixture(t, stage = 'contrastive', { representativeNormalization = false } = {}) {
  const fixture = await contextualFixture(t, { hostileText: true, stage })
  const audio = {}
  for (const [kind, frequency] of [['sentence', 440], ['question', 880]]) {
    const path = join(fixture.root, `${kind}.mp3`)
    execFileSync(ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i',
      `sine=frequency=${frequency}:sample_rate=44100:duration=0.5`, '-af', 'volume=0.5', '-c:a', 'libmp3lame', '-b:a', '128k', path])
    audio[kind] = await readFile(path)
  }
  await generateContextualAudition({ root: fixture.root, output: fixture.output, apiKey: 'fixture-secret', stage,
    generate: args => generateCards({ ...args, log: () => {},
      balance: async () => ({ usedCredits: 0, creditLimit: 10000, remainingCredits: 10000 }),
      speak: async (_key, _voice, request) => ({ audio: audio[request.text === fixture.bank.contexts[0].sentence.text ? 'sentence' : 'question'] }) }) })
  const delivery = join(fixture.root, 'artifacts/generated-originals/contextual-audition/normalized')
  const originalsPath = join(fixture.output, 'originals.jsonl')
  const originals = await journal(originalsPath)
  // The simple-stage case tests review metadata, not eighteen identical encodes.
  // Normalize one real sentence and question; keep the full matrix integration below.
  const representatives = [...new Map(originals.map(record => [record.kind, record])).values()]
  if (representativeNormalization) await writeFile(originalsPath, jsonl(representatives))
  const normalization = JSON.parse(execFileSync('python3', [fileURLToPath(new URL('./normalize-elevenlabs.py', import.meta.url)),
    '--input', fixture.output, '--output', delivery, '--ffmpeg', ffmpeg, '--workers', '2'], { encoding: 'utf8', timeout: 60000 }))
  assert.equal(normalization.clips, representativeNormalization ? 2 : 18)
  if (representativeNormalization) {
    await writeFile(originalsPath, jsonl(originals))
    const normalized = await journal(join(delivery, 'deliveries.jsonl'))
    const sorted = value => Array.isArray(value) ? value.map(sorted) : value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value
    const expanded = []
    for (const original of originals) {
      const representative = normalized.find(record => record.kind === original.kind)
      assert.equal(original.sha256, representative.originalSha256, 'representatives contain identical original waveform bytes')
      const file = original.file.slice('originals/'.length)
      await mkdir(join(delivery, original.voice), { recursive: true })
      if (file !== representative.file) await copyFile(join(delivery, representative.file), join(delivery, file))
      expanded.push({ ...representative, ...original, file, originalFile: original.file,
        originalSha256: original.sha256, sourceRecordSha256: sha256(JSON.stringify(sorted(original))) })
    }
    await writeFile(join(delivery, 'deliveries.jsonl'), jsonl(expanded))
  }
  return { ...fixture, delivery, review: join(fixture.root, 'artifacts/contextual-audio-review/complete'),
    build: output => buildContextualAudioReview({ root: fixture.root, input: fixture.output, delivery, output, ffmpeg, stage }) }
}

test('simple review uses its approved bank and issue with independently verified source audio',
  { skip: !hasFfmpeg && 'FFmpeg is required for real local preview checks' }, async t => {
    const fixture = await mediaFixture(t, 'simple', { representativeNormalization: true })
    const result = await fixture.build(fixture.review)
    const review = await json(join(fixture.review, 'review-provenance.json'))
    assert.equal(result.recordings, 18)
    assert.equal(result.pairs, 12)
    assert.equal(review.issue, 136)
    assert.equal(review.bankId, 'ja-contextual-simple-pilot-v1')
    assert.equal(review.approval.bankId, review.bankId)
    assert.ok(review.samples.every(sample => sample.contextId.startsWith('ja-ctx-simple-')))
    assert.equal(review.gapFrames, 28665)
    for (const sample of review.samples) {
      assert.equal(sha256(await readFile(join(fixture.review, sample.src))), sample.sha256)
    }
  })

test('review text escapes Japanese/English/answer labels while retaining native replay controls', () => {
  const unsafe = '<img src=x onerror="alert(1)"> & text'
  const html = contextualAudioReviewHtml({ contexts: [{}], voices: [{ name: unsafe }], gapMs: 650,
    samples: [{ voice: 'otani', voiceName: unsafe, contextId: 'ja-test', src: 'samples/otani-ja-test.wav',
      sentence: { text: unsafe, meaning: unsafe }, question: { id: 'ja-test-target', kind: 'target', text: unsafe, meaning: unsafe,
        correctAnswer: unsafe, correctMeaning: unsafe } }] })
  assert.doesNotMatch(html, /<img|autoplay/)
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; text/)
  assert.match(html, /<audio controls preload="none"/)
  assert.match(html, /Correct answer/)
  assert.match(html, /650 ms of silence/)
})

test('verified originals and the real normalizer produce ordered lossless preview pairs and reject corrupt preflights',
  { skip: !hasFfmpeg && 'FFmpeg is required for real local preview checks' }, async t => {
    const fixture = await mediaFixture(t)
    const originalRecords = await journal(join(fixture.output, 'originals.jsonl'))
    const originalsBefore = new Map(await Promise.all(originalRecords.map(async record => [record.file, await readFile(join(fixture.output, record.file))])))
    const result = await fixture.build(fixture.review)
    assert.equal(result.pairs, 12)
    assert.deepEqual(result.voices, ['Otani', 'Morioki'])
    assert.equal(result.recordings, 18)
    const review = await json(join(fixture.review, 'review-provenance.json'))
    assert.equal(review.gapFrames, 28665)
    assert.equal(review.originalsPreserved, true)
    assert.equal(review.samples.length, 12)
    assert.equal(new Set(review.samples.map(sample => `${sample.voice}:${sample.contextId}:${sample.question.id}`)).size, 12)
    const html = await readFile(join(fixture.review, 'index.html'), 'utf8')
    assert.equal((html.match(/<audio controls/g) ?? []).length, 12)
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/)
    assert.doesNotMatch(html, /<script>|fixture-secret/)
    assert.doesNotMatch(JSON.stringify(review), /fixture-secret/)
    const first = review.samples[0]
    assert.equal(first.sentence.reading, fixture.bank.contexts[0].sentence.reading)
    assert.equal(first.question.reading, fixture.bank.contexts[0].questions[0].prompt.reading)
    assert.ok(html.includes(first.sentence.reading))
    const wav = await readFile(join(fixture.review, first.src))
    assert.equal(wav.subarray(0, 4).toString(), 'RIFF')
    assert.equal(wav.readUInt16LE(20), 1)
    assert.equal(wav.readUInt16LE(22), 1)
    assert.equal(wav.readUInt32LE(24), 44100)
    assert.equal(wav.readUInt16LE(34), 16)
    assert.equal(sha256(wav), first.sha256)
    const decode = path => execFileSync(ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-i', path,
      '-map', '0:a:0', '-ar', '44100', '-ac', '1', '-f', 's16le', '-'])
    const sentence = decode(join(fixture.delivery, first.sentence.normalizedFile))
    const question = decode(join(fixture.delivery, first.question.normalizedFile))
    assert.notDeepEqual(sentence, question)
    assert.deepEqual(wav.subarray(44), Buffer.concat([sentence, Buffer.alloc(28665 * 2), question]))
    assert.equal(first.frames * 2, wav.length - 44)
    assert.equal(first.question.correctAnswer, '猫')
    assert.equal(review.samples[1].question.correctAnswer, '犬')
    for (const [path, bytes] of originalsBefore) assert.deepEqual(await readFile(join(fixture.output, path)), bytes)

    let caseNumber = 0
    async function editCase(name, path, edit, pattern) {
      await t.test(name, async () => {
        const before = await readFile(path)
        const output = join(fixture.root, `artifacts/contextual-audio-review/rejected-${caseNumber++}`)
        try {
          await writeFile(path, await edit(before))
          await assert.rejects(fixture.build(output), pattern)
          assert.equal(existsSync(output), false)
        } finally { await writeFile(path, before) }
      })
    }
    const originalsPath = join(fixture.output, 'originals.jsonl')
    const deliveryPath = join(fixture.delivery, 'deliveries.jsonl')
    const deliveries = await journal(deliveryPath)
    await editCase('missing source recording prevents review output', originalsPath,
      raw => jsonl(raw.toString().trim().split('\n').map(JSON.parse).slice(1)), /Expected 18 original recordings/)
    await editCase('duplicate normalized pair prevents review output', deliveryPath, raw => {
      const records = raw.toString().trim().split('\n').map(JSON.parse)
      records[1] = records[0]
      return jsonl(records)
    }, /duplicate normalized deliveries/)
    await editCase('another question text cannot be paired with an approved source', deliveryPath, raw => {
      const records = raw.toString().trim().split('\n').map(JSON.parse)
      records[0].text = '違う質問です。'
      return jsonl(records)
    }, /identity mismatch/)
    await editCase('corrupt provider original prevents review output', join(fixture.output, originalRecords[0].file),
      raw => Buffer.concat([raw, Buffer.from('damaged')]), /hash mismatch/)
    await editCase('corrupt normalized delivery prevents review output', join(fixture.delivery, deliveries[0].file),
      raw => Buffer.concat([raw, Buffer.from('damaged')]), /hash mismatch/)
    await editCase('changed sidecar cannot silently replace the source journal identity',
      join(fixture.output, 'records', `${originalRecords[0].voice}-${originalRecords[0].id}.json`), raw => {
        const record = JSON.parse(raw)
        record.requestId = 'different-source'
        return JSON.stringify(record)
      }, /journal and sidecar differ/)
    await editCase('modified pairing plan is rejected before review output', join(fixture.output, 'audition-plan.json'), raw => {
      const saved = JSON.parse(raw)
      saved.contexts[0].questions.reverse()
      return JSON.stringify(saved)
    }, /pairing or voices/)
    await editCase('unsafe normalized filename is rejected before reading it', deliveryPath, raw => {
      const records = raw.toString().trim().split('\n').map(JSON.parse)
      records[0].file = '../outside.mp3'
      return jsonl(records)
    }, /identity mismatch/)
    await editCase('wrong normalization profile is rejected', deliveryPath, raw => {
      const records = raw.toString().trim().split('\n').map(JSON.parse)
      records[0].profile.targetLufs = -23
      return jsonl(records)
    }, /Unverified normalized level/)
    await editCase('actual decoded frame count must match provenance', deliveryPath, raw => {
      const records = raw.toString().trim().split('\n').map(JSON.parse)
      records[0].decodedFrames++
      return jsonl(records)
    }, /failed complete decode/)
    await t.test('source symlink escape and production output are rejected', async () => {
      const record = deliveries[0]
      const target = join(fixture.delivery, record.file)
      const before = await readFile(target)
      const outside = join(fixture.root, 'outside-delivery.mp3')
      const output = join(fixture.root, 'artifacts/contextual-audio-review/escaped')
      await writeFile(outside, before)
      await unlink(target)
      await symlink(outside, target)
      try {
        await assert.rejects(fixture.build(output), /escapes its source directory/)
        assert.equal(existsSync(output), false)
      } finally { await unlink(target); await writeFile(target, before) }
      await assert.rejects(fixture.build(join(fixture.root, 'public/audio/review')), /separate output under/)
      assert.equal(existsSync(join(fixture.root, 'public')), false)
      const production = join(fixture.root, 'public')
      await mkdir(production)
      const alias = join(fixture.root, 'artifacts/contextual-audio-review/production-alias')
      await symlink(production, alias)
      await assert.rejects(fixture.build(join(alias, 'leaked-review')), /separate output under/)
      assert.equal(existsSync(join(production, 'leaked-review')), false)
    })
  })
