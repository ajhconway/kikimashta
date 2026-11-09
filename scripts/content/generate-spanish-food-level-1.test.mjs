import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, mkdir, copyFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spanishFoodLevel1Plan, loadSpanishFoodLevel1Plan, generateSpanishFoodLevel1Pack } from './generate-spanish-food-level-1.mjs'
const files = {
  draftText: 'content/spanish-food-1/draft.json', artworkAcceptanceText: 'content/spanish-food-1/artwork-acceptance.json', registryText: 'content/es-419-voices.json', configText: 'content/spanish-food-1/audio-config.json', approvalText: 'content/spanish-food-1/audio-approval.json', reuseText: 'content/spanish-food-1/audio-reuse.json'
}
async function fixture() {
  return Object.fromEntries(await Promise.all(Object.entries(files).map(async ([k, p]) => [k, await readFile(p, 'utf8')])))
}
test('only twelve new food words are paid; exact source hashes and 96/608 limits are enforced', async () => {
  const f = await fixture()
  const p = spanishFoodLevel1Plan(f)
  assert.equal(p.expectedClips, 96)
  assert.equal(p.characters, 608)
  assert.equal(p.items.length, 12)
  assert.equal(p.items[0].text, 'papa')
  assert.equal(p.items.at(-1).text, 'té')
  assert(p.items.every(i => i.id.startsWith('es-419-food-')))
  for (const field of Object.keys(files).filter(k => k !== 'approvalText')) {
    const changed = structuredClone(f)
    changed[field] += '\n'
    assert.throws(() => spanishFoodLevel1Plan(changed))
  }
  for (const alter of [
    a => {
      a.items.push(a.items[0])
    }, a => {
      a.expectedClips = 288
    }, a => {
      a.characters++
    }, a => {
      a.budget = 1001
    }, a => {
      a.runtimeActivationAuthorized = true
    }
  ]) {
    const changed = structuredClone(f)
    const a = JSON.parse(changed.approvalText)
    alter(a)
    changed.approvalText = JSON.stringify(a)
    assert.throws(() => spanishFoodLevel1Plan(changed))
  }
})
test('invalid draft rejects before paid boundary or private output creation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spanish-food1-approval-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const p of Object.values(files)) {
    await mkdir(dirname(join(root, p)), { recursive: true })
    await copyFile(p, join(root, p))
  }
  await writeFile(join(root, files.draftText), (await readFile(join(root, files.draftText), 'utf8')) + '\n')
  await assert.rejects(generateSpanishFoodLevel1Pack({
    root, output: 'artifacts/generated-originals/test', apiKey: 'fixture-secret', generate: () => assert.fail('No paid request')
  }), /authorization changed/)
})
test('no public output, escaping or dangling symlink can reach paid generation', async (t) => {
  const generate = () => assert.fail('No paid request')
  await assert.rejects(generateSpanishFoodLevel1Pack({
    output: 'public/audio', apiKey: 'fixture-secret', generate
  }), /Keep originals/)
  const outside = await mkdtemp(join(tmpdir(), 'spanish-food1-outside-'))
  const privateRoot = join(process.cwd(), 'artifacts/generated-originals')
  const link = join(privateRoot, `food1-symlink-${process.pid}`)
  await mkdir(privateRoot, { recursive: true })
  t.after(async () => {
    await rm(link, { force: true })
    await rm(outside, { recursive: true, force: true })
  })
  for (const target of [outside, join(outside, 'missing')]) {
    await symlink(target, link)
    await assert.rejects(generateSpanishFoodLevel1Pack({
      output: join(link, 'new'), apiKey: 'fixture-secret', generate
    }), /Keep originals/)
    await rm(link, { force: true })
  }
  assert.equal((await loadSpanishFoodLevel1Plan()).plan.items.length, 12)
})
