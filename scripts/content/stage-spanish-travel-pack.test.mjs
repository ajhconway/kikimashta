import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import art from '../../artifacts/spanish-travel-art/manifest.json' with { type: 'json' }
import review from '../../artifacts/spanish-travel-audio-review/manifest.json' with { type: 'json' }
import config from '../../content/es-419-voices.json' with { type: 'json' }
import acceptance from '../../content/spanish-travel-audio/acceptance.json' with { type: 'json' }
import { acceptedSpanishBank, stageSpanishTravelPack } from './stage-spanish-travel-pack.mjs'

test('activates the exact accepted 36×8 set with stable IDs, transparent PNG delivery and no Cesar or retired words', () => {
  const bank = acceptedSpanishBank(art, review, config.voices)
  assert.equal(bank.items.length, 36)
  assert.deepEqual(bank.items.map(i => i.id), art.items.map(i => i.id))
  assert.equal(bank.items.flatMap(i => i.audio).length, 288)
  assert(bank.items.every(i => i.audio.every(c => c.voice !== 'cesar')))
  assert.equal(bank.items.filter(i => i.image.src.endsWith('.png')).length, 30)
  assert.deepEqual(bank.items.find(i => i.id.endsWith('-car')).pictureDistractorExclusions, ['es-419-travel-taxi'])
  assert.deepEqual(bank.items.find(i => i.id.endsWith('-taxi')).pictureDistractorExclusions, ['es-419-travel-car'])
})

test('rejects incomplete, duplicated and mislabeled reviewed audio', () => {
  for (const change of [r => r.clips.pop(), r => { r.clips[1] = r.clips[0] }, r => { r.clips[0].voiceId = 'wrong' }, r => { r.clips[0].text = 'unapproved' }]) {
    const changed = structuredClone(review); change(changed)
    assert.throws(() => acceptedSpanishBank(art, changed, config.voices))
  }
})

test('changed acceptance manifests stop staging before any bank or production asset write', async t => {
  const root = await mkdtemp(join(tmpdir(), 'spanish-activation-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const files = {
    'content/spanish-travel-audio/acceptance.json': acceptance,
    [acceptance.artworkManifest]: { ...art, status: 'tampered' },
    [acceptance.audioReviewManifest]: review,
    'content/es-419-voices.json': config,
    'artifacts/spanish-travel-art/owner-feedback.json': {},
    'content/es-419.json': { retained: true },
  }
  for (const [file, data] of Object.entries(files)) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), JSON.stringify(data)) }
  await assert.rejects(stageSpanishTravelPack({ root }), /Accepted media manifest changed/)
  assert.deepEqual(JSON.parse(await readFile(join(root, 'content/es-419.json'))), { retained: true })
  await assert.rejects(readFile(join(root, 'content/spanish-travel-audio/activation.json')), { code: 'ENOENT' })
})
