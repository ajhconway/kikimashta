import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { loadShortContextAudition, SHORT_CONTEXT_SOURCE, SHORT_CONTEXT_APPROVAL } from './short-context-audio-plan.mjs'
import { generateContextualAudition } from './generate-contextual-audition.mjs'
import { projectRoot } from './validate-contextual.mjs'

test('short demo uses the two approved contextual voices and omits four nonexistent questions', () => {
  const { plan } = loadShortContextAudition(projectRoot)
  assert.deepEqual(plan.generation.voices.map(v => v.voice), ['otani', 'morioki'])
  assert.equal(plan.contexts.length, 10)
  assert.equal(plan.contexts.filter(c => !c.questions.length).length, 4)
  assert.equal(plan.generation.expectedClips, 32)
  assert.equal(plan.generation.characters, 310)
  assert.equal(plan.generation.items.find(i => i.id === 'ja-short-demo-otona-sentence').text, '大人が二人います。')
})

test('edited demo text stops before output, credentials or paid generation', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'short-context-approval-'))
  try {
    for (const path of [SHORT_CONTEXT_SOURCE, SHORT_CONTEXT_APPROVAL, 'content/elevenlabs-voices.json']) {
      await mkdir(dirname(resolve(root, path)), { recursive: true })
      await copyFile(resolve(projectRoot, path), resolve(root, path))
    }
    const path = resolve(root, SHORT_CONTEXT_SOURCE)
    const drafts = JSON.parse(await readFile(path, 'utf8'))
    drafts[0].sentence = '変更された文。'
    await writeFile(path, JSON.stringify(drafts))
    let called = false
    await assert.rejects(generateContextualAudition({ root, batch: 'short-demo-250',
      output: 'artifacts/generated-originals/no-output', generate: () => { called = true } }), /text approval/)
    assert.equal(called, false)
    await assert.rejects(access(resolve(root, 'artifacts')), { code: 'ENOENT' })
  } finally { await rm(root, { recursive: true, force: true }) }
})
