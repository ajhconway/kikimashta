import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { composeOfflineDemo } from './offline-demo-release.mjs';

const revision = 'a'.repeat(40);
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'offline-demo-release-'));
  const root = join(directory, 'root'), demo = join(directory, 'demo');
  await mkdir(root); await mkdir(demo);
  const put = async (parent, path, body) => { await mkdir(join(parent, path, '..'), { recursive: true }); await writeFile(join(parent, path), body); };
  for (const [path, body] of Object.entries({ 'index.html': '<html>Root release</html>', 'CNAME': 'kikimashta.com',
    'assets/app.js': 'root()', 'credits.html': 'Root source stays independent' })) await put(root, path, body);
  const files = { 'index.html': '<script src="/offline-demo/assets/app.js"></script>',
    'vocabulary/index.html': '<script src="/offline-demo/assets/app.js"></script>', 'assets/app.js': 'demo()', 'audio/word.mp3': 'audio bytes',
    'credits.html': 'https://github.com/ajhconway/kikimashta/tree/' + revision, 'CNAME': 'must-not-replace-root.example' };
  for (const [path, body] of Object.entries(files)) await put(demo, path, body);
  const manifest = { version: 'demo-v1', shell: ['index.html', 'vocabulary/index.html', 'assets/app.js'],
    hashes: Object.fromEntries(Object.entries(files).map(([path, body]) => [path, createHash('sha256').update(body).digest('hex')])) };
  await put(demo, 'offline-manifest.json', JSON.stringify(manifest));
  await put(demo, 'offline-worker.js', 'worker()');
  return { root, demo, directory, manifest, put, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('composition nests the complete demo and preserves every production file including CNAME and source notice', async () => {
  const f = await fixture();
  try {
    const result = await composeOfflineDemo(f.root, f.demo, revision);
    assert.equal(result.rootFilesPreserved, 4);
    assert.equal(await readFile(join(f.root, 'CNAME'), 'utf8'), 'kikimashta.com');
    assert.equal(await readFile(join(f.root, 'credits.html'), 'utf8'), 'Root source stays independent');
    assert.equal(await readFile(join(f.root, 'assets/app.js'), 'utf8'), 'root()');
    assert.equal(await readFile(join(f.root, 'offline-demo/audio/word.mp3'), 'utf8'), 'audio bytes');
    assert.equal(await readFile(join(f.root, 'offline-demo/CNAME'), 'utf8'), 'must-not-replace-root.example');
    assert.deepEqual(JSON.parse(await readFile(join(f.root, 'offline-demo/offline-demo-release.json'), 'utf8')),
      { sourceRevision: revision, basePath: '/offline-demo/', storageNamespace: 'offline-demo' });
  } finally { await f.cleanup(); }
});

test('changed or missing download dependencies fail before adding any demo directory', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.demo, 'audio/word.mp3'), 'changed bytes');
    await assert.rejects(composeOfflineDemo(f.root, f.demo, revision), /differs from its offline manifest/);
    assert.deepEqual((await readdir(f.root)).sort(), ['CNAME', 'assets', 'credits.html', 'index.html']);
    await rm(join(f.demo, 'audio/word.mp3'));
    await assert.rejects(composeOfflineDemo(f.root, f.demo, revision), /differs from its offline manifest/);
  } finally { await f.cleanup(); }
});

test('rejects an unpinned build, a root-base demo and a mismatched source notice', async () => {
  const f = await fixture();
  try {
    await assert.rejects(composeOfflineDemo(f.root, f.demo, 'TO_BE_PINNED'), /full reviewed/);
    await assert.rejects(composeOfflineDemo(f.root, f.demo, 'b'.repeat(40)), /source notice/);
    const html = '<script src="/assets/app.js"></script>';
    await writeFile(join(f.demo, 'index.html'), html);
    f.manifest.hashes['index.html'] = createHash('sha256').update(html).digest('hex');
    await writeFile(join(f.demo, 'offline-manifest.json'), JSON.stringify(f.manifest));
    await assert.rejects(composeOfflineDemo(f.root, f.demo, revision), /built for \/offline-demo\//);
  } finally { await f.cleanup(); }
});

test('does not follow symlinks, permit manifest traversal or overwrite an existing root route', async () => {
  const f = await fixture();
  try {
    await symlink(join(f.root, 'index.html'), join(f.demo, 'linked.html'));
    await assert.rejects(composeOfflineDemo(f.root, f.demo, revision), /symlink/);
    await rm(join(f.demo, 'linked.html'));
    f.manifest.hashes['../index.html'] = 'a'.repeat(64);
    await writeFile(join(f.demo, 'offline-manifest.json'), JSON.stringify(f.manifest));
    await assert.rejects(composeOfflineDemo(f.root, f.demo, revision), /differs from its offline manifest/);
    await mkdir(join(f.root, 'offline-demo'));
    await writeFile(join(f.root, 'offline-demo/owned.txt'), 'existing root content');
    await assert.rejects(composeOfflineDemo(f.root, f.demo, revision), /already owns/);
    assert.equal(await readFile(join(f.root, 'offline-demo/owned.txt'), 'utf8'), 'existing root content');
  } finally { await f.cleanup(); }
});

test('publication retries use the successful demo job artifact instead of inventing the new attempt name', async () => {
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /OFFLINE_DEMO_REVISION: [a-f0-9]{40}\b/);
  assert.match(workflow, /needs: demo-build/);
  assert.match(workflow, /name: \$\{\{ needs\.demo-build\.outputs\.artifact_name \}\}/);
  assert.match(workflow, /artifact_name: \$\{\{ steps\.demo-artifact-name\.outputs\.name \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /VITE_BASE_PATH: \/offline-demo\//);
  assert.match(workflow, /VITE_STORAGE_NAMESPACE: offline-demo/);
  assert.match(workflow, /PAGES_ARTIFACT_NAME: github-pages-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
});
