import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

// Completed release tools do not need to recreate thousands of approved files on
// every app change. Verify their durable result and acceptance bindings instead.
test('all released Spanish banks retain accepted identities, complete voices and exact delivered bytes', () => {
  const voices = read('content/es-419-voices.json').voices.map(voice => voice.voice)
  const aliases = read('artifacts/artwork-aliases.json').aliases
  const checked = new Map()
  const digest = path => {
    if (!checked.has(path)) checked.set(path, hash(readFileSync(new URL(path, root))))
    return checked.get(path)
  }
  const content = new URL('content/', root)
  const banks = new Map(readdirSync(content).filter(name => /^es-419(?:-[a-z0-9-]+)?\.json$/.test(name))
    .map(name => read('content/' + name)).filter(bank => Array.isArray(bank.items)).map(bank => [bank.id, bank]))
  const releases = readdirSync(content, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name.startsWith('spanish-') &&
    existsSync(new URL(`content/${entry.name}/activation.json`, root))).map(entry => entry.name)
  assert.equal(releases.length, banks.size, 'each released bank has one activation record')
  for (const folder of releases) {
    const activation = read(`content/${folder}/activation.json`)
    const acceptance = read(activation.acceptance)
    const bank = banks.get(activation.pack)
    assert.ok(bank, activation.pack)
    assert.equal(acceptance.status, 'accepted-for-activation', folder)
    assert.equal(digest(activation.acceptance), activation.acceptanceSha256, folder)
    for (const [path, sha256] of Object.entries(acceptance.inputs ?? {})) {
      // This registry grows as unrelated Japanese artwork ships. Acceptance
      // pins its relevant image bytes; Travel4 also retains a frozen snapshot.
      if (path !== 'content/card-regeneration/activation.json') assert.equal(digest(path), sha256, path)
    }
    for (const [pathKey, hashKey] of [
      ['artworkManifest', 'artworkManifestSha256'],
      ['audioReviewManifest', 'audioReviewSha256'],
      ['combinedMediaManifest', 'combinedMediaManifestSha256'],
      ['draftPath', 'draftSha256'],
      ['artworkPath', 'artworkSha256'],
      ['audioPath', 'audioSha256'],
    ]) if (acceptance[pathKey]) assert.equal(digest(acceptance[pathKey]), acceptance[hashKey], acceptance[pathKey])
    assert.equal(bank.language, 'es-419')
    const words = [...bank.items, ...(bank.foundationVocabulary ?? [])]
    assert.equal(new Set(words.map(word => word.id)).size, words.length, folder)
    assert.deepEqual(activation.voices.map(voice => voice.voice), voices, folder)
    assert.equal(new Set(activation.recordings.map(clip => `${clip.id}:${clip.voice}`)).size, activation.recordings.length, folder)
    for (const word of words) {
      assert.deepEqual(word.audio.map(clip => clip.voice), voices, word.id)
      for (const clip of word.audio) {
        const approved = activation.recordings.find(record => record.id === word.id && record.voice === clip.voice)
        assert.ok(approved, `${word.id}/${clip.voice}`)
        assert.equal(clip.src, approved.src)
      }
    }
    for (const image of activation.images) {
      const word = bank.items.find(item => item.id === image.id)
      assert.ok(word, image.id)
      assert.equal(word.image.src, image.src)
      let source = image.sourcePath
      if (aliases[source]) {
        assert.equal(aliases[source].sha256, image.sha256)
        source = aliases[source].path
      }
      assert.equal(digest(source), image.sha256, image.sourcePath)
    }
    for (const media of [...activation.images, ...activation.recordings]) {
      assert.match(media.src, /^(?:images|audio)\/[a-zA-Z0-9/_.-]+$/)
      assert.ok(!media.src.split('/').includes('..'))
      assert.equal(digest('public/' + media.src), media.sha256, media.src)
      if (media.bytes !== undefined) assert.equal(readFileSync(new URL('public/' + media.src, root)).length, media.bytes, media.src)
    }
  }
})
