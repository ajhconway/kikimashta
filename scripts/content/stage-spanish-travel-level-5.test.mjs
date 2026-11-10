import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, copyFile, mkdir, mkdtemp, rm, readdir, symlink, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { stageSpanishTravelLevel5 } from './stage-spanish-travel-level-5.mjs'

const DATA = 'content/spanish-travel-5'
const REVIEW = 'artifacts/spanish-travel-5-audio-review'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
async function absent(path) { await assert.rejects(stat(path), { code: 'ENOENT' }) }

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kikimashta-travel5-staging-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const acceptance = await json(DATA + '/acceptance.json')
  const media = await json(acceptance.mediaManifest)
  const previousBanks = (await readdir('content')).filter(name => /^es-419.*\.json$/.test(name) && name !== 'es-419-travel-5.json').map(name => 'content/' + name)
  const paths = new Set([DATA + '/acceptance.json', ...Object.keys(acceptance.inputs), ...media.images.map(image => image.path), ...media.clips.map(clip => REVIEW + '/' + clip.file), ...previousBanks])
  for (const path of paths) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await copyFile(path, join(root, path))
  }
  const protectedPaths = [...previousBanks, ...media.images.filter(image => image.source === 'reuse').map(image => image.path)]
  const protectedBytes = await Promise.all(protectedPaths.map(path => readFile(join(root, path))))
  return { root, acceptance, media, protectedPaths, protectedBytes }
}

test('Travel5 stages322 exact files without private originals, preserves reuses and reruns identically', async t => {
  const f = await fixture(t)
  await absent(join(f.root, 'artifacts/generated-originals'))
  const expected = { words: 36, images: 36, recordings: 288, newImages: 34, reusedImages: 2, newRecordings: 288, reusedRecordings: 0, copiedFiles: 322 }
  assert.deepEqual(await stageSpanishTravelLevel5({ root: f.root }), expected)
  const bank = await json(join(f.root, 'content/es-419-travel-5.json'))
  const activation = await json(join(f.root, DATA + '/activation.json'))
  assert.equal(bank.id, 'es-419-travel-5')
  assert.equal(bank.status, 'approved')
  assert.equal(bank.title, 'Travel level 5')
  assert.deepEqual(bank.items.map(item => item.id), f.media.items.map(item => item.id))
  assert.equal(new Set(bank.items.map(item => item.id)).size, 36)
  assert.deepEqual(activation.sharedItemIds, [])
  assert.equal(activation.copiedFiles, 322)
  assert.equal(activation.images.length, 36)
  assert.equal(activation.recordings.length, 288)
  for (const item of bank.items) {
    assert.equal(item.theme, 'travel')
    assert.equal(item.language, 'es-419')
    assert.deepEqual(item.audio.map(audio => audio.voice), f.media.voices.map(voice => voice.voice))
  }
  for (const image of f.media.images.filter(image => image.source === 'reuse')) {
    const word = bank.items.find(item => item.id === image.id)
    assert.equal('public/' + word.image.src, image.path)
  }
  assert.equal(activation.images.find(image => image.id === 'es-419-travel-draw').version, 3)
  assert.equal(activation.images.find(image => image.id === 'es-419-travel-sing').version, 2)
  for (const asset of [...activation.images, ...activation.recordings])
    assert.equal(hash(await readFile(join(f.root, 'public/' + asset.src))), asset.sha256)
  const quiet = activation.recordings.filter(clip => clip.targetLimited)
  assert.equal(quiet.length, 1)
  assert.equal(quiet[0].id, 'es-419-travel-record')
  assert.equal(quiet[0].voice, 'carlos-figueroa')
  assert.equal(quiet[0].after.integratedLufs, -23.67)
  const outputPath = join(f.root, 'public/' + activation.recordings[0].src)
  const before = await stat(outputPath, { bigint: true })
  const outputs = await Promise.all(['content/es-419-travel-5.json', DATA + '/activation.json'].map(path => readFile(join(f.root, path))))
  assert.deepEqual(await stageSpanishTravelLevel5({ root: f.root }), expected)
  assert.equal((await stat(outputPath, { bigint: true })).mtimeNs, before.mtimeNs)
  assert.deepEqual(await Promise.all(['content/es-419-travel-5.json', DATA + '/activation.json'].map(path => readFile(join(f.root, path)))), outputs)
  assert.deepEqual(await Promise.all(f.protectedPaths.map(path => readFile(join(f.root, path)))), f.protectedBytes)
})

