import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadElevenLabsKey } from './elevenlabs-key.mjs'

function fixture(t, text) {
  const homeDir = mkdtempSync(join(tmpdir(), 'elevenlabs-key-'))
  t.after(() => rmSync(homeDir, { recursive: true, force: true }))
  const file = join(homeDir, '.config/kikimashta/elevenlabs.env')
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, text, { mode: 0o600 })
  return { homeDir, file }
}

test('an explicitly provided process key takes precedence without requiring a local file', () => {
  const env = { ELEVENLABS_API_KEY: '  fixture-process-key  ' }
  assert.equal(loadElevenLabsKey({ env, homeDir: '/unused' }), 'fixture-process-key')
  assert.deepEqual(env, { ELEVENLABS_API_KEY: '  fixture-process-key  ' })
})

test('loads one key from the stable private file across worktrees without exporting other variables', t => {
  const { homeDir } = fixture(t, '# Local only\nELEVENLABS_API_KEY="fixture-file-key"\nOTHER_VALUE=not-exported\n')
  const env = {}
  assert.equal(loadElevenLabsKey({ env, homeDir }), 'fixture-file-key')
  assert.deepEqual(env, {})
})

test('rejects broadly readable credentials before reading their contents', { skip: process.platform === 'win32' }, t => {
  const { homeDir, file } = fixture(t, 'ELEVENLABS_API_KEY=fixture-private-key\n')
  chmodSync(file, 0o644)
  assert.throws(() => loadElevenLabsKey({ env: {}, homeDir }), error => {
    assert.match(error.message, /chmod 600/)
    assert.doesNotMatch(error.message, /fixture-private-key/)
    return true
  })
})

test('missing and malformed files give useful errors without including their content', t => {
  const { homeDir, file } = fixture(t, 'OTHER_VALUE=fixture-private-value\n')
  assert.throws(() => loadElevenLabsKey({ env: {}, homeDir }), error => {
    assert.match(error.message, /nonempty ELEVENLABS_API_KEY/)
    assert.doesNotMatch(error.message, /fixture-private-value/)
    return true
  })
  rmSync(file)
  assert.throws(() => loadElevenLabsKey({ env: {}, homeDir }), /Set ELEVENLABS_API_KEY/)
})
