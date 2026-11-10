import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spanishTravelLevel5Plan, loadSpanishTravelLevel5Plan, generateSpanishTravelLevel5Pack } from './generate-spanish-travel-level-5.mjs'
import { generateCards } from './generate-elevenlabs-cards.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'
const FOLDER = 'content/spanish-travel-5'
const ART = 'artifacts/spanish-travel-5-art'
const OWNER = "Looks good, let's proceed to audio generation."
const paths = {
  draftText: FOLDER + '/draft.json', artworkAcceptanceText: FOLDER + '/artwork-acceptance.json', registryText: 'content/es-419-voices.json', configText: FOLDER + '/audio-config.json', approvalText: FOLDER + '/audio-approval.json',
}

function fixture() {
  const voices = Array.from({ length: 8 }, (_, number) => ({ voice: 'voice-' + number, id: 'voiceId' + number, name: 'Voice ' + number, locale: 'es-MX', region: 'Mexico City, Mexico' }))
  const items = Array.from({ length: 36 }, (_, number) => ({ id: 'es-419-travel-word-' + number, text: number === 0 ? 'canción🎵' : 'palabra' + number, meaning: 'Word ' + number, membership: 'new-spanish-item' }))
  const files = {
    [paths.draftText]: json({ issue: 243, id: 'es-419-travel-5', language: 'es-419', items }),
    [paths.registryText]: json({ voices }),
    [paths.configText]: json({ issue: 243, provider: 'ElevenLabs', model: 'eleven_v4', language: 'es-419', voiceSettings: { stability: .5, similarity_boost: .75 }, normalization: { targetLufs: -22, truePeakCeilingDbtp: -2, dualMono: true }, approval: { ownerMessage: OWNER }, voices }),
    'refs/style.png': 'small source fixture',
    [ART + '/records/word-0-v1.json']: json({ id: items[0].id, source: 'immutable provenance fixture' }),
  }
  const selected = items.map((item, number) => {
    const path = ART + '/originals/word-' + number + '-v1.png'
    files[path] = 'small original picture ' + number
    return { id: item.id, text: item.text, meaning: item.meaning, source: 'generated', version: 1, path, sha256: hash(files[path]), bytes: Buffer.byteLength(files[path]) }
  })
  files[ART + '/selection.json'] = json({ issue: 243, pack: 'es-419-travel-5', items: selected })
  files[ART + '/manifest.json'] = json({
    issue: 243, pack: 'es-419-travel-5', words: 36, pendingImages: 0, items: selected,
    inputHashes: Object.fromEntries([paths.draftText, 'refs/style.png', ART + '/records/word-0-v1.json'].map(path => [path, hash(files[path])])),
    selection: ART + '/selection.json', selectionSha256: hash(files[ART + '/selection.json']),
  })
  files[paths.artworkAcceptanceText] = json({
    issue: 243, pack: 'es-419-travel-5', language: 'es-419', status: 'artwork-accepted', ownerMessage: OWNER,
    artworkManifest: ART + '/manifest.json', artworkManifestSha256: hash(files[ART + '/manifest.json']),
    selection: ART + '/selection.json', selectionSha256: hash(files[ART + '/selection.json']), pictures: 36,
    images: selected.map(({ id, path, sha256, source, version }) => ({ id, path, sha256, source, version })),
  })
  const canonical = items.map(({ id, text, meaning }) => ({ id, text, spelling: text, meaning }))
  const characters = canonical.reduce((total, item) => total + [...item.text].length, 0) * voices.length
  files[paths.approvalText] = json({
    issue: 243, pack: 'es-419-travel-5', language: 'es-419', status: 'generation-authorized-listening-pending', ownerMessage: OWNER,
    draft: paths.draftText, draftSha256: hash(files[paths.draftText]), artworkAcceptance: paths.artworkAcceptanceText, artworkAcceptanceSha256: hash(files[paths.artworkAcceptanceText]),
    configuration: paths.configText, configurationSha256: hash(files[paths.configText]), voiceRegistry: paths.registryText, voiceRegistrySha256: hash(files[paths.registryText]),
    items: canonical, itemsSha256: hash(JSON.stringify(canonical)), voicesSha256: hash(JSON.stringify(voices)), expectedClips: 288, characters, budget: Math.ceil(characters * 1.2 / 100) * 100, runtimeActivationAuthorized: false,
  })
  return { files, texts: Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, files[path]])), characters }
}

