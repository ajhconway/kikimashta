import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { stageCatalogAudio } from './stage-catalog-audio.mjs'

const item = { id: 'ja-v-0123456789ab', sourceLevel: 1, text: '人口', reading: 'じんこう', meaning: 'Population' }
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kikimashta-stage-audio-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = join(root, 'input'), artifact = join(input, 'level1')
  await mkdir(artifact, { recursive: true })
  const wav = Buffer.from('fixture original'), mp3 = Buffer.from('fixture delivery')
  const clip = { id: item.id, voice: 'marin', text: item.reading, spelling: item.text, meaning: item.meaning,
    file: `marin-${item.id}.mp3`, original: `marin-${item.id}.wav`,
    originalSha256: digest(wav), deliverySha256: digest(mp3), deliveryBytes: mp3.length }
  const manifest = { sourceLevel: 1, sourceRevision: 'source-sha', expectedClips: 2, clips: [clip], failures: [{ id: item.id, voice: 'cedar', error: 'Provider failed' }] }
  await writeFile(join(artifact, clip.original), wav)
  await writeFile(join(artifact, clip.file), mp3)
  const save = () => writeFile(join(artifact, 'provenance.json'), JSON.stringify(manifest))
  await save()
  const options = { input, target: join(root, 'published'), provenanceTarget: join(root, 'provenance'), catalog: { items: [item] }, expectedSourceRevision: 'source-sha', generation: { runId: '123', attempt: '2', sourceRevision: 'source-sha' } }
  return { options, artifact, clip, manifest, save, mp3 }
}
async function assertUnpublished(options) {
  await assert.rejects(access(options.target), { code: 'ENOENT' })
  await assert.rejects(access(options.provenanceTarget), { code: 'ENOENT' })
}

test('stages a legitimate partial success and provenance, while retaining WAV only in the artifact', async t => {
  const f = await fixture(t)
  assert.equal(await stageCatalogAudio(f.options), 1)
  assert.deepEqual(await readFile(join(f.options.target, f.clip.file)), f.mp3)
  assert.deepEqual(await readdir(f.options.target), [f.clip.file])
  const provenance = JSON.parse(await readFile(join(f.options.provenanceTarget, 'level-1.json'), 'utf8'))
  assert.deepEqual(provenance.clips, f.manifest.clips)
  assert.deepEqual(provenance.failures, f.manifest.failures)
  assert.deepEqual(provenance.generation, f.options.generation)
  assert.equal(provenance.sourceRevision, 'source-sha')
  await access(join(f.artifact, f.clip.original))
})

test('preflights all recordings before writes when a later MP3 is corrupted', async t => {
  const f = await fixture(t)
  const second = { ...f.clip, voice: 'cedar', file: `cedar-${item.id}.mp3`, original: `cedar-${item.id}.wav` }
  f.manifest.clips.push(second)
  await writeFile(join(f.artifact, second.original), 'fixture original')
  await writeFile(join(f.artifact, second.file), 'corrupted delivery')
  await f.save()
  await assert.rejects(stageCatalogAudio(f.options), /content mismatch/)
  await assertUnpublished(f.options)
})

for (const [name, mutate, error] of [
  ['unsafe filename', f => { f.clip.file = '../escape.mp3' }, /Unsafe/],
  ['duplicate recording', f => { f.manifest.clips.push({ ...f.clip }) }, /Duplicate/],
  ['unknown ID', f => { f.clip.id = 'ja-v-ffffffffffff' }, /identity/],
  ['wrong voice', f => { f.clip.voice = 'cedar' }, /identity/],
  ['wrong level', f => { f.manifest.sourceLevel = 2 }, /identity/],
  ['wrong reading', f => { f.clip.text = 'ひと' }, /identity/],
  ['wrong spelling', f => { f.clip.spelling = '人' }, /identity/],
  ['wrong meaning', f => { f.clip.meaning = 'Person' }, /identity/],
  ['wrong source revision', f => { f.manifest.sourceRevision = 'different-sha' }, /revision mismatch/],
]) test(`rejects ${name} before publication`, async t => {
  const f = await fixture(t)
  mutate(f)
  await f.save()
  await assert.rejects(stageCatalogAudio(f.options), error)
  await assertUnpublished(f.options)
})

test('rejects duplicate level artifacts before publication', async t => {
  const f = await fixture(t)
  const duplicate = join(f.options.input, 'duplicate-level1')
  await mkdir(duplicate)
  // An empty second artifact is still a duplicate of the same source level.
  await writeFile(join(duplicate, 'provenance.json'), JSON.stringify({ ...f.manifest, clips: [] }))
  await assert.rejects(stageCatalogAudio(f.options), /Duplicate artifact level/)
  await assertUnpublished(f.options)
})
