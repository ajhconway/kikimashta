/** Compose a reviewed /offline-demo/ build without replacing the root release (#234). */
import { createHash } from 'node:crypto';
import { cp, lstat, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (parent, child) => child === parent || child.startsWith(parent + sep);

async function snapshot(directory, excludeDemo = false, prefix = '') {
  const files = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!prefix && excludeDemo && entry.name === 'offline-demo') continue;
    const path = prefix + entry.name;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(files, await snapshot(absolute, false, path + '/'));
    else if (entry.isFile()) files[path] = digest(await readFile(absolute));
    else throw new Error('Publication output contains a symlink or special file: ' + path);
  }
  return Object.fromEntries(Object.entries(files).sort());
}
function safeAsset(path) {
  return typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !path.includes('\\') &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}

export async function composeOfflineDemo(productionDirectory, demoDirectory, revision) {
  if (!/^[a-f0-9]{40}$/i.test(revision ?? '')) throw new Error('Pin a full reviewed offline demo source revision.');
  const production = await realpath(productionDirectory);
  const demo = await realpath(demoDirectory);
  if (inside(production, demo) || inside(demo, production)) throw new Error('Production and demo builds must be separate directories.');
  const destination = join(production, 'offline-demo');
  if (await lstat(destination).catch(error => { if (error.code !== 'ENOENT') throw error; })) throw new Error('Root build already owns /offline-demo/.');
  const before = await snapshot(production);
  if (!before['index.html']) throw new Error('Root app HTML is missing.');
  const demoFiles = await snapshot(demo);
  for (const file of ['index.html', 'vocabulary/index.html', 'offline-worker.js', 'offline-manifest.json', 'credits.html']) {
    if (!demoFiles[file]) throw new Error('Demo build is incomplete: ' + file);
  }
  if (demoFiles['offline-demo-release.json']) throw new Error('Demo build already contains generated release metadata.');
  const manifest = JSON.parse(await readFile(join(demo, 'offline-manifest.json'), 'utf8'));
  if (typeof manifest.version !== 'string' || !manifest.version || !manifest.hashes || typeof manifest.hashes !== 'object' || Array.isArray(manifest.hashes) || !Array.isArray(manifest.shell) || !manifest.shell.includes('index.html') || !manifest.shell.includes('vocabulary/index.html')) {
    throw new Error('Demo offline shell manifest is incomplete.');
  }
  for (const [path, hash] of Object.entries(manifest.hashes)) {
    if (!safeAsset(path) || demoFiles[path] !== hash) throw new Error('Demo asset differs from its offline manifest: ' + path);
  }
  if (manifest.shell.some(path => !safeAsset(path) || !manifest.hashes[path])) throw new Error('Demo offline shell contains an unknown asset.');
  for (const page of ['index.html', 'vocabulary/index.html']) {
    const html = await readFile(join(demo, page), 'utf8');
    if (!html.includes('/offline-demo/assets/') || /(?:src|href)=["']\/(?!offline-demo\/)/.test(html)) {
      throw new Error('Demo app must be built for /offline-demo/: ' + page);
    }
  }
  const credits = await readFile(join(demo, 'credits.html'), 'utf8');
  if (!credits.includes('/tree/' + revision)) throw new Error('Demo source notice does not identify the pinned revision.');
  const stage = await mkdtemp(join(production, '.offline-demo-'));
  let installed = false;
  try {
    await cp(demo, stage, { recursive: true, force: false });
    if (!isDeepStrictEqual(demoFiles, await snapshot(stage))) throw new Error('Demo files changed during composition.');
    await writeFile(join(stage, 'offline-demo-release.json'), JSON.stringify({ sourceRevision: revision,
      basePath: '/offline-demo/', storageNamespace: 'offline-demo' }, null, 2) + '\n');
    await rename(stage, destination); installed = true;
    if (!isDeepStrictEqual(before, await snapshot(production, true))) throw new Error('Root publication files changed during demo composition.');
  } catch (error) {
    await rm(installed ? destination : stage, { recursive: true, force: true });
    throw error;
  }
  return { sourceRevision: revision, rootFilesPreserved: Object.keys(before).length, demoFiles: Object.keys(demoFiles).length,
    path: '/offline-demo/' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , root, demo, revision] = process.argv;
  if (!root || !demo || !revision) { console.error('Usage: offline-demo-release.mjs <root build> <demo build> <source revision>'); process.exitCode = 1; }
  else composeOfflineDemo(root, demo, revision).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
