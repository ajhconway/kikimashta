import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { packageNotices } from './package-notices.mjs'

const repository = 'https://github.com/ajhconway/kikimashta'
const revision = '0123456789abcdef0123456789abcdef01234567'
const credits = `<a data-source-link href="${repository}">Source code</a>\n<a href="${repository}">Repository</a>\n`
const dependencyLicenses = {
  react: 'MIT\r\nReact copyright notice.\r\n',
  'react-dom': 'MIT\nReact DOM copyright notice.\n',
  scheduler: 'MIT\nScheduler copyright notice.\n',
  'ts-fsrs': 'MIT\nFSRS copyright notice.\n',
  '@open-spaced-repetition/srs-kit': 'BSD-3-Clause\nSRS kit copyright notice.\n',
  idb: 'ISC License\nPermission from the idb author.\n',
  vite: '# Vite core license\nMIT terms.\n\n# Licenses of bundled dependencies\nComplete bundled dependency notices.\n',
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kikimashta-notices-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dist = join(root, 'build')
  await mkdir(dist)
  await mkdir(join(root, 'LICENSES'))
  await Promise.all([
    writeFile(join(root, 'LICENSE'), 'AGPL fixture\r\nFull license terms.\r\n'),
    writeFile(join(root, 'NOTICE'), 'Kikimashta\nCopyright © 2026 Alex Conway.\n'),
    writeFile(join(root, 'LICENSES', 'MIT.txt'), 'MIT fixture\nArtwork permissions.\n'),
    writeFile(join(dist, 'credits.html'), credits),
    ...Object.entries(dependencyLicenses).map(async ([name, license]) => {
      await mkdir(join(root, 'node_modules', name), { recursive: true })
      await writeFile(join(root, 'node_modules', name, name === 'vite' ? 'LICENSE.md' : 'LICENSE'), license)
    }),
  ])
  return { root, dist }
}

test('packages exact license copies and dependency texts, and pins the source link', async t => {
  const paths = await fixture(t)
  await packageNotices({ ...paths, revision })
  for (const [input, output] of [['LICENSE', 'license.txt'], ['NOTICE', 'notice.txt'], ['LICENSES/MIT.txt', 'licenses/MIT.txt']]) {
    assert.deepEqual(await readFile(join(paths.dist, output)), await readFile(join(paths.root, input)))
  }
  const thirdParty = await readFile(join(paths.dist, 'third-party-notices.txt'))
  for (const [name, license] of Object.entries(dependencyLicenses)) {
    const label = name === 'vite' ? 'vite (modulepreload polyfill)' : name
    assert.ok(thirdParty.includes(Buffer.from(`=== ${label} ===\n\n`)))
    assert.ok(thirdParty.includes(Buffer.from(license)), `${name} retains its complete license text`)
  }
  const result = await readFile(join(paths.dist, 'credits.html'), 'utf8')
  assert.ok(result.includes(`data-source-link href="${repository}/tree/${revision}"`))
  assert.ok(result.includes(`<a href="${repository}">Repository</a>`))
})

test('local builds without a revision retain the repository source URL', async t => {
  const paths = await fixture(t)
  const previous = process.env.SOURCE_REVISION
  delete process.env.SOURCE_REVISION
  try {
    await packageNotices(paths)
    assert.equal(await readFile(join(paths.dist, 'credits.html'), 'utf8'), credits)
  } finally {
    if (previous === undefined) delete process.env.SOURCE_REVISION
    else process.env.SOURCE_REVISION = previous
  }
})

test('an invalid source revision fails before modifying the build', async t => {
  const paths = await fixture(t)
  await assert.rejects(packageNotices({ ...paths, revision: 'main"><script>' }), /full 40-character Git commit SHA/)
  assert.equal(await readFile(join(paths.dist, 'credits.html'), 'utf8'), credits)
  await assert.rejects(readFile(join(paths.dist, 'license.txt')), { code: 'ENOENT' })
})

test('missing dependency licensing fails before writing partial notices', async t => {
  const paths = await fixture(t)
  await rm(join(paths.root, 'node_modules', 'idb', 'LICENSE'))
  await assert.rejects(packageNotices({ ...paths, revision }), { code: 'ENOENT' })
  assert.equal(await readFile(join(paths.dist, 'credits.html'), 'utf8'), credits)
  await assert.rejects(readFile(join(paths.dist, 'license.txt')), { code: 'ENOENT' })
})

test('a missing source anchor fails instead of publishing an unpinned source notice', async t => {
  const paths = await fixture(t)
  await writeFile(join(paths.dist, 'credits.html'), '<p>No source link</p>')
  await assert.rejects(packageNotices({ ...paths, revision }), /data-source-link/)
  await assert.rejects(readFile(join(paths.dist, 'license.txt')), { code: 'ENOENT' })
})

test('public CLI mode prepares local-dev notices without pinning an inherited revision', async t => {
  const paths = await fixture(t)
  const publicDir = join(paths.root, 'public')
  await mkdir(publicDir)
  await writeFile(join(publicDir, 'credits.html'), credits)
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./package-notices.mjs', import.meta.url)), '--public'], {
    cwd: paths.root, env: { ...process.env, SOURCE_REVISION: revision }, encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(await readFile(join(publicDir, 'license.txt')), await readFile(join(paths.root, 'LICENSE')))
  assert.equal(await readFile(join(publicDir, 'credits.html'), 'utf8'), credits)
  assert.equal(await readFile(join(paths.dist, 'credits.html'), 'utf8'), credits)
  await assert.rejects(readFile(join(paths.dist, 'license.txt')), { code: 'ENOENT' })
})