async function writeFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kikimashta-travel5-audio-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const f = fixture()
  for (const [path, bytes] of Object.entries(f.files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), bytes)
  }
  return { ...f, root }
}

test('exact36-new-word/eight-voice authorization derives Unicode characters and budget', () => {
  const f = fixture()
  const plan = spanishTravelLevel5Plan(f.texts)
  assert.equal(plan.items.length, 36)
  assert.equal(plan.voices.length, 8)
  assert.equal(plan.expectedClips, 288)
  assert.equal(plan.characters, f.characters)
  assert.equal(plan.characters, 2512, 'Unicode code points, including the astral music note, count once per voice')
  for (const key of Object.keys(paths).filter(key => key !== 'approvalText'))
    assert.throws(() => spanishTravelLevel5Plan({ ...f.texts, [key]: f.texts[key] + '\n' }), /authorization changed/)
  for (const alter of [
    approval => { approval.items[0].text = 'unapproved' },
    approval => { approval.expectedClips = 287 },
    approval => { approval.characters++ },
    approval => { approval.budget++ },
    approval => { approval.voicesSha256 = '0'.repeat(64) },
    approval => { approval.runtimeActivationAuthorized = true },
    approval => { approval.ownerMessage = 'Different scope' },
  ]) {
    const approval = JSON.parse(f.texts.approvalText)
    alter(approval)
    assert.throws(() => spanishTravelLevel5Plan({ ...f.texts, approvalText: json(approval) }))
  }
})

test('changed config remains invalid even with re-bound outer hashes', () => {
  const f = fixture()
  for (const alter of [
    config => { config.normalization.targetLufs = -16 },
    config => { config.voices.pop() },
    config => { config.approval.ownerMessage = 'Other approval' },
  ]) {
    const config = JSON.parse(f.texts.configText)
    alter(config)
    const configText = json(config)
    const approval = JSON.parse(f.texts.approvalText)
    approval.configurationSha256 = hash(configText)
    assert.throws(() => spanishTravelLevel5Plan({ ...f.texts, configText, approvalText: json(approval) }), /thirty-six approved/)
  }
})

test('selected images, acceptance, manifest, selection and provenance tampering stop before engine', async t => {
  const f = await writeFixture(t)
  assert.equal((await loadSpanishTravelLevel5Plan(f.root)).plan.expectedClips, 288)
  let calls = 0
  const generate = () => { calls++; assert.fail('No paid engine admission') }
  for (const path of [paths.draftText, paths.configText, paths.artworkAcceptanceText, ART + '/manifest.json', ART + '/selection.json', ART + '/originals/word-0-v1.png', ART + '/records/word-0-v1.json', 'refs/style.png']) {
    await writeFile(join(f.root, path), f.files[path] + '\nchanged')
    await assert.rejects(generateSpanishTravelLevel5Pack({ root: f.root, output: 'artifacts/generated-originals/batch', apiKey: 'fixture-secret', generate }))
    await writeFile(join(f.root, path), f.files[path])
    assert.equal(calls, 0)
    await assert.rejects(stat(join(f.root, 'artifacts/generated-originals/batch')), { code: 'ENOENT' })
  }
})

test('re-bound artwork cannot change identity or escape repository containment', async t => {
  const f = await writeFixture(t)
  const rebind = async acceptance => {
    const acceptanceText = json(acceptance)
    const approval = JSON.parse(f.files[paths.approvalText])
    approval.artworkAcceptanceSha256 = hash(acceptanceText)
    await writeFile(join(f.root, paths.artworkAcceptanceText), acceptanceText)
    await writeFile(join(f.root, paths.approvalText), json(approval))
  }
  for (const change of [
    acceptance => { acceptance.images[0].id = acceptance.images[1].id },
    acceptance => { acceptance.images[0].path = '../outside.png' },
    acceptance => { acceptance.artworkManifest = '../outside.json' },
  ]) {
    const acceptance = JSON.parse(f.files[paths.artworkAcceptanceText])
    change(acceptance)
    await rebind(acceptance)
    await assert.rejects(loadSpanishTravelLevel5Plan(f.root))
  }
  await rebind(JSON.parse(f.files[paths.artworkAcceptanceText]))
  const target = join(f.root, ART + '/originals/word-0-v1.png')
  await rm(target)
  await symlink(join(f.root, 'refs/style.png'), target)
  await assert.rejects(loadSpanishTravelLevel5Plan(f.root), /sources cannot contain symlinks/)
})

