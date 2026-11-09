import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, copyFile, mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { stageSpanishTravelLevel4 } from './stage-spanish-travel-level-4.mjs'
const hash = b => createHash('sha256').update(b).digest('hex')
const json = async (p) => JSON.parse(await readFile(p, 'utf8'))
test('stages only exact accepted effective36/288 and rejects changed inputs/media/symlinks before any production write', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spanish-travel4-stage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const acceptance = await json('content/spanish-travel-4/acceptance.json')
  const art = await json('artifacts/spanish-travel-4-art/manifest.json')
  const paths = new Set(['content/spanish-travel-4/acceptance.json', 'content/spanish-travel-4/accepted-artwork-registry.json', ...Object.keys(acceptance.inputs), ...art.images.map(i => i.path)])
  for (const p of Object.keys(acceptance.inputs).filter(p => p.includes('/records/'))) {
    const r = await json(p)
    const slug = r.slug
    const version = r.version
    const q = version === 1
      && slug !== 'power-outlet' ? (await json('artifacts/spanish-travel-4-art/requests.json')).requests.find(q => q.slug === slug) : await json(`artifacts/spanish-travel-4-art/revisions/${slug}-v${version}-request.json`)
    paths.add(q.referencePath)
  }
  for (const folder of ['artifacts/spanish-travel-4-audio-review', 'artifacts/spanish-travel-4-replacement-audio-review'])
    for (const c of (await json(folder + '/manifest.json')).clips)
      paths.add(folder + '/' + c.file)
  for (const p of paths) {
    await mkdir(dirname(join(root, p)), { recursive: true })
    await copyFile(p, join(root, p))
  }
  assert.deepEqual(await stageSpanishTravelLevel4({ root }), {
    words: 36, images: 36, recordings: 288, voices: 8
  })
  const bank = await json(join(root, 'content/es-419-travel-4.json'))
  const activation = await json(join(root, 'content/spanish-travel-4/activation.json'))
  assert.equal(bank.items.length, 36)
  assert.equal(bank.items.some(i => i.id === 'es-419-travel-bandage'), false)
  assert.equal(bank.items.find(i => i.id === 'es-419-travel-power-outlet').text, 'enchufe')
  assert.equal(activation.images.length, 36)
  assert.equal(activation.images.filter(i => i.source === 'generated').length, 35)
  assert.equal(activation.recordings.length, 288)
  assert.equal(activation.recordings.filter(c => c.id === 'es-419-travel-power-outlet').length, 8)
  assert.equal(activation.recordings.filter(c => c.targetLimited).length, 1)
  assert.equal(activation.images.find(i => i.id === 'es-419-travel-supermarket').version, 2)
  for (const m of [...activation.images, ...activation.recordings])
    assert.equal(hash(await readFile(join(root, 'public/' + m.src))), m.sha256)
  const sentinelPath = join(root, 'public/' + activation.images[0].src)
  const sentinel = Buffer.from('do not overwrite after rejected preflight')
  await writeFile(sentinelPath, sentinel)
  const fail = async (expression) => {
    await assert.rejects(stageSpanishTravelLevel4({ root }), expression)
    assert.deepEqual(await readFile(sentinelPath), sentinel)
  }
  const pending = structuredClone(acceptance)
  pending.status = 'pending'
  await writeFile(join(root, 'content/spanish-travel-4/acceptance.json'), JSON.stringify(pending))
  await fail(/owner acceptance/)
  await copyFile('content/spanish-travel-4/acceptance.json', join(root, 'content/spanish-travel-4/acceptance.json'))
  const config = join(root, 'content/spanish-travel-4/audio-config.json')
  const originalConfig = await readFile(config)
  await writeFile(config, '{}')
  await fail(/Accepted input bytes changed/)
  await writeFile(config, originalConfig)
  const registryPath = join(root, 'content/card-regeneration/activation.json')
  const registryBytes = await readFile(registryPath)
  const registry = JSON.parse(registryBytes)
  registry.assets.push({ id: 'ja-unrelated-new-artwork', path: 'public/images/unrelated.png', sha256: '0'.repeat(64) })
  await writeFile(registryPath, JSON.stringify(registry))
  assert.deepEqual(await stageSpanishTravelLevel4({ root }), { words: 36, images: 36, recordings: 288, voices: 8 })
  await writeFile(sentinelPath, sentinel)
  const flower = art.images.find(i => i.source === 'approved-reuse')
  registry.assets.find(a => a.id === flower.sourceId).sha256 = '0'.repeat(64)
  await writeFile(registryPath, JSON.stringify(registry))
  await fail(/Approved flower reuse changed/)
  await writeFile(registryPath, registryBytes)
  const snapshotPath = join(root, 'content/spanish-travel-4/accepted-artwork-registry.json')
  const snapshotBytes = await readFile(snapshotPath)
  await writeFile(snapshotPath, '{}')
  await fail(/Accepted input bytes changed/)
  await writeFile(snapshotPath, snapshotBytes)
  const picture = join(root, art.images.at(-1).path)
  const originalPicture = await readFile(picture)
  await writeFile(picture, 'changed accepted flower')
  await fail(/PNG|image bytes/)
  await writeFile(picture, originalPicture)
  const last = activation.recordings.at(-1).sourcePath
  const audio = join(root, last)
  const originalAudio = await readFile(audio)
  await writeFile(audio, 'changed accepted audio')
  await fail(/recording bytes changed/)
  await writeFile(audio, originalAudio)
  await rm(audio)
  await symlink(join(root, 'missing-audio'), audio)
  await fail(/contains a symlink/)
  await rm(audio)
  await writeFile(audio, originalAudio)
  const bankPath = join(root, 'content/es-419-travel-4.json')
  await rm(bankPath)
  await symlink(join(root, 'missing-bank'), bankPath)
  await fail(/contains a symlink/)
})
