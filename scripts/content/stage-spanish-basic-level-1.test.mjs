import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stageSpanishBasicLevel1 } from './stage-spanish-basic-level-1.mjs'

// This completed release is checked read-only in released-spanish-media.test.mjs.
// Keep the operational boundary: rerunning its tool cannot publish pending media.
test('spanish-basic-1 rejects pending acceptance before changing any existing output', async t => {
  const root = await mkdtemp(join(tmpdir(), 'spanish-acceptance-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'content/spanish-basic-1'), { recursive: true })
  const acceptance = JSON.parse(await readFile('content/spanish-basic-1/acceptance.json', 'utf8'))
  acceptance.status = 'pending'
  await writeFile(join(root, 'content/spanish-basic-1/acceptance.json'), JSON.stringify(acceptance))
  const output = join(root, 'content/es-419-basic-1.json')
  await writeFile(output, 'existing bank')
  await assert.rejects(stageSpanishBasicLevel1({ root }), /acceptance/i)
  assert.equal(await readFile(output, 'utf8'), 'existing bank')
  await assert.rejects(readFile(join(root, 'content/spanish-basic-1/activation.json')), { code: 'ENOENT' })
})
