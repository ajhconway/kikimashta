import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import draft from '../../content/spanish-basic-1/draft.json' with { type: 'json' }
import { buildBasicMediaReview } from './build-spanish-basic-level-1-media-review.mjs'

const source = fileURLToPath(new URL('../../', import.meta.url))
test('complete review preserves selected revisions, all audio and pair identity; tampering cannot rewrite it', async t => {
  const root = await mkdtemp(join(tmpdir(), 'basic-media-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const copy = async path => { await mkdir(dirname(join(root, path)), { recursive: true }); await cp(join(source, path), join(root, path), { recursive: true }) }
  for (const path of ['artifacts/spanish-basic-1-art', 'artifacts/spanish-basic-1-audio-review', 'content/card-regeneration/activation.json', 'content/es-419-voices.json',
    ...['draft.json','generation-approval.json','audio-config.json','audio-approval.json'].map(f => 'content/spanish-basic-1/' + f),
    'artifacts/card-regeneration/references/cat-style-reference.png', ...draft.items.flatMap(i => i.artwork.reuseCandidate ? [i.artwork.reuseCandidate.path] : [])]) await copy(path)
  const manifest = await buildBasicMediaReview(root)
  assert.equal(manifest.images.length, 15)
  assert.equal(manifest.images.filter(i => i.source === 'generated').length, 9)
  assert.equal(manifest.images.find(i => i.id === 'es-419-basic-next-to').version, 2)
  const reviewPath = join(root, 'content/spanish-basic-1/media-review.html'), html = await readFile(reviewPath, 'utf8')
  assert.equal((html.match(/<audio controls /g) ?? []).length, 336)
  assert.equal((html.match(/class="play-pair"/g) ?? []).length, 72)
  assert.equal((html.match(/class="limited"/g) ?? []).length, 2)
  const audioPath = join(root, 'artifacts/spanish-basic-1-audio-review/manifest.json'), originalAudio = await readFile(audioPath)
  const audio = JSON.parse(originalAudio)
  audio.contexts[0].questionId = audio.contexts[1].questionId
  await writeFile(audioPath, JSON.stringify(audio))
  await assert.rejects(buildBasicMediaReview(root), /Contextual sentence\/question mapping changed/)
  assert.equal(await readFile(reviewPath, 'utf8'), html)
  await writeFile(audioPath, originalAudio)
  const picturePath = join(root, manifest.images.find(i => i.source === 'generated').path), picture = await readFile(picturePath)
  await writeFile(picturePath, 'changed picture')
  await assert.rejects(buildBasicMediaReview(root), /Generated picture bytes changed/)
  await writeFile(picturePath, picture)
  const clip = audio.clips[0], clipPath = join(root, 'artifacts/spanish-basic-1-audio-review', clip.file)
  await writeFile(clipPath, 'changed recording')
  await assert.rejects(buildBasicMediaReview(root), /Recording bytes changed/)
  assert.equal(await readFile(reviewPath, 'utf8'), html)
})
