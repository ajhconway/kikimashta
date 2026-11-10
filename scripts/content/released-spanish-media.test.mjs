import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

function exactIds(actual, expected, message) {
  assert.equal(new Set(actual).size, actual.length, message)
  assert.deepEqual([...actual].sort(), [...expected].sort(), message)
}

function releaseCoverage(banks, releases) {
  exactIds(releases.map(release => release.activation.pack), [...banks.keys()], 'release/bank identity coverage')
}

const recordingKey = clip => JSON.stringify([clip.id, clip.voice, clip.role ?? 'word', clip.targetItemId ?? clip.id])
const mediaHash = media => media.deliverySha256 ?? media.sha256
function mediaCoverage(bank, activation, accepted, contexts = []) {
  const words = [...bank.items, ...(bank.foundationVocabulary ?? [])]
  const voices = activation.voices.map(voice => voice.voice)
  exactIds(activation.images.map(image => image.id), bank.items.map(word => word.id), 'picture coverage')
  exactIds(accepted.images.map(image => image.id), bank.items.map(word => word.id), 'accepted picture coverage')
  const expected = words.flatMap(word => voices.map(voice => recordingKey({ id: word.id, voice })))
  for (const context of contexts) for (const role of ['sentence', 'question']) for (const voice of voices) {
    expected.push(recordingKey({ id: `${context.id}-${role}`, voice, role, targetItemId: context.targetItemId }))
  }
  exactIds(accepted.recordings.map(recordingKey), expected, 'accepted recording coverage')
  exactIds(activation.recordings.map(recordingKey), expected, 'recording coverage')
  for (const image of activation.images) {
    assert.equal(image.sha256, mediaHash(accepted.images.find(entry => entry.id === image.id)), `accepted picture: ${image.id}`)
  }
  for (const clip of activation.recordings) {
    assert.equal(clip.sha256, mediaHash(accepted.recordings.find(entry => recordingKey(entry) === recordingKey(clip))), `accepted recording: ${clip.id}/${clip.voice}`)
  }
}

function acceptedInventory(acceptance) {
  const combinedPath = acceptance.combinedMediaManifest ?? acceptance.mediaManifest
  if (combinedPath) {
    const combined = read(combinedPath)
    return { images: combined.images, recordings: combined.clips }
  }
  const inputs = Object.keys(acceptance.inputs ?? {})
  const artworkPath = acceptance.artworkManifest ?? acceptance.artworkPath ?? inputs.find(path => /-art\/manifest\.json$/.test(path))
  assert.ok(artworkPath, 'accepted artwork manifest')
  const artwork = read(artworkPath)
  const audioPaths = new Set([acceptance.audioReviewManifest ?? acceptance.audioPath,
    ...inputs.filter(path => /-audio-review\/manifest\.json$/.test(path))].filter(Boolean))
  assert.ok(audioPaths.size, 'accepted recording manifest')
  const recordings = [...audioPaths].flatMap(path => read(path).clips)
  return { images: artwork.images ?? artwork.items.map(item => ({ id: item.id, ...item.artwork })),
    // Travel4's accepted original audio matrix preserves the superseded bandage.
    // Its separately accepted replacement contributes the eight power-outlet clips.
    recordings: recordings.filter(clip => acceptance.pack !== 'es-419-travel-4' || clip.id !== 'es-419-travel-bandage') }
}

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
  const bankList = readdirSync(content).filter(name => /^es-419(?:-[a-z0-9-]+)?\.json$/.test(name))
    .map(name => read('content/' + name)).filter(bank => Array.isArray(bank.items))
  const banks = new Map(bankList.map(bank => [bank.id, bank]))
  assert.equal(banks.size, bankList.length, 'unique bank identities')
  const releases = readdirSync(content, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name.startsWith('spanish-') &&
    existsSync(new URL(`content/${entry.name}/activation.json`, root)))
    .map(entry => ({ folder: entry.name, activation: read(`content/${entry.name}/activation.json`) }))
  releaseCoverage(banks, releases)
  for (const { folder, activation } of releases) {
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
      ['mediaManifest', 'mediaManifestSha256'],
      ['draftPath', 'draftSha256'],
      ['artworkPath', 'artworkSha256'],
      ['audioPath', 'audioSha256'],
    ]) if (acceptance[pathKey]) assert.equal(digest(acceptance[pathKey]), acceptance[hashKey], acceptance[pathKey])
    assert.equal(bank.language, 'es-419')
    const words = [...bank.items, ...(bank.foundationVocabulary ?? [])]
    assert.equal(new Set(words.map(word => word.id)).size, words.length, folder)
    assert.deepEqual(activation.voices.map(voice => voice.voice), voices, folder)
    const contexts = bank.foundationVocabulary?.length ? read(`content/${folder}/draft.json`).contexts : []
    mediaCoverage(bank, activation, acceptedInventory(acceptance), contexts)
    assert.equal(words.length, acceptance.words, folder)
    assert.equal(activation.recordings.length, acceptance.recordings, folder)
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

test('duplicate releases cannot conceal an unchecked bank', () => {
  const banks = new Map([['first', {}], ['second', {}]])
  assert.throws(() => releaseCoverage(banks, [{ activation: { pack: 'first' } }, { activation: { pack: 'first' } }]), /release\/bank identity coverage/)
})

function inventoryFixture() {
  const bank = { items: [{ id: 'picture' }], foundationVocabulary: [{ id: 'abstract' }] }
  const contexts = [{ id: 'context', targetItemId: 'abstract' }]
  const activation = { voices: [{ voice: 'one' }], images: [{ id: 'picture', sha256: 'approved image' }], recordings: [
    { id: 'picture', voice: 'one', sha256: 'word audio' }, { id: 'abstract', voice: 'one', sha256: 'abstract audio' },
    ...['sentence', 'question'].map(role => ({ id: `context-${role}`, voice: 'one', role, targetItemId: 'abstract', sha256: role + ' audio' })),
  ] }
  return { bank, contexts, activation, accepted: structuredClone(activation) }
}

test('omitting an activated picture cannot remove it from hash verification', () => {
  const { bank, activation, accepted, contexts } = inventoryFixture()
  activation.images = []
  assert.throws(() => mediaCoverage(bank, activation, accepted, contexts), /picture coverage/)
})

test('foundation contexts require both accepted recording roles without extra entries', () => {
  const { bank, activation, accepted, contexts } = inventoryFixture()
  mediaCoverage(bank, activation, accepted, contexts)
  activation.recordings.pop()
  assert.throws(() => mediaCoverage(bank, activation, accepted, contexts), /recording coverage/)
  activation.recordings.push({ ...accepted.recordings.at(-1), id: 'unexpected' })
  assert.throws(() => mediaCoverage(bank, activation, accepted, contexts), /recording coverage/)
})

test('coordinated activation changes cannot substitute other valid media for accepted identities', () => {
  const { bank, activation, accepted, contexts } = inventoryFixture()
  activation.images[0].sha256 = 'another valid image'
  assert.throws(() => mediaCoverage(bank, activation, accepted, contexts), /accepted picture/)
  activation.images = structuredClone(accepted.images)
  activation.recordings[0].sha256 = 'another valid recording'
  assert.throws(() => mediaCoverage(bank, activation, accepted, contexts), /accepted recording/)
})
