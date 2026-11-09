import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { ContextualBank } from '../../src/content/contextual-types'
import { contextualMediaPath } from '../../src/content/contextual'
import { loadPack1Content, type Pack1Acceptance, type Pack1GeneratedMedia, type Pack1TextApproval } from '../../src/content/contextual-pack1'

/** Production builds verify the same identities as runtime and the delivered bytes themselves. */
export function verifyPack1Build(root: URL) {
  const bytes = (path: string) => readFileSync(new URL(path, root))
  const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
  const read = <T>(path: string): T => JSON.parse(bytes(path).toString())
  const sourcePath = 'content/contextual/ja-wanikani-1-draft.json'
  const approvalPath = 'content/contextual/pack-1/text-approval.json'
  const generatedPath = 'content/contextual/pack-1/generated-media.json'
  const acceptancePath = 'content/contextual/pack-1/acceptance.json'
  const generated = existsSync(new URL(generatedPath, root)) ? read<Pack1GeneratedMedia>(generatedPath) : undefined
  const acceptance = existsSync(new URL(acceptancePath, root)) ? read<Pack1Acceptance>(acceptancePath) : undefined
  const digests = { source: hash(bytes(sourcePath)), textApproval: hash(bytes(approvalPath)),
    generatedMedia: generated ? hash(bytes(generatedPath)) : '' }
  loadPack1Content({ bank: read<ContextualBank>(sourcePath), approval: read<Pack1TextApproval>(approvalPath), generated, acceptance, digests })
  for (const entry of generated?.contexts ?? []) for (const recording of entry.recordings) {
    for (const [path, expected] of Object.entries(recording.hashes)) {
      const safePath = contextualMediaPath(path, 'audio')
      if (hash(bytes('public/' + safePath)) !== expected) throw new Error('Pack 1 delivery differs from its reviewed hash: ' + safePath)
    }
  }
  return digests
}
