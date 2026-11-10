/** Snapshot final emitted bytes after HTML and legal notices have been written (#223). */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function offlineManifest(directory, version) {
  const sizes = {};
  const hashes = {};
  const shell = [];
  const walk = async (dir, prefix = '') => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (entry.isDirectory()) { await walk(join(dir, entry.name), path + '/'); continue; }
      if (['offline-manifest.json', 'offline-worker.js', 'offline-version.json'].includes(path)) continue;
      const body = await readFile(join(dir, entry.name));
      sizes[path] = body.byteLength;
      hashes[path] = createHash('sha256').update(body).digest('hex');
      if (/^(assets\/|brand\/|fonts\/|media\/badges\/|licenses\/|vocabulary\/.*\.(css|json)$)/.test(path)
        || ['index.html', 'vocabulary/index.html', 'credits.html', 'license.txt', 'notice.txt', 'third-party-notices.txt'].includes(path)) shell.push(path);
    }
  };
  await walk(directory);
  return { version, shell: shell.sort(), sizes, hashes };
}

export async function finalizeOffline(root = process.cwd()) {
  const dist = join(root, 'dist');
  const { version } = JSON.parse(await readFile(join(dist, 'offline-version.json'), 'utf8'));
  const manifest = await offlineManifest(dist, version);
  if (!manifest.shell.includes('index.html') || !manifest.shell.includes('vocabulary/index.html')) throw new Error('Offline app HTML is missing.');
  const template = await readFile(join(root, 'scripts/offline-worker.mjs'), 'utf8');
  await writeFile(join(dist, 'offline-manifest.json'), JSON.stringify(manifest));
  await writeFile(join(dist, 'offline-worker.js'), template.replace('__OFFLINE_MANIFEST__', JSON.stringify(manifest)));
  await unlink(join(dist, 'offline-version.json'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  finalizeOffline().catch(error => { console.error(error.message); process.exitCode = 1; });
}
