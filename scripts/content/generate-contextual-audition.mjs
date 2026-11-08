/** Bounded, text-approved contextual speech audition for #124. Never publishes media. */
import { createHash } from 'node:crypto'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadContextualAudition } from './contextual-audio-plan.mjs'
import { generateCards } from './generate-elevenlabs-cards.mjs'
import { projectRoot } from './validate-contextual.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')

async function readOptional(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}

async function outputPath(root, output) {
  if (typeof output !== 'string' || !output.trim()) throw new Error('Choose --output under artifacts/generated-originals/.')
  const destination = resolve(root, output)
  const within = relative(resolve(root, 'artifacts/generated-originals'), destination)
  if (!within || within === '..' || within.startsWith('../') || isAbsolute(within)) {
    throw new Error('Audition originals must stay under artifacts/generated-originals/.')
  }
  let ancestor = destination
  for (;;) {
    try {
      const actual = resolve(await realpath(ancestor), relative(ancestor, destination))
      const fromOriginals = relative(resolve(await realpath(root), 'artifacts/generated-originals'), actual)
      if (!fromOriginals || fromOriginals === '..' || fromOriginals.startsWith('../') || isAbsolute(fromOriginals)) {
        throw new Error('Audition originals must stay under artifacts/generated-originals/.')
      }
      return actual
    } catch (error) {
      if (error.code !== 'ENOENT' || ancestor === dirname(ancestor)) throw error
      ancestor = dirname(ancestor)
    }
  }
}

export function contextualAuditionSummary(plan) {
  return { contexts: plan.contexts.length, voices: plan.generation.voices.map(voice => voice.name),
    requests: plan.generation.expectedClips, characters: plan.generation.characters,
    budget: plan.generation.characters, pairs: plan.contexts.reduce((count, context) => count + context.questions.length, 0) * plan.generation.voices.length,
    gapMs: plan.gapMs, textApprovalSha256: plan.approval.textSha256 }
}

async function preserveAuditionPlan(output, plan) {
  const snapshot = await readOptional(join(output, 'plan.json'))
  if (snapshot === undefined) return
  if (snapshot.identity !== hash(JSON.stringify(plan.generation))) {
    throw new Error('Saved generation plan differs; audition metadata was not changed.')
  }
  const path = join(output, 'audition-plan.json')
  const existing = await readOptional(path)
  if (existing !== undefined) {
    if (JSON.stringify(existing) !== JSON.stringify(plan)) throw new Error('Saved audition plan differs; use a separate output directory.')
    return
  }
  try { await writeFile(path, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' }) }
  catch (error) {
    if (error.code !== 'EEXIST' || JSON.stringify(await readOptional(path)) !== JSON.stringify(plan)) throw error
  }
}

export async function generateContextualAudition({ root = projectRoot, output, apiKey, generate = generateCards, stage = 'contrastive' }) {
  // The approval check precedes output creation, key use and the external boundary.
  const { plan } = loadContextualAudition(root, { stage })
  const destination = await outputPath(root, output)
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('ELEVENLABS_API_KEY is required for live contextual generation.')
  const existing = await readOptional(join(destination, 'audition-plan.json'))
  if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(plan)) {
    throw new Error('Saved audition plan differs; use a separate output directory.')
  }
  // The engine invokes this callback while holding generation.lock, before
  // checking balance or issuing requests. Metadata survives partial failures,
  // and failed lock acquisition cannot write another process's audition plan.
  return await generate({ plan: plan.generation, output: destination, apiKey,
    concurrency: 1, budget: plan.generation.characters,
    beforeRequests: () => preserveAuditionPlan(destination, plan) })
}

async function main() {
  const { values } = parseArgs({ options: { output: { type: 'string' }, 'dry-run': { type: 'boolean' }, stage: { type: 'string', default: 'contrastive' } } })
  const { plan } = loadContextualAudition(projectRoot, { stage: values.stage })
  if (values['dry-run']) {
    console.log(JSON.stringify(contextualAuditionSummary(plan), null, 2))
    return
  }
  if (!values.output) throw new Error('Choose --output under artifacts/generated-originals/.')
  // A dry run returns before loading any credentials.
  const { loadElevenLabsKey } = await import('./elevenlabs-key.mjs')
  const apiKey = await loadElevenLabsKey()
  console.log(JSON.stringify(await generateContextualAudition({ output: values.output, apiKey, stage: values.stage })))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
