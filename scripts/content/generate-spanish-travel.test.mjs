import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('./generate-spanish-travel.mjs', import.meta.url));
async function fixture(t, text = 'hotel') {
  const root = await mkdtemp(join(tmpdir(), 'spanish-generation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'content'));
  await writeFile(join(root, 'content/es-419.json'), JSON.stringify({ items: Array.from({ length: 6 }, (_, i) => ({ id: `word-${i}`, text })) }));
  return root;
}
function run(root, key) {
  const env = { ...process.env };
  delete env.ELEVENLABS_API_KEY;
  if (key) env.ELEVENLABS_API_KEY = key;
  return spawnSync(process.execPath, [script], { cwd: root, env, encoding: 'utf8' });
}
test('missing credentials stop before any generation artifact is created', async t => {
  const root = await fixture(t);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Load the configured ElevenLabs environment file/);
  await assert.rejects(access(join(root, 'artifacts')));
});
test('an oversized request cannot start generation even with a credential', async t => {
  const root = await fixture(t, 'verylongword');
  const result = run(root, 'unused-test-key');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exceeds six words \/ 40 characters/);
  await assert.rejects(access(join(root, 'artifacts')));
});
test('a previous or interrupted run is preserved and refuses further requests', async t => {
  const root = await fixture(t);
  const output = join(root, 'artifacts/audio/es-419-travel-1');
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'started.json'), 'preserve this run');
  const result = run(root, 'unused-test-key');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EEXIST/);
  assert.equal(await readFile(join(output, 'started.json'), 'utf8'), 'preserve this run');
  await assert.rejects(access(join(output, 'provenance.json')));
});
