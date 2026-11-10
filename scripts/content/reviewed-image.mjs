/** Resolve consolidated artwork without changing the hash-bound approval records (#195). */
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const sourcePath = /^artifacts\/(?:spanish-travel(?:-[23])?-art\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:png|jpg)|card-regeneration\/batch-\d{2}\/[a-zA-Z0-9_.-]+\.png|visual-reference-art-213\/ja-v-[a-f0-9]+-v[1-9][0-9]*\.png|picture-art-229\/ja-v-[a-f0-9]+-(?:v[1-9][0-9]*|reuse)\.png|scene-art-233\/(?:ja-v-[a-f0-9]+-(?:family-)?v[1-9][0-9]*|179-puppy-v2|184-few-v2)\.png)$/
const canonicalPath = /^(?:public\/images\/approved\/[a-z0-9-]+\.(?:png|jpg)|artifacts\/card-regeneration\/batch-\d{2}\/[a-zA-Z0-9_.-]+\.png)$/
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

function readWithoutSymlinks(root, path) {
  let current = root
  for (const part of path.split('/')) {
    current = join(current, part)
    if (lstatSync(current).isSymbolicLink()) throw new Error('Artwork source contains a symlink.')
  }
  return readFileSync(join(root, path))
}

export function reviewedImage({ root, reviewPath, productionPath, sha256, size, message = 'Artwork source hash or size mismatch.' }) {
  if (!sourcePath.test(reviewPath) && !canonicalPath.test(reviewPath)) throw new Error('Unsafe artwork source path.')
  let bytes, path = reviewPath
  try { bytes = readWithoutSymlinks(root, path) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    const registry = JSON.parse(readFileSync(join(root, 'artifacts/artwork-aliases.json'), 'utf8'))
    const alias = registry.aliases?.[reviewPath]
    if (registry.version !== 1 || !alias || !canonicalPath.test(alias.path) ||
        !/^[a-f0-9]{64}$/.test(alias.sha256) || !Number.isSafeInteger(alias.bytes) || alias.bytes <= 0 ||
        (sha256 !== undefined && sha256 !== alias.sha256) || (size !== undefined && size !== alias.bytes) ||
        (productionPath !== undefined && productionPath !== alias.path)) throw new Error('Unverified artwork alias.', { cause: error })
    path = alias.path
    bytes = readWithoutSymlinks(root, path)
    sha256 = alias.sha256
    size = alias.bytes
  }
  if ((size !== undefined && bytes.length !== size) || (sha256 !== undefined && hash(bytes) !== sha256)) throw new Error(message)
  return { bytes, path }
}
