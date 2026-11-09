import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile, cp, mkdtemp, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { inspectFoodLevel1Media, buildFoodLevel1MediaReview } from './build-spanish-food-level-1-media-review.mjs'
const source = fileURLToPath(new URL('../../', import.meta.url)), FOOD = 'content/spanish-food-1', ART = 'artifacts/spanish-food-1-art', AUDIO = 'artifacts/spanish-food-1-audio-review', MEDIA = 'artifacts/spanish-food-1-media-review'
const hash = b => createHash('sha256').update(b).digest('hex'), json = async path => JSON.parse(await readFile(path, 'utf8'))
const save = async (root, path, value) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n') }
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'food-listening-review-')); t.after(() => rm(root, { recursive: true, force: true }))
  const draft = await json(join(source, FOOD, 'draft.json')), reuse = await json(join(source, FOOD, 'audio-reuse.json')), generated = await json(join(source, AUDIO, 'manifest.json'))
  const paths = new Set(['content/es-419-voices.json', 'content/catalog/ja.json', ...['draft.json', 'generation-approval.json', 'artwork-revisions-v1.json', 'artwork-acceptance.json', 'audio-config.json', 'audio-approval.json', 'audio-reuse.json'].map(f => FOOD + '/' + f)])
  for (const item of draft.items) {
    if (item.artwork.source === 'approved-reuse') { paths.add(item.artwork.path); paths.add(item.artwork.evidence) }
    if (item.existingBank) paths.add(item.existingBank)
  }
  for (const s of reuse.sources) for (const key of ['bank', 'activation', 'acceptance']) paths.add(s[key])
  for (const c of reuse.clips) paths.add(c.path)
  for (const path of paths) { await mkdir(dirname(join(root, path)), { recursive: true }); await copyFile(join(source, path), join(root, path)) }
  for (const folder of [ART, AUDIO]) { await mkdir(dirname(join(root, folder)), { recursive: true }); await cp(join(source, folder), join(root, folder), { recursive: true }) }
  return { root, draft, reuse, generated }
}
const outputs = root => Promise.all([MEDIA + '/manifest.json', MEDIA + '/index.html', FOOD + '/media-review.html'].map(path => readFile(join(root, path))))

test('complete Food listening review preserves all accepted artwork and links 96 new plus 192 existing recordings without duplicates', async t => {
  const { root, draft, reuse, generated } = await fixture(t)
  const protectedFiles = [ART + '/manifest.json', ART + '/review.html', FOOD + '/artwork-acceptance.json', FOOD + '/draft.json', FOOD + '/audio-approval.json', FOOD + '/audio-reuse.json']
  const before = await Promise.all(protectedFiles.map(path => readFile(join(root, path))))
  const inspected = await inspectFoodLevel1Media(root)
  await assert.rejects(readFile(join(root, MEDIA, 'manifest.json')), { code: 'ENOENT' })
  assert.equal(inspected.images.length, 36); assert.equal(inspected.items.length, 36); assert.equal(inspected.clips.length, 288)
  assert.equal(inspected.clips.filter(c => c.source === 'new-generation').length, 96); assert.equal(inspected.clips.filter(c => c.source === 'accepted-reuse').length, 192)
  assert.equal(new Set(inspected.clips.map(c => c.id + ':' + c.voice)).size, 288)
  assert.deepEqual(inspected.items.map(i => i.id), draft.items.map(i => i.id))
  for (const c of reuse.clips) assert.equal(inspected.clips.find(i => i.id === c.id && i.voice === c.voice).path, c.path)
  for (const c of generated.clips) assert.equal(inspected.clips.find(i => i.id === c.id && i.voice === c.voice).path, AUDIO + '/' + c.file)
  assert.equal(inspected.inputs[AUDIO + '/manifest.json'], hash(await readFile(join(root, AUDIO, 'manifest.json'))))
  assert.equal(inspected.artworkStatus, 'accepted'); assert.equal(inspected.listeningStatus, 'pending'); assert.equal(inspected.runtimeActivationAuthorized, false)
  const result = await buildFoodLevel1MediaReview(root)
  assert.deepEqual(result, inspected)
  const html = await readFile(join(root, FOOD, 'media-review.html'), 'utf8')
  assert.equal((html.match(/<article /g) ?? []).length, 36); assert.equal((html.match(/<img /g) ?? []).length, 36)
  assert.equal((html.match(/<audio controls /g) ?? []).length, 288)
  assert.equal((html.match(/<audio controls data-source="new-generation"/g) ?? []).length, 96)
  assert.equal((html.match(/<audio controls data-source="accepted-reuse"/g) ?? []).length, 192)
  assert.ok(html.includes('Food listening approval is pending')); assert.ok(html.includes('New recordings only')); assert.ok(html.includes('Food group')); assert.ok(html.includes('Mexico City, Mexico'))
  assert.ok(html.includes('../../public/audio/')); assert.ok(html.includes('../../' + AUDIO + '/audio/'))
  assert.deepEqual(await Promise.all(protectedFiles.map(path => readFile(join(root, path)))), before)
  await assert.rejects(readFile(join(root, MEDIA, 'audio', reuse.clips[0].voice, reuse.clips[0].id + '.mp3')), { code: 'ENOENT' })
})

