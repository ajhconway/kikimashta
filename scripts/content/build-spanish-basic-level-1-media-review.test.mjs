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
    'artifacts/card-regeneration/references/cat-style-reference.png', 'artifacts/card-regeneration/references/kiku-character-reference.png',
    ...draft.items.flatMap(i => i.artwork.reuseCandidate ? [i.artwork.reuseCandidate.path] : [])]) await copy(path)
  const selectionPath = join(root, 'artifacts/spanish-basic-1-art/selection.json'), selection = JSON.parse(await readFile(selectionPath))
  selection.versions['next-to'] = 3
  await writeFile(selectionPath, JSON.stringify(selection))
  const manifest = await buildBasicMediaReview(root)
  assert.equal(manifest.images.length, 15)
  assert.equal(manifest.images.filter(i => i.source === 'generated').length, 9)
  const nextTo = manifest.images.find(i => i.id === 'es-419-basic-next-to')
  assert.equal(nextTo.version, 3)
  assert.match(nextTo.concept, /CHAIR/)
  assert.equal(nextTo.ownerFeedback, 'Next to should use a chair.')
  assert.deepEqual(nextTo.additionalReferences.map(r => r.role), ['character-pose', 'approved-prop'])
  const reviewPath = join(root, 'content/spanish-basic-1/media-review.html'), html = await readFile(reviewPath, 'utf8')
  assert.equal((html.match(/<audio controls /g) ?? []).length, 336)
  assert.equal((html.match(/class="play-pair"/g) ?? []).length, 72)
  assert.equal((html.match(/class="limited"/g) ?? []).length, 2)
  assert.ok(html.includes('Revised picture concept'))
  assert.ok(html.includes(nextTo.concept))
  assert.ok(!html.includes(draft.items.find(i => i.id === nextTo.id).artwork.concept))

  const posePath = join(root, 'artifacts/card-regeneration/references/kiku-character-reference.png'), pose = await readFile(posePath)
  await writeFile(posePath, 'changed character reference')
  await assert.rejects(buildBasicMediaReview(root), /Artwork reference changed/)
  assert.equal(await readFile(reviewPath, 'utf8'), html)
  await writeFile(posePath, pose)

  const requestPath = join(root, 'artifacts/spanish-basic-1-art/revisions/next-to-v3-request.json'), originalRequest = await readFile(requestPath)
  const recordPath = join(root, 'artifacts/spanish-basic-1-art/records/next-to-v3.json'), originalRecord = await readFile(recordPath)
  const request = JSON.parse(originalRequest), record = JSON.parse(originalRecord)
  request.additionalReferences[1].sourceId = 'unapproved-chair'
  record.additionalReferences = request.additionalReferences
  await writeFile(requestPath, JSON.stringify(request))
  await writeFile(recordPath, JSON.stringify(record))
  await assert.rejects(buildBasicMediaReview(root), /Artwork reference changed/)
  assert.equal(await readFile(reviewPath, 'utf8'), html)
  request.additionalReferences[1].role = 'unapproved-reference-kind'
  record.additionalReferences = request.additionalReferences
  await writeFile(requestPath, JSON.stringify(request))
  await writeFile(recordPath, JSON.stringify(record))
  await assert.rejects(buildBasicMediaReview(root), /Artwork reference changed/)
  await writeFile(requestPath, originalRequest)
  await writeFile(recordPath, originalRecord)
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
