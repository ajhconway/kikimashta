import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, mkdir, copyFile, cp, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spanishFoodLevel2Plan, loadSpanishFoodLevel2Plan, generateSpanishFoodLevel2Pack } from './generate-spanish-food-level-2.mjs'
const files = {
  draftText: 'content/spanish-food-2/draft.json', artworkAcceptanceText: 'content/spanish-food-2/artwork-acceptance.json', registryText: 'content/es-419-voices.json', configText: 'content/spanish-food-2/audio-config.json', approvalText: 'content/spanish-food-2/audio-approval.json', reuseText: 'content/spanish-food-2/audio-reuse.json'
}
async function fixture() {
  return Object.fromEntries(await Promise.all(Object.entries(files).map(async ([k, p]) => [k, await readFile(p, 'utf8')])))
}
test('only thirty-one new food words are paid; exact source hashes and 248/1616 limits are enforced', async () => {
  const f = await fixture()
  const p = spanishFoodLevel2Plan(f)
  assert.equal(p.expectedClips, 248)
  assert.equal(p.characters, 1616)
  assert.equal(p.items.length, 31)
  assert.equal(p.items[0].text, 'uvas')
  assert.equal(p.items.at(-1).text, 'cuchillo')
  assert(p.items.every(i => i.id.startsWith('es-419-food-')))
  for (const field of Object.keys(files).filter(k => k !== 'approvalText')) {
    const changed = structuredClone(f)
    changed[field] += '\n'
    assert.throws(() => spanishFoodLevel2Plan(changed))
  }
  for (const alter of [
    a => {
      a.items.push(a.items[0])
    }, a => {
      a.expectedClips = 288
    }, a => {
      a.characters++
    }, a => {
      a.budget = 2001
    }, a => {
      a.runtimeActivationAuthorized = true
    }
  ]) {
    const changed = structuredClone(f)
    const a = JSON.parse(changed.approvalText)
    alter(a)
    changed.approvalText = JSON.stringify(a)
    assert.throws(() => spanishFoodLevel2Plan(changed))
  }
})
test('invalid draft rejects before paid boundary or private output creation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spanish-food2-approval-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const p of Object.values(files)) {
    await mkdir(dirname(join(root, p)), { recursive: true })
    await copyFile(p, join(root, p))
  }
  await writeFile(join(root, files.draftText), (await readFile(join(root, files.draftText), 'utf8')) + '\n')
  await assert.rejects(generateSpanishFoodLevel2Pack({
    root, output: 'artifacts/generated-originals/test', apiKey: 'fixture-secret', generate: () => assert.fail('No paid request')
  }), /authorization changed/)
})
test('no public output, escaping or dangling symlink can reach paid generation', async (t) => {
  const generate = () => assert.fail('No paid request')
  await assert.rejects(generateSpanishFoodLevel2Pack({
    output: 'public/audio', apiKey: 'fixture-secret', generate
  }), /Keep originals/)
  const outside = await mkdtemp(join(tmpdir(), 'spanish-food2-outside-'))
  const privateRoot = join(process.cwd(), 'artifacts/generated-originals')
  const link = join(privateRoot, `food2-symlink-${process.pid}`)
  await mkdir(privateRoot, { recursive: true })
  t.after(async () => {
    await rm(link, { force: true })
    await rm(outside, { recursive: true, force: true })
  })
  for (const target of [outside, join(outside, 'missing')]) {
    await symlink(target, link)
    await assert.rejects(generateSpanishFoodLevel2Pack({
      output: join(link, 'new'), apiKey: 'fixture-secret', generate
    }), /Keep originals/)
    await rm(link, { force: true })
  }
  assert.equal((await loadSpanishFoodLevel2Plan()).plan.items.length, 31)
})
test('changed selected artwork or reused audio cannot cross the provider boundary', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'food2-media-boundary-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const art = JSON.parse(await readFile('artifacts/spanish-food-2-art/manifest.json'))
  const reuse = JSON.parse(await readFile('content/spanish-food-2/audio-reuse.json'))
  const paths = new Set([
    ...Object.keys(art.inputHashes), ...art.images.filter(i => i.source === 'approved-reuse').map(i => i.path), ...reuse.sources.flatMap(s => [s.bank, s.activation, s.acceptance]), ...reuse.clips.map(c => c.path), ...Object.values(files)
  ])
  for (const p of paths) {
    await mkdir(dirname(join(root, p)), { recursive: true })
    await copyFile(p, join(root, p))
  }
  await cp('artifacts/spanish-food-2-art', join(root, 'artifacts/spanish-food-2-art'), { recursive: true })
  const target = art.images.find(i => i.source === 'generated').path
  const original = await readFile(join(root, target))
  await writeFile(join(root, target), 'changed selected artwork')
  const generate = () => assert.fail('No paid request may occur')
  await assert.rejects(generateSpanishFoodLevel2Pack({
    root, output: 'artifacts/generated-originals/test', apiKey: 'fixture-secret', generate
  }), /image bytes changed/)
  await writeFile(join(root, target), original)
  const clip = reuse.clips.find(c => c.id === 'es-419-travel-drinking-glass')
  await writeFile(join(root, clip.path), 'changed reused glass audio')
  await assert.rejects(generateSpanishFoodLevel2Pack({
    root, output: 'artifacts/generated-originals/test', apiKey: 'fixture-secret', generate
  }), /reused audio bytes changed/)
})

