/** Bounded read-only publication smoke. User journeys belong to the merge gate. */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export async function deploymentSmoke({ baseURL, revision, dist = 'dist', request = fetch }) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Expected a full source revision.')
  const base = new URL(baseURL)
  const localPreview = base.protocol === 'http:' && base.hostname === '127.0.0.1'
  // Pages can report an HTTP custom-domain URL even when HTTPS is available.
  if (base.protocol === 'http:' && !localPreview) base.protocol = 'https:'
  if (base.protocol !== 'https:' && !localPreview) throw new Error('Expected an HTTPS publication URL.')
  if (!base.pathname.endsWith('/')) base.pathname += '/'
  const read = path => readFile(join(dist, path))
  const manifest = JSON.parse(await read('offline-manifest.json'))
  const credits = (await read('credits.html')).toString()
  if (!credits.includes('data-source-link href="https://github.com/ajhconway/kikimashta/tree/' + revision + '"')) {
    throw new Error('Build source notice does not match the expected revision.')
  }
  const paths = new Set(['index.html', 'vocabulary/index.html', 'credits.html', 'offline-manifest.json', 'offline-worker.js'])
  for (const html of ['index.html', 'vocabulary/index.html']) {
    const script = (await read(html)).toString().match(/<script\b[^>]*\bsrc="([^"]+)"/)?.[1]
    if (!script) throw new Error('Missing built entry script: ' + html)
    const url = new URL(script, new URL(html, base))
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new Error('Unexpected entry script origin.')
    paths.add(url.pathname.slice(base.pathname.length))
  }
  for (const prefix of ['images/', 'audio/']) {
    const path = Object.keys(manifest.hashes).sort().find(path => path.startsWith(prefix))
    if (!path) throw new Error('Missing representative ' + prefix + ' delivery.')
    paths.add(path)
  }
  // At most nine small requests, one deadline each; no account or storage writes.
  await Promise.all([...paths].map(async path => {
    const route = path === 'index.html' ? './' : path === 'vocabulary/index.html' ? 'vocabulary/' : path
    const url = new URL(route, base)
    url.searchParams.set('revision', revision)
    const response = await request(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error('Publication returned HTTP ' + response.status + ': ' + path)
    const actual = Buffer.from(await response.arrayBuffer())
    const expected = manifest.hashes[path] ?? sha256(await read(path))
    if (sha256(actual) !== expected) throw new Error('Publication bytes differ: ' + path)
  }))
  return paths.size
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  deploymentSmoke({ baseURL: process.env.PUBLICATION_URL, revision: process.env.SOURCE_REVISION })
    .then(count => console.log('Published revision and ' + count + ' representative resources verified.'))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
