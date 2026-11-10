import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, stat, rm, readdir, symlink, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { loadSpanishTravelLevel5Plan } from './generate-spanish-travel-level-5.mjs'
import { travelLevel5AudioReviewManifest, travelLevel5AudioReviewHtml, travelLevel5NormalizationVerification, buildSpanishTravelLevel5AudioReview } from './build-spanish-travel-level-5-audio-review.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const stable = value => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const profile = { version: 1, targetLufs: -22, truePeakCeilingDbtp: -2, maxBoostDb: 9, rate: 44100, bitrate: '128k', dualMono: true, shortClipAnalysis: 'pad-to-500ms-only-for-measurement' }
let verified
async function fixture() {
  const { plan, approval } = structuredClone(await (verified ??= loadSpanishTravelLevel5Plan()))
  const originalBytes = Buffer.alloc(100, 1), deliveryBytes = Buffer.alloc(100, 2)
  const originals = plan.items.flatMap(item => plan.voices.map(voice => ({
    ...item, voice: voice.voice, voiceId: voice.id, voiceName: voice.name, model: plan.model,
    request: { text: item.text, model_id: plan.model, language_code: 'es', voice_settings: plan.voiceSettings },
    planIdentity: hash(JSON.stringify(plan)), file: `originals/${voice.voice}/${item.id}.mp3`, sha256: hash(originalBytes), bytes: originalBytes.length,
  })))
  const deliveries = originals.map(original => ({
    ...structuredClone(original), file: original.file.slice(10), originalFile: original.file, originalSha256: original.sha256,
    sourceRecordSha256: hash(JSON.stringify(stable(original))), profile: structuredClone(profile),
    after: { integratedLufs: -22, truePeakDbtp: -3, analysisPadding: false, measurementMethod: 'r128' },
    decodedFrames: 44100, gainDb: 0, targetLimited: false, limitingReasons: [], deliverySha256: hash(deliveryBytes), deliveryBytes: deliveryBytes.length,
  }))
  const summary = { profile: structuredClone(profile), clips: 288, resumed: 0, targetLimited: 0, shortClipMeasurements: 0, originalsPreserved: true,
    processing: 'Constant gain; each delivered MP3 encoded directly from its provider original. No dynamics compression, trimming, or timing changes.' }
  return { plan, approval, originals, deliveries, originalBytes, deliveryBytes, summary }
}
async function writeFixture(t) {
  const data = await fixture(), folder = await mkdtemp(join(tmpdir(), 'travel5-listening-'))
  t.after(() => rm(folder, { recursive: true, force: true }))
  const input = join(folder, 'private-originals'), delivery = join(folder, 'private-normalized'), output = join(folder, 'review')
  await mkdir(input); await mkdir(delivery)
  for (const [index, original] of data.originals.entries()) {
    const originalPath = join(input, original.file), deliveredPath = join(delivery, data.deliveries[index].file)
    await mkdir(dirname(originalPath), { recursive: true }); await mkdir(dirname(deliveredPath), { recursive: true })
    await writeFile(originalPath, data.originalBytes); await writeFile(deliveredPath, data.deliveryBytes)
  }
  await writeFile(join(input, 'originals.jsonl'), data.originals.map(row => JSON.stringify(row)).join('\n') + '\n')
  await writeFile(join(delivery, 'deliveries.jsonl'), data.deliveries.map(row => JSON.stringify(row)).join('\n') + '\n')
  await writeFile(join(input, 'approval.json'), JSON.stringify(data.approval))
  await writeFile(join(input, 'summary.json'), JSON.stringify({ status: 'generated', completed: 288 }))
  await writeFile(join(delivery, 'normalization-summary.json'), JSON.stringify(data.summary, null, 2) + '\n')
  return { ...data, folder, input, delivery, output }
}
async function absent(path) { await assert.rejects(stat(path), { code: 'ENOENT' }) }

