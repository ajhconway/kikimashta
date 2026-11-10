import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { loadEnv, type Plugin } from 'vite'

export function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)]).sort()
}

/** Pin the loaded app, media bytes and worker together before Vite substitutes the version. */
export function offlineBuild(root = process.cwd()): Plugin {
  const publicFiles = filesUnder(join(root, 'public'))
  const inputFiles = [...publicFiles, ...['src', 'vocabulary', 'content'].flatMap(dir => filesUnder(join(root, dir))),
    ...['index.html', 'package-lock.json', 'vite.config.ts', 'scripts/offline-build.ts', 'scripts/offline-worker.mjs', 'scripts/offline-finalize.mjs', 'scripts/package-notices.mjs'].map(file => join(root, file))]
    .filter(file => !/\.test\./.test(file)).sort()
  const versionHash = createHash('sha256').update(process.env.SOURCE_REVISION ?? '')
  for (const file of inputFiles) versionHash.update(relative(root, file)).update(readFileSync(file))
  let version = ''
  return {
    name: 'offline-practice', apply: 'build', enforce: 'post',
    config: (_config, { mode }) => {
      // Build configuration changes emitted JS even when content is unchanged.
      const environment = loadEnv(mode, root, 'VITE_')
      versionHash.update(mode).update(JSON.stringify(Object.entries(environment).sort()))
      version = versionHash.digest('hex').slice(0, 24)
      return { define: { __OFFLINE_VERSION__: JSON.stringify(version) } }
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'offline-version.json', source: JSON.stringify({ version }) })
    },
  }
}