test('Travel5 acceptance, input, picture and late recording tampering reject before any output', async t => {
  const f = await fixture(t)
  const acceptancePath = join(f.root, DATA + '/acceptance.json')
  const acceptanceBytes = await readFile(acceptancePath)
  const firstImage = f.media.images.find(image => image.source === 'generated')
  const firstOutput = join(f.root, `public/images/approved/${firstImage.id}-${firstImage.sha256.slice(0, 12)}.png`)
  const reject = async pattern => {
    await assert.rejects(stageSpanishTravelLevel5({ root: f.root }), pattern)
    await absent(firstOutput)
    await absent(join(f.root, 'content/es-419-travel-5.json'))
    await absent(join(f.root, DATA + '/activation.json'))
  }
  for (const change of [
    acceptance => { acceptance.status = 'pending' },
    acceptance => { acceptance.ownerMessage = 'Only generate more audio' },
    acceptance => { acceptance.acceptedNewQuieterClips = [] },
    acceptance => { delete acceptance.inputs[REVIEW + '/normalization-verification.json'] },
    acceptance => { delete acceptance.inputs['artifacts/spanish-travel-5-art/records/draw-v3.json'] },
  ]) {
    const altered = structuredClone(f.acceptance)
    change(altered)
    await writeFile(acceptancePath, JSON.stringify(altered))
    await reject(/acceptance|bindings|quieter|Unbound/)
    await writeFile(acceptancePath, acceptanceBytes)
  }
  for (const path of [f.acceptance.mediaManifest, REVIEW + '/normalization-summary.json', REVIEW + '/normalization-verification.json', f.media.images[0].path, REVIEW + '/' + f.media.clips.at(-1).file]) {
    const source = join(f.root, path)
    const original = await readFile(source)
    await writeFile(source, 'changed accepted source')
    await reject(/input bytes changed|artwork or provenance bytes changed|picture bytes changed|recording bytes changed/)
    await writeFile(source, original)
  }
  assert.deepEqual(await Promise.all(f.protectedPaths.map(path => readFile(join(f.root, path)))), f.protectedBytes)
})

test('Travel5 preflights all destination links/conflicts and rejects late source redirects', async t => {
  const f = await fixture(t)
  const firstImage = f.media.images.find(image => image.source === 'generated')
  const firstOutput = join(f.root, `public/images/approved/${firstImage.id}-${firstImage.sha256.slice(0, 12)}.png`)
  const last = f.media.clips.at(-1)
  const lateSource = join(f.root, REVIEW + '/' + last.file)
  const lateBytes = await readFile(lateSource)
  await rm(lateSource)
  await symlink(join(f.root, 'missing-provider-source'), lateSource)
  await assert.rejects(stageSpanishTravelLevel5({ root: f.root }), /symlinks/)
  await absent(firstOutput)
  await rm(lateSource)
  await writeFile(lateSource, lateBytes)
  for (const path of ['content/es-419-travel-5.json', DATA + '/activation.json', 'public/audio/es-419-travel-5/' + last.voice + '/' + last.id + '.mp3']) {
    const output = join(f.root, path)
    await mkdir(dirname(output), { recursive: true })
    await symlink(join(f.root, 'missing-output'), output)
    await assert.rejects(stageSpanishTravelLevel5({ root: f.root }), /symlinks/)
    await absent(firstOutput)
    await rm(output)
  }
  await mkdir(dirname(firstOutput), { recursive: true })
  await writeFile(firstOutput, 'unrelated existing output must remain')
  await assert.rejects(stageSpanishTravelLevel5({ root: f.root }), /destination differs/)
  assert.equal(await readFile(firstOutput, 'utf8'), 'unrelated existing output must remain')
  await absent(join(f.root, 'content/es-419-travel-5.json'))
  assert.deepEqual(await Promise.all(f.protectedPaths.map(path => readFile(join(f.root, path)))), f.protectedBytes)
})

test('Travel5 requires unchanged discarded dancer images, records, requests and acceptance bindings before staging', async t => {
  const f = await fixture(t)
  const acceptancePath = join(f.root, DATA + '/acceptance.json')
  const acceptanceBytes = await readFile(acceptancePath)
  const firstImage = f.media.images.find(image => image.source === 'generated')
  const firstOutput = join(f.root, `public/images/approved/${firstImage.id}-${firstImage.sha256.slice(0, 12)}.png`)
  const noWrites = async () => {
    await absent(firstOutput)
    await absent(join(f.root, 'public/audio/es-419-travel-5'))
    await absent(join(f.root, 'content/es-419-travel-5.json'))
    await absent(join(f.root, DATA + '/activation.json'))
  }
  for (const name of [
    'dance-v2-initial.png', 'dance-v2-glow-edit.png', 'dance-v2-glow-retry.png',
    'dance-v2-glow-edit-request.json', 'dance-v2-glow-retry-request.json',
    'dance-v2-initial-record.json', 'people-v2-initial-requests.json',
    'people-v2-attempt-history.json',
  ]) {
    const relative = 'artifacts/spanish-travel-5-art/revisions/' + name
    const path = join(f.root, relative)
    const original = await readFile(path)
    assert.equal(f.acceptance.inputs[relative], hash(original), `Acceptance must bind ${name}`)
    await writeFile(path, 'changed discarded history')
    await assert.rejects(stageSpanishTravelLevel5({ root: f.root }), /Accepted Travel input bytes changed/)
    await noWrites()
    await rm(path)
    await assert.rejects(stageSpanishTravelLevel5({ root: f.root }), { code: 'ENOENT' })
    await noWrites()
    await writeFile(path, original)
    const missingBinding = structuredClone(f.acceptance)
    delete missingBinding.inputs[relative]
    await writeFile(acceptancePath, JSON.stringify(missingBinding))
    await assert.rejects(stageSpanishTravelLevel5({ root: f.root }), /final input bindings are incomplete/)
    await noWrites()
    await writeFile(acceptancePath, acceptanceBytes)
  }
})