test('Travel5 complete listening gallery includes all accepted pictures, 288 clips and four filters', async () => {
  const { plan, approval, originals, deliveries } = await fixture()
  const manifest = travelLevel5AudioReviewManifest(plan, approval, originals, deliveries)
  const draft = JSON.parse(await readFile('content/spanish-travel-5/draft.json'))
  manifest.items = manifest.items.map(item => ({ ...item, group: draft.items.find(row => row.id === item.id).group }))
  manifest.groups = draft.groups
  manifest.images = JSON.parse(await readFile('content/spanish-travel-5/artwork-acceptance.json')).images
  const html = travelLevel5AudioReviewHtml(manifest)
  assert.equal(manifest.issue, 243)
  assert.equal(manifest.pack, 'es-419-travel-5')
  assert.equal(manifest.clips.length, 288)
  assert.equal((html.match(/<audio controls/g) ?? []).length, 288)
  assert.equal((html.match(/<img /g) ?? []).length, 36)
  assert.match(html, /draw-v3.png/)
  assert.match(html, /sing-v2.png/)
  for (const control of ['search', 'region', 'voice', 'group']) assert.match(html, new RegExp(`id="${control}"`))
  assert.match(html, /teatro — Juan, Mexico City, Mexico/)
  assert.match(html, /dibujar — Veronica, Puerto Rico/)
  assert.match(html, /current=audio;stop.disabled=false/)
  assert.match(html, /window.addEventListener\('pagehide',halt\)/)
  assert.doesNotMatch(html, /Cesar|localStorage|indexedDB/)
  assert.equal(manifest.runtimeActivationAuthorized, false)
})

test('Travel5 rejects incomplete, duplicate, changed identity and playback matrices', async () => {
  for (const change of [
    f => { f.originals.pop() }, f => { f.deliveries[1] = f.deliveries[0] },
    f => { f.originals[0].request.text = 'wrong word' }, f => { f.deliveries[0].sourceRecordSha256 = 'wrong' },
    f => { f.deliveries[0].after.truePeakDbtp = 0 }, f => { f.deliveries[0].profile.targetLufs = -14 },
    f => { f.approval.expectedClips = 287 }, f => { f.plan.issue = 231 },
    f => { f.deliveries[0].deliverySha256 = '../outside' }, f => { f.deliveries[0].deliveryBytes = 0 },
  ]) {
    const data = await fixture(); change(data)
    assert.throws(() => travelLevel5AudioReviewManifest(data.plan, data.approval, data.originals, data.deliveries))
  }
})

test('Travel5 source tampering and saved approval drift fail before output creation', async t => {
  const data = await writeFixture(t)
  const original = join(data.input, data.originals[0].file)
  await writeFile(original, Buffer.alloc(100, 3))
  await assert.rejects(buildSpanishTravelLevel5AudioReview(data), /source hash mismatch/)
  await absent(data.output)
  await writeFile(original, data.originalBytes)
  const normalized = join(data.delivery, data.deliveries[0].file)
  await writeFile(normalized, Buffer.alloc(100, 4))
  await assert.rejects(buildSpanishTravelLevel5AudioReview(data), /source hash mismatch/)
  await absent(data.output)
  await writeFile(normalized, data.deliveryBytes)
  await writeFile(join(data.input, 'approval.json'), JSON.stringify({ ...data.approval, ownerMessage: 'changed' }))
  await assert.rejects(buildSpanishTravelLevel5AudioReview(data), /approval is incomplete/)
  await absent(data.output)
})

test('Travel5 rejects descendant source symlinks before creating review output', async t => {
  const data = await writeFixture(t)
  const path = join(data.delivery, data.deliveries[0].file)
  const redirected = join(data.folder, 'redirected.mp3')
  await writeFile(redirected, data.deliveryBytes); await rm(path); await symlink(redirected, path)
  await assert.rejects(buildSpanishTravelLevel5AudioReview(data), /symlinks/)
  await absent(data.output)
})