test('resumed child directories, dangling links and control/report links fail before generation or speech', async t => {
  const privateRoot = join(process.cwd(), 'artifacts/generated-originals')
  await mkdir(privateRoot, { recursive: true })
  const output = await mkdtemp(join(privateRoot, 'food2-resume-links-'))
  const outside = await mkdtemp(join(tmpdir(), 'food2-resume-public-'))
  const publicDirectory = join(outside, 'public')
  await mkdir(publicDirectory)
  const sentinel = join(publicDirectory, 'sentinel')
  const original = 'existing public bytes must stay unchanged'
  await writeFile(sentinel, original)
  t.after(async () => { await rm(output, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }) })
  let generateCalls = 0, balanceCalls = 0, speakCalls = 0
  const generate = async () => {
    generateCalls++
    balanceCalls++
    speakCalls++
    await writeFile(sentinel, 'a wrongly admitted generation boundary could overwrite public data')
    assert.fail('No injected provider boundary may run')
  }
  for (const [path, target] of [
    ['originals', publicDirectory],
    ['records', publicDirectory],
    ['pending', publicDirectory],
    ['originals/juan', join(outside, 'missing-directory')],
    ['originals/juan/es-419-food-grapes.mp3', sentinel],
    ['plan.json', sentinel],
    ['approval.json', sentinel],
    ['summary.json', join(outside, 'missing-report')],
    ['usage-before.json', sentinel],
    ['originals.jsonl', sentinel],
  ]) {
    const link = join(output, path)
    await mkdir(dirname(link), { recursive: true })
    await symlink(target, link)
    await assert.rejects(generateSpanishFoodLevel2Pack({ output, apiKey: 'fixture-secret', generate }), /output must not contain symlinks/)
    assert.equal(generateCalls, 0); assert.equal(balanceCalls, 0); assert.equal(speakCalls, 0)
    assert.equal(await readFile(sentinel, 'utf8'), original)
    await assert.rejects(readFile(join(outside, 'missing-report')), { code: 'ENOENT' })
    await rm(output, { recursive: true, force: true })
    await mkdir(output)
  }
  // Ordinary verified resume trees still reach the injected engine without provider calls.
  await mkdir(join(output, 'originals/juan'), { recursive: true })
  await writeFile(join(output, 'originals/juan/es-419-food-grapes.mp3'), 'regular original fixture')
  await writeFile(join(output, 'summary.json'), '{}')
  const result = await generateSpanishFoodLevel2Pack({
    output, apiKey: 'fixture-secret', generate: async options => {
      generateCalls++
      assert.equal(options.output, output)
      assert.equal(options.plan.expectedClips, 248)
      return 'safe injected resume'
    },
  })
  assert.equal(result, 'safe injected resume')
  assert.equal(generateCalls, 1); assert.equal(balanceCalls, 0); assert.equal(speakCalls, 0)
  assert.equal(await readFile(sentinel, 'utf8'), original)
})