test('public, escaping and dangling output ancestors cannot admit generation', async t => {
  const f = await writeFixture(t)
  const generate = () => assert.fail('No paid engine admission')
  const outside = await mkdtemp(join(tmpdir(), 'travel5-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const privateRoot = join(f.root, 'artifacts/generated-originals')
  await mkdir(privateRoot, { recursive: true })
  for (const output of ['public/audio', 'artifacts/generated-originals', '../outside'])
    await assert.rejects(generateSpanishTravelLevel5Pack({ root: f.root, output, apiKey: 'fixture-secret', generate }), /Keep originals/)
  const link = join(privateRoot, 'escaping')
  for (const destination of [outside, join(outside, 'missing')]) {
    await symlink(destination, link)
    await assert.rejects(generateSpanishTravelLevel5Pack({ root: f.root, output: join(link, 'batch'), apiKey: 'fixture-secret', generate }), /Keep originals/)
    await rm(link)
  }
})

test('every resumed child-link class rejects before engine, balance, speech or public writes', async t => {
  const f = await writeFixture(t)
  const output = join(f.root, 'artifacts/generated-originals/batch')
  const outside = await mkdtemp(join(tmpdir(), 'travel5-resume-sentinel-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const sentinel = join(outside, 'public.txt')
  await writeFile(sentinel, 'public bytes unchanged')
  let engineCalls = 0, balanceCalls = 0, speechCalls = 0
  const generate = options => {
    engineCalls++
    return generateCards({ ...options, balance: () => { balanceCalls++; assert.fail('No balance call') }, speak: () => { speechCalls++; assert.fail('No speech call') } })
  }
  for (const [child, target] of [
    ['originals', outside], ['records', outside], ['pending', outside],
    ['originals/voice-0', join(outside, 'missing-directory')],
    ['originals/voice-0/es-419-travel-word-0.mp3', sentinel],
    ['plan.json', sentinel], ['approval.json', sentinel], ['generation.lock', sentinel],
    ['summary.json', join(outside, 'missing-report')], ['usage-before.json', sentinel], ['originals.jsonl', sentinel],
  ]) {
    const link = join(output, child)
    await mkdir(dirname(link), { recursive: true })
    await symlink(target, link)
    await assert.rejects(generateSpanishTravelLevel5Pack({ root: f.root, output, apiKey: 'fixture-secret', generate }), /output must not contain symlinks/)
    assert.equal(engineCalls, 0)
    assert.equal(balanceCalls, 0)
    assert.equal(speechCalls, 0)
    assert.equal(await readFile(sentinel, 'utf8'), 'public bytes unchanged')
    await assert.rejects(stat(join(outside, 'missing-report')), { code: 'ENOENT' })
    await rm(output, { recursive: true, force: true })
  }
})

test('safe resumable batches use the shared engine and never repeat completed speech', async t => {
  const f = await writeFixture(t)
  const output = join(f.root, 'artifacts/generated-originals/batch')
  let calls = 0, credits = 0, balanceCalls = 0
  const speak = async (_key, _voice, request) => {
    calls++
    credits += [...request.text].length
    return { audio: Buffer.from('provider fixture ' + calls), requestId: 'request-' + calls }
  }
  const balance = async () => { balanceCalls++; return { usedCredits: credits, remainingCredits: 100000 - credits, creditLimit: 100000 } }
  const generate = options => {
    assert.equal(options.concurrency, 2)
    assert.equal(options.budget, JSON.parse(f.files[paths.approvalText]).budget)
    return generateCards({ ...options, speak, balance, log: () => {} })
  }
  const first = await generateSpanishTravelLevel5Pack({ root: f.root, output, apiKey: 'fixture-secret', generate })
  assert.equal(first.completed, 288)
  assert.equal(calls, 288)
  assert.equal(credits, f.characters)
  const second = await generateSpanishTravelLevel5Pack({ root: f.root, output, apiKey: 'fixture-secret', generate })
  assert.equal(second.completed, 288)
  assert.equal(calls, 288)
  assert.deepEqual(JSON.parse(await readFile(join(output, 'approval.json'), 'utf8')), JSON.parse(f.files[paths.approvalText]))
  const before = balanceCalls
  await writeFile(join(output, 'approval.json'), '{}')
  await assert.rejects(generateSpanishTravelLevel5Pack({ root: f.root, output, apiKey: 'fixture-secret', generate }), /Saved Travel level 5 approval changed/)
  assert.equal(calls, 288)
  assert.equal(balanceCalls, before)
})
