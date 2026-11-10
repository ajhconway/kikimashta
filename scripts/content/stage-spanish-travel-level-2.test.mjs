import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stageSpanishTravelLevel2 } from './stage-spanish-travel-level-2.mjs'

// This completed release is checked read-only in released-spanish-media.test.mjs.
// Keep the operational boundary: rerunning its tool cannot publish pending media.
test('spanish-travel-2 rejects pending acceptance before changing any existing output', async t => {
  const root = await mkdtemp(join(tmpdir(), 'spanish-acceptance-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'content/spanish-travel-2'), { recursive: true })
  const acceptance = JSON.parse(await readFile('content/spanish-travel-2/acceptance.json', 'utf8'))
  acceptance.status = 'pending'
  await writeFile(join(root, 'content/spanish-travel-2/acceptance.json'), JSON.stringify(acceptance))
  const output = join(root, 'content/es-419-travel-2.json')
  await writeFile(output, 'existing bank')
  await assert.rejects(stageSpanishTravelLevel2({ root }), /acceptance/i)
  assert.equal(await readFile(output, 'utf8'), 'existing bank')
  await assert.rejects(readFile(join(root, 'content/spanish-travel-2/activation.json')), { code: 'ENOENT' })
})
