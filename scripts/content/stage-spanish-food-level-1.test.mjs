import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, copyFile, cp, mkdtemp, mkdir, rm, symlink, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { stageSpanishFoodLevel1 } from './stage-spanish-food-level-1.mjs'
const hash = b => createHash('sha256').update(b).digest('hex')
const json = async (p) => JSON.parse(await readFile(p, 'utf8'))
const FOOD = 'content/spanish-food-1'
const ART = 'artifacts/spanish-food-1-art'
const AUDIO = 'artifacts/spanish-food-1-audio-review'
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'spanish-food1-stage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const acceptance = await json(FOOD + '/acceptance.json')
  const draft = await json(FOOD + '/draft.json')
  const reuse = await json(FOOD + '/audio-reuse.json')
  const paths = new Set([FOOD + '/acceptance.json', ...Object.keys(acceptance.inputs), 'content/catalog/ja.json'])
  for (const item of draft.items)
    if (item.artwork.source === 'approved-reuse') {
      paths.add(item.artwork.path)
      paths.add(item.artwork.evidence)
    }
  for (const c of reuse.clips)
    paths.add(c.path)
  for (const p of paths) {
    await mkdir(dirname(join(root, p)), { recursive: true })
    await copyFile(p, join(root, p))
  }
  for (const p of [ART, AUDIO]) {
    await mkdir(dirname(join(root, p)), { recursive: true })
    await cp(p, join(root, p), { recursive: true })
  }
  return {
    root, acceptance, draft, reuse
  }
}
test('Food staging shares 24 identities/media, overrides only Spanish rice and copies only 108 new assets', async (t) => {
  const { root, draft, reuse } = await fixture(t)
  const protectedPaths = ['content/catalog/ja.json', ...reuse.sources.map(s => s.bank), ...reuse.clips.map(c => c.path), ...draft.items.filter(i => i.artwork.source === 'approved-reuse').map(i => i.artwork.path)]
  const before = await Promise.all(protectedPaths.map(p => readFile(join(root, p))))
  assert.deepEqual(await stageSpanishFoodLevel1({ root }), {
    words: 36, images: 36, recordings: 288, newImages: 12, newRecordings: 96, reusedImages: 24, reusedRecordings: 192, copiedFiles: 108
  })
  const bank = await json(join(root, 'content/es-419-food-1.json'))
  const activation = await json(join(root, FOOD + '/activation.json'))
  assert.deepEqual(bank.items.map(i => i.id), draft.items.map(i => i.id))
  assert.equal(new Set(bank.items.map(i => i.id)).size, 36)
  assert.equal(activation.sharedItemIds.length, 24)
  assert.equal(activation.images.length, 36)
  assert.equal(activation.recordings.length, 288)
  assert.equal(activation.copiedFiles, 108)
  assert.equal(activation.recordings.filter(c => c.source === 'new-generation').length, 96)
  assert.equal(activation.recordings.filter(c => c.source === 'accepted-reuse').length, 192)
  assert.equal(activation.recordings.filter(c => c.source === 'new-generation' && c.targetLimited).length, 3)
  for (const word of draft.items) {
    const result = bank.items.find(i => i.id === word.id)
    assert.deepEqual(result.audio.map(a => a.voice), activation.voices.map(v => v.voice))
    if (word.membership === 'existing-spanish-item') {
      const source = (await json(join(root, word.existingBank))).items.find(i => i.id === word.id)
      if (word.id === 'es-419-travel-rice') {
        assert.deepEqual({ ...result, image: source.image }, source)
        assert.notEqual(result.image.src, source.image.src)
        assert.match(result.image.src, /es-419-travel-rice-[a-f0-9]{12}\.png$/)
      }
      else
        assert.deepEqual(result, source)
    }
    else
      assert.equal(result.theme, 'food')
  }
  const onion = bank.items.find(i => i.id === 'es-419-food-onion')
  assert.equal(onion.image.src, draft.items.find(i => i.id === onion.id).artwork.path.slice(7))
  const produced = (await readdir(join(root, 'public/audio/es-419-food-1'), { recursive: true })).filter(p => p.endsWith('.mp3'))
  assert.equal(produced.length, 96)
  assert(produced.every(p => p.split('/').at(-1).startsWith('es-419-food-')))
  for (const media of [...activation.images, ...activation.recordings])
    assert.equal(hash(await readFile(join(root, 'public/' + media.src))), media.sha256)
  assert.deepEqual(await Promise.all(protectedPaths.map(p => readFile(join(root, p)))), before)
})
test('Food acceptance, source and destination tampering fail before any production asset is written', async (t) => {
  const { root, acceptance } = await fixture(t)
  await stageSpanishFoodLevel1({ root })
  const activation = await json(join(root, FOOD + '/activation.json'))
  const first = activation.images.find(i => i.source === 'generated')
  const sentinelPath = join(root, 'public/' + first.src)
  const sentinel = Buffer.from('preserve this output after preflight rejection')
  await writeFile(sentinelPath, sentinel)
  const fail = async (pattern) => {
    await assert.rejects(stageSpanishFoodLevel1({ root }), pattern)
    assert.deepEqual(await readFile(sentinelPath), sentinel)
  }
  const acceptPath = join(root, FOOD + '/acceptance.json')
  const bytes = await readFile(acceptPath)
  const pending = structuredClone(acceptance)
  pending.status = 'pending'
  await writeFile(acceptPath, JSON.stringify(pending))
  await fail(/owner acceptance/)
  await writeFile(acceptPath, bytes)
  const altered = structuredClone(acceptance)
  altered.acceptedNewQuieterClips[0].sha256 = '0'.repeat(64)
  await writeFile(acceptPath, JSON.stringify(altered))
  await fail(/owner acceptance/)
  await writeFile(acceptPath, bytes)
  const combined = join(root, acceptance.combinedMediaManifest)
  const combinedBytes = await readFile(combined)
  await writeFile(combined, '{}')
  await fail(/input bytes changed/)
  await writeFile(combined, combinedBytes)
  for (const name of ['normalization-summary.json', 'normalization-verification.json']) {
    const path = join(root, AUDIO, name)
    const original = await readFile(path)
    await writeFile(path, '{}')
    await fail(/input bytes changed/)
    await writeFile(path, original)
    const missing = structuredClone(acceptance)
    delete missing.inputs[AUDIO + '/' + name]
    await writeFile(acceptPath, JSON.stringify(missing))
    await fail(/input bindings are incomplete/)
    await writeFile(acceptPath, bytes)
  }
  const selectedImage = activation.images.find(i => i.id === 'es-419-travel-rice')
  const imagePath = join(root, selectedImage.sourcePath)
  const imageBytes = await readFile(imagePath)
  await writeFile(imagePath, 'changed cooked rice')
  await fail(/image bytes|PNG/i)
  await writeFile(imagePath, imageBytes)
  const late = activation.recordings.filter(c => c.source === 'new-generation').at(-1)
  const sourcePath = join(root, late.sourcePath)
  const sourceBytes = await readFile(sourcePath)
  await writeFile(sourcePath, 'changed accepted clip')
  await fail(/recording bytes changed/)
  await writeFile(sourcePath, sourceBytes)
  await rm(sourcePath)
  await symlink(join(root, 'missing-source'), sourcePath)
  await fail(/symlinks/)
  await rm(sourcePath)
  await writeFile(sourcePath, sourceBytes)
  const destination = join(root, 'public/' + late.src)
  const destinationBytes = await readFile(destination)
  await rm(destination)
  await symlink(join(root, 'missing-destination'), destination)
  await fail(/symlinks/)
  await rm(destination)
  await writeFile(destination, destinationBytes)
  const bankPath = join(root, 'content/es-419-food-1.json')
  await rm(bankPath)
  await symlink(join(root, 'missing-bank'), bankPath)
  await fail(/symlinks/)
})
