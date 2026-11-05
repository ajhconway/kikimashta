/** Package the deployed licensing and source notices for issue #23. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repository = 'https://github.com/ajhconway/kikimashta'
const sourceMarker = `data-source-link href="${repository}"`
const runtimePackages = ['react', 'react-dom', 'scheduler', 'idb']

export async function packageNotices({
  root = process.cwd(), dist = join(root, 'dist'), revision = process.env.SOURCE_REVISION,
} = {}) {
  if (revision !== undefined && (typeof revision !== 'string' || !/^[a-f0-9]{40}$/i.test(revision))) {
    throw new Error('SOURCE_REVISION must be a full 40-character Git commit SHA.')
  }

  // Read every required input before changing the build output.
  const [license, notice, mit, credits, dependencies] = await Promise.all([
    readFile(join(root, 'LICENSE')),
    readFile(join(root, 'NOTICE')),
    readFile(join(root, 'LICENSES', 'MIT.txt')),
    readFile(join(dist, 'credits.html'), 'utf8'),
    Promise.all(runtimePackages.map(async name => ({
      name, license: await readFile(join(root, 'node_modules', name, 'LICENSE')),
    }))),
  ])
  if (credits.split(sourceMarker).length !== 2) {
    throw new Error('credits.html must contain exactly one data-source-link repository anchor.')
  }
  const sourceUrl = revision ? `${repository}/tree/${revision}` : repository
  const pinnedCredits = credits.replace(sourceMarker, `data-source-link href="${sourceUrl}"`)
  const thirdParty = Buffer.concat(dependencies.flatMap(({ name, license }) => [
    Buffer.from(`=== ${name} ===\n\n`), license, Buffer.from('\n\n'),
  ]))

  await mkdir(join(dist, 'licenses'), { recursive: true })
  await Promise.all([
    writeFile(join(dist, 'license.txt'), license),
    writeFile(join(dist, 'notice.txt'), notice),
    writeFile(join(dist, 'licenses', 'MIT.txt'), mit),
    writeFile(join(dist, 'third-party-notices.txt'), thirdParty),
    writeFile(join(dist, 'credits.html'), pinnedCredits),
  ])
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  packageNotices().catch(error => { console.error(error.message); process.exitCode = 1 })
}
