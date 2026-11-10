import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, copyFile, mkdir, mkdtemp, rm, symlink, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { stageSpanishTravelLevel5 } from './stage-spanish-travel-level-5.mjs'

const DATA = 'content/spanish-travel-5'
const REVIEW = 'artifacts/spanish-travel-5-audio-review'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const absent = path => assert.rejects(stat(path), { code: 'ENOENT' })

async function fixture(t, media = false) {
  const root = await mkdtemp(join(tmpdir(), 'kikimashta-travel5-staging-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const acceptance = await json(DATA + '/acceptance.json')
  const reviewed = media ? await json(acceptance.mediaManifest) : undefined
  const paths = media ? new Set([DATA + '/acceptance.json', ...Object.keys(acceptance.inputs),
    ...reviewed.images.map(image => image.path), ...reviewed.clips.map(clip => REVIEW + '/' + clip.file)]) : [DATA + '/acceptance.json']
  for (const path of paths) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await copyFile(path, join(root, path))
  }
  return { root, acceptance, reviewed }
}

// Current release IDs, exact accepted media and preserved revision bytes belong
// to released-spanish-media.test.mjs; do not restage this completed release here.
test('Travel5 rejects pending acceptance before changing an existing bank', async t => {
  const { root, acceptance } = await fixture(t)
  const bank = join(root, 'content/es-419-travel-5.json')
  await writeFile(bank, 'existing bank')
  await writeFile(join(root, DATA, 'acceptance.json'), JSON.stringify({ ...acceptance, status: 'pending' }))
  await assert.rejects(stageSpanishTravelLevel5({ root }), /Exact final Travel level 5 owner acceptance/)
  assert.equal(await readFile(bank, 'utf8'), 'existing bank')
  await absent(join(root, DATA, 'activation.json'))
})

test('Travel5 requires explicit boolean activation authorization before any output', async t => {
  const { root, acceptance } = await fixture(t)
  await writeFile(join(root, DATA, 'acceptance.json'), JSON.stringify({ ...acceptance, runtimeActivationAuthorized: 'true' }))
  await assert.rejects(stageSpanishTravelLevel5({ root }), /Exact final Travel level 5 owner acceptance/)
  await absent(join(root, 'content/es-419-travel-5.json'))
  await absent(join(root, DATA, 'activation.json'))
})

test('a link at the final Travel5 destination prevents every earlier media and bank write', async t => {
  const { root, reviewed } = await fixture(t, true)
  const target = join(root, 'unrelated.json')
  await writeFile(target, 'unrelated bytes')
  await symlink(target, join(root, DATA, 'activation.json'))
  await assert.rejects(stageSpanishTravelLevel5({ root }), /staging paths cannot contain symlinks/)
  const firstImage = reviewed.images.find(image => image.source === 'generated')
  await absent(join(root, `public/images/approved/${firstImage.id}-${firstImage.sha256.slice(0, 12)}.png`))
  await absent(join(root, 'public/audio/es-419-travel-5'))
  await absent(join(root, 'content/es-419-travel-5.json'))
  assert.equal(await readFile(target, 'utf8'), 'unrelated bytes')
})