test('changed new request/profile/audio and accepted reuse sources fail before rewriting a complete review', async t => {
  const { root, reuse, generated } = await fixture(t)
  await buildFoodLevel1MediaReview(root); const before = await outputs(root)
  const unchanged = async pattern => { await assert.rejects(buildFoodLevel1MediaReview(root), pattern); assert.deepEqual(await outputs(root), before) }
  const manifestPath = AUDIO + '/manifest.json', originalManifest = await readFile(join(root, manifestPath))
  generated.clips[0].request.text = 'another word'
  await save(root, manifestPath, generated); await unchanged(/recording identity or playback profile changed/)
  await save(root, manifestPath, originalManifest)
  const duplicate = JSON.parse(originalManifest); duplicate.clips[1] = duplicate.clips[0]
  await save(root, manifestPath, duplicate); await unchanged(/review matrix or authorization changed/)
  await save(root, manifestPath, originalManifest)
  const badState = JSON.parse(originalManifest); badState.status = 'accepted'
  await save(root, manifestPath, badState); await unchanged(/generated audio input bindings changed/)
  await save(root, manifestPath, originalManifest)
  const wrongProfile = JSON.parse(originalManifest); wrongProfile.clips[0].after.truePeakDbtp = 0
  await save(root, manifestPath, wrongProfile); await unchanged(/recording identity or playback profile changed/)
  await save(root, manifestPath, originalManifest)
  const newPath = AUDIO + '/' + JSON.parse(originalManifest).clips[0].file, newBytes = await readFile(join(root, newPath))
  await save(root, newPath, 'changed new recording'); await unchanged(/New Food recording bytes changed/); await save(root, newPath, newBytes)
  const existingPath = reuse.clips[0].path, existingBytes = await readFile(join(root, existingPath))
  await save(root, existingPath, 'changed accepted recording'); await unchanged(/Accepted reused audio bytes changed|Accepted reused Food recording bytes changed/); await save(root, existingPath, existingBytes)
  const bankPath = reuse.sources[0].bank, bankBytes = await readFile(join(root, bankPath)), bank = JSON.parse(bankBytes)
  bank.items[0].text += ' changed'
  await save(root, bankPath, bank); await unchanged(/Accepted reused audio provenance changed|accepted Food source/i); await save(root, bankPath, bankBytes)
  const reusePath = FOOD + '/audio-reuse.json', reuseBytes = await readFile(join(root, reusePath)), badReuse = JSON.parse(reuseBytes)
  badReuse.clips[0].path = '../../outside.mp3'
  await save(root, reusePath, badReuse); await unchanged(/Unsafe Food accepted recording path/); await save(root, reusePath, reuseBytes)
  const acceptancePath = FOOD + '/artwork-acceptance.json', acceptanceBytes = await readFile(join(root, acceptancePath)), acceptance = JSON.parse(acceptanceBytes)
  acceptance.images.reverse()
  await save(root, acceptancePath, acceptance); await unchanged(/Food artwork acceptance differs/); await save(root, acceptancePath, acceptanceBytes)
  await rm(join(root, manifestPath)); await unchanged({ code: 'ENOENT' }); await save(root, manifestPath, originalManifest)
})

test('source and output symlinks reject before touching accepted files or any prior output', async t => {
  const { root, reuse } = await fixture(t)
  await buildFoodLevel1MediaReview(root); const before = await outputs(root)
  const path = reuse.clips[0].path, original = await readFile(join(root, path))
  await save(root, 'same-audio.mp3', original); await rm(join(root, path)); await symlink(join(root, 'same-audio.mp3'), join(root, path))
  await assert.rejects(buildFoodLevel1MediaReview(root), /symlinks/); assert.deepEqual(await outputs(root), before)
  await rm(join(root, path)); await save(root, path, original)
  await save(root, 'sentinel.txt', 'unchanged target'); await rm(join(root, MEDIA, 'index.html')); await symlink(join(root, 'sentinel.txt'), join(root, MEDIA, 'index.html'))
  await assert.rejects(buildFoodLevel1MediaReview(root), /symlinks/)
  assert.deepEqual(await readFile(join(root, MEDIA, 'manifest.json')), before[0]); assert.deepEqual(await readFile(join(root, FOOD, 'media-review.html')), before[2])
  assert.equal(await readFile(join(root, 'sentinel.txt'), 'utf8'), 'unchanged target')
})
