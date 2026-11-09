/** Read accepted delivery bytes after redundant review copies have been removed. */
import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function reviewedAudio({ root, reviewPath, productionPath, sha256, size, message = 'Review recording hash mismatch.' }) {
  let bytes, path = reviewPath
  try { bytes = await readFile(join(root, reviewPath)) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    // Only the known public delivery may replace a missing archived copy.
    if (!/^public\/audio\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.mp3$/.test(productionPath)) throw new Error('Unsafe production audio path.', { cause: error })
    let component = root
    for (const part of productionPath.split('/')) {
      component = join(component, part)
      if ((await lstat(component)).isSymbolicLink()) throw new Error('Production audio fallback contains a symlink.', { cause: error })
    }
    bytes = await readFile(join(root, productionPath))
    path = productionPath
  }
  if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(message)
  return { bytes, path }
}
