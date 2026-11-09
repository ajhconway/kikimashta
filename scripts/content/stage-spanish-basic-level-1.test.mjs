import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp, mkdtemp, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { stageSpanishBasicLevel1 } from './stage-spanish-basic-level-1.mjs'
const hash = b => createHash('sha256').update(b).digest('hex')

test('stages only accepted pictures and foundation vocabulary; rejects tampering before production writes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'basic-stage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const draft = JSON.parse(await readFile('content/spanish-basic-1/draft.json'))
  const paths = ['artifacts/spanish-basic-1-art', 'artifacts/spanish-basic-1-audio-review',
    'content/card-regeneration/activation.json', 'content/es-419-voices.json',
    ...['draft.json','acceptance.json','generation-approval.json','audio-config.json','audio-approval.json'].map(p => 'content/spanish-basic-1/' + p),
    'artifacts/card-regeneration/references/cat-style-reference.png', 'artifacts/card-regeneration/references/kiku-character-reference.png',
    ...draft.items.flatMap(i => i.artwork.reuseCandidate ? [i.artwork.reuseCandidate.path] : [])]
  for (const path of paths) { await mkdir(dirname(join(root, path)), { recursive: true }); await cp(path, join(root, path), { recursive: true }) }
  const bankPath = join(root, 'content/es-419-basic-1.json')
  const acceptancePath = join(root, 'content/spanish-basic-1/acceptance.json'), acceptanceBytes = await readFile(acceptancePath)
  const rejected = JSON.parse(acceptanceBytes); rejected.status = 'pending'
  await writeFile(acceptancePath, JSON.stringify(rejected))
  await assert.rejects(stageSpanishBasicLevel1({ root }), /Complete owner acceptance/)
  await assert.rejects(readFile(bankPath), { code: 'ENOENT' })
  await writeFile(acceptancePath, acceptanceBytes)
  const picture = JSON.parse(await readFile(join(root, 'artifacts/spanish-basic-1-art/manifest.json'))).images.find(i => i.id === 'es-419-basic-sleepiness')
  const picturePath = join(root, picture.path), pictureBytes = await readFile(picturePath)
  await writeFile(picturePath, 'changed final pillow')
  await assert.rejects(stageSpanishBasicLevel1({ root }), /Generated picture bytes changed/)
  await assert.rejects(readFile(bankPath), { code: 'ENOENT' })
  await writeFile(picturePath, pictureBytes)
  const audio = JSON.parse(await readFile(join(root, 'artifacts/spanish-basic-1-audio-review/manifest.json')))
  const clip = audio.clips.find(c => c.role === 'question'), clipPath = join(root, 'artifacts/spanish-basic-1-audio-review', clip.file), clipBytes = await readFile(clipPath)
  await writeFile(clipPath, 'changed question recording')
  await assert.rejects(stageSpanishBasicLevel1({ root }), /Recording bytes changed/)
  await assert.rejects(readFile(bankPath), { code: 'ENOENT' })
  await writeFile(clipPath, clipBytes)
  // Dangling destination symlinks must not redirect accepted writes.
  await symlink(join(root, 'outside-missing-bank'), bankPath)
  await assert.rejects(stageSpanishBasicLevel1({ root }), /Staging target contains a symlink/)
  await rm(bankPath)
  assert.deepEqual(await stageSpanishBasicLevel1({ root }), { words: 24, pictureWords: 15, foundationWords: 9, images: 15, recordings: 336, voices: 8 })
  const bank = JSON.parse(await readFile(bankPath)), activation = JSON.parse(await readFile(join(root, 'content/spanish-basic-1/activation.json')))
  assert.equal(bank.items.length, 15)
  assert.equal(bank.foundationVocabulary.length, 9)
  assert.ok(bank.foundationVocabulary.every(i => !i.image && i.audio.length === 8))
  assert.equal(activation.recordings.filter(c => c.role === 'word').length, 192)
  assert.equal(activation.recordings.filter(c => c.role === 'sentence').length, 72)
  assert.equal(activation.recordings.filter(c => c.role === 'question').length, 72)
  for (const i of activation.images) assert.equal(hash(await readFile(join(root, 'public', i.src))), i.sha256)
  for (const c of activation.recordings) assert.equal(hash(await readFile(join(root, 'public', c.src))), c.sha256)
  assert.equal(hash(await readFile(join(root, 'public', bank.items.find(i => i.id === 'es-419-basic-sleepiness').image.src))), picture.sha256)
})
