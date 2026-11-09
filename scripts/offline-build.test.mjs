import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { offlineManifest } from './offline-finalize.mjs';

test('final manifest pins HTML, emitted chunks, writing fonts, mascot/badges and notices without downloading all recordings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'offline-manifest-'));
  try {
    const files = ['index.html', 'vocabulary/index.html', 'assets/app.js', 'assets/app.css', 'fonts/jp.ttf', 'brand/pace/cat.png', 'media/badges/new.webp', 'audio/a.mp3', 'images/word.png', 'credits.html', 'license.txt', 'offline-worker.js', 'offline-version.json'];
    for (const path of files) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), path + '-bytes');
    }
    const result = await offlineManifest(root, 'v1');
    for (const path of files.slice(0, 7)) assert.ok(result.shell.includes(path), path);
    assert.ok(result.shell.includes('credits.html'));
    assert.ok(result.shell.includes('license.txt'));
    assert.ok(!result.shell.includes('audio/a.mp3'));
    assert.ok(!result.shell.includes('images/word.png'));
    assert.ok(!('offline-worker.js' in result.hashes));
    assert.ok(!('offline-version.json' in result.hashes));
    assert.equal(result.hashes['index.html'], createHash('sha256').update('index.html-bytes').digest('hex'));
    assert.equal(result.sizes['audio/a.mp3'], Buffer.byteLength('audio/a.mp3-bytes'));
    await writeFile(join(root, 'index.html'), 'finalized HTML');
    assert.notEqual((await offlineManifest(root, 'v1')).hashes['index.html'], result.hashes['index.html']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