test('Travel5 normalization evidence verifies summary and short-clip flags', async () => {
  const { plan, approval, originals, deliveries, summary } = await fixture()
  const manifest = travelLevel5AudioReviewManifest(plan, approval, originals, deliveries)
  const bytes = Buffer.from(JSON.stringify(summary, null, 2) + '\n')
  const evidence = travelLevel5NormalizationVerification(manifest, bytes)
  assert.equal(evidence.issue, 243)
  assert.equal(evidence.pack, 'es-419-travel-5')
  assert.equal(evidence.normalizationSummarySha256, hash(bytes))
  assert.equal(evidence.manifestSha256, hash(JSON.stringify(manifest, null, 2) + '\n'))
  for (const change of [
    s => { s.profile.rate = 48000 }, s => { s.clips = 287 }, s => { s.originalsPreserved = false },
    s => { s.resumed = 289 }, s => { s.targetLimited = 1 }, s => { s.shortClipMeasurements = 1 },
  ]) {
    const changed = structuredClone(summary); change(changed)
    assert.throws(() => travelLevel5NormalizationVerification(manifest, Buffer.from(JSON.stringify(changed))))
  }
  const changed = structuredClone(manifest)
  changed.clips[0].decodedFrames = 1000
  assert.throws(() => travelLevel5NormalizationVerification(changed, bytes))
})

test('Travel5 preflights normalization before writes and refuses overwrite; successful review publishes only normalized clips', async t => {
  const data = await writeFixture(t)
  const summaryPath = join(data.delivery, 'normalization-summary.json')
  const summaryBytes = await readFile(summaryPath)
  await writeFile(summaryPath, JSON.stringify({ ...data.summary, clips: 287 }))
  await assert.rejects(buildSpanishTravelLevel5AudioReview(data), /normalization summary differs/)
  await absent(data.output)
  await writeFile(summaryPath, summaryBytes)
  const manifest = await buildSpanishTravelLevel5AudioReview(data)
  assert.equal(manifest.clips.length, 288)
  assert.equal(manifest.images.length, 36)
  assert.deepEqual(await readFile(join(data.output, 'audio', data.plan.voices[0].voice, data.plan.items[0].id + '.mp3')), data.deliveryBytes)
  assert.deepEqual(await readFile(join(data.output, 'normalization-summary.json')), summaryBytes)
  const evidence = JSON.parse(await readFile(join(data.output, 'normalization-verification.json')))
  assert.equal(evidence.manifestSha256, hash(await readFile(join(data.output, 'manifest.json'))))
  assert.deepEqual((await readdir(data.output)).sort(), ['audio', 'index.html', 'manifest.json', 'normalization-summary.json', 'normalization-verification.json'])
  const before = await readFile(join(data.output, 'index.html'))
  await assert.rejects(buildSpanishTravelLevel5AudioReview(data), { code: 'EEXIST' })
  assert.deepEqual(await readFile(join(data.output, 'index.html')), before)
  await assert.rejects(buildSpanishTravelLevel5AudioReview({ ...data, output: join(data.input, 'review') }), /separate from private/)
  await absent(join(data.input, 'review'))
})

test('Travel5 refuses changed accepted artwork bytes before any review writes', async t => {
  const data = await writeFixture(t), root = join(data.folder, 'repository')
  await mkdir(root)
  const acceptance = JSON.parse(await readFile('content/spanish-travel-5/artwork-acceptance.json'))
  const art = JSON.parse(await readFile(acceptance.artworkManifest))
  const inputs = new Set([
    'content/spanish-travel-5/draft.json', 'content/spanish-travel-5/artwork-acceptance.json', 'content/spanish-travel-5/audio-approval.json',
    'content/spanish-travel-5/audio-config.json', 'content/es-419-voices.json', acceptance.artworkManifest, acceptance.selection,
    ...Object.keys(art.inputHashes), ...acceptance.images.map(image => image.path),
  ])
  for (const path of inputs) {
    const target = join(root, path)
    await mkdir(dirname(target), { recursive: true }); await copyFile(resolve(path), target)
  }
  await writeFile(join(root, acceptance.images[0].path), 'changed artwork')
  await assert.rejects(buildSpanishTravelLevel5AudioReview({ ...data, root }), /artwork or provenance bytes changed/)
  await absent(data.output)
})
