/** Resumable provider-original card generation for #86. Never writes production media. */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, appendFile, readdir, open, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { synthesize, speechBody } from './audition-elevenlabs.mjs'

const hash = data => createHash('sha256').update(data).digest('hex')
const nonempty = value => typeof value === 'string' && value.trim().length > 0
async function readOptional(path) {
  try { return await readFile(path, 'utf8') }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}

export function cardItems(catalog, starter) {
  const items = new Map()
  for (const bank of [catalog, starter]) {
    if (bank.language !== 'ja-JP' || !Array.isArray(bank.items)) throw new Error('Expected Japanese card banks.')
    const seen = new Set()
    for (const item of bank.items) {
      if (!/^ja-[a-z0-9-]+$/.test(item.id) || seen.has(item.id) || ![item.reading ?? item.text, item.text, item.meaning ?? item.label].every(nonempty)) throw new Error('Invalid or duplicate card: ' + item.id)
      seen.add(item.id)
      // Shared IDs retain the starter bank's existing reading and label.
      items.set(item.id, { id: item.id, text: item.reading ?? item.text, spelling: item.text, meaning: item.meaning ?? item.label })
    }
  }
  return [...items.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'))
}

export function generationPlan(items, config) {
  if (!items.length || new Set(items.map(i => i.id)).size !== items.length || items.some(i => !/^ja-[a-z0-9-]+$/.test(i.id) || ![i.text, i.spelling, i.meaning].every(nonempty))) throw new Error('Invalid card selection.')
  if (config.provider !== 'ElevenLabs' || config.model !== 'eleven_v4' || config.language !== 'ja-JP' || !Array.isArray(config.voices) || !config.voices.length ||
      new Set(config.voices.map(v => v.voice)).size !== config.voices.length || new Set(config.voices.map(v => v.id)).size !== config.voices.length ||
      config.voices.some(v => !/^[a-z][a-z0-9-]*$/.test(v.voice) || !/^[a-zA-Z0-9_-]+$/.test(v.id) || !nonempty(v.name)) ||
      config.voiceSettings?.stability !== 0.5 || config.voiceSettings?.similarity_boost !== 0.75) throw new Error('Invalid approved voice configuration.')
  const issue = config.issue ?? 86
  if (!Number.isSafeInteger(issue) || issue < 1) throw new Error('Invalid generation issue.')
  const characters = items.reduce((sum, item) => sum + [...item.text].length, 0) * config.voices.length
  return { issue, provider: config.provider, model: config.model, language: config.language,
    voiceSettings: config.voiceSettings, voices: config.voices, items, characters, expectedClips: items.length * config.voices.length }
}

export async function subscription(apiKey) {
  let response
  try {
    response = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(20000), redirect: 'error' })
    if (!response.ok) throw new Error('balance')
    const data = await response.json()
    if (!Number.isFinite(data.character_count) || !Number.isFinite(data.character_limit)) throw new Error('balance')
    return { tier: data.tier, usedCredits: data.character_count, creditLimit: data.character_limit, remainingCredits: data.character_limit - data.character_count }
  } catch { throw new Error('Could not verify ElevenLabs credit balance. Generation stopped.') }
}

export async function generateCards({ plan, output, apiKey, concurrency = 3, budget = 13900, speak = synthesize, balance = subscription, log = console.log }) {
  plan = generationPlan(plan.items, plan)
  if (!apiKey?.trim()) throw new Error('ELEVENLABS_API_KEY is required in the ignored .env.local file.')
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3 || !Number.isFinite(budget) || budget < plan.characters) throw new Error('Invalid concurrency or credit budget.')
  const identity = hash(JSON.stringify(plan))
  const snapshot = { ...plan, identity }
  await mkdir(output, { recursive: true })
  const savedPlan = await readOptional(join(output, 'plan.json'))
  if (savedPlan !== undefined) {
    if (JSON.parse(savedPlan).identity !== identity) throw new Error('Saved generation plan differs; use a separate output directory.')
  } else {
    if ((await readdir(output)).length) throw new Error('Output directory is not empty and has no generation plan.')
    await writeFile(join(output, 'plan.json'), JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' })
  }
  const lockPath = join(output, 'generation.lock')
  const lock = await open(lockPath, 'wx')
  let journalQueue = Promise.resolve()
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))
    await mkdir(join(output, 'records'), { recursive: true })
    await mkdir(join(output, 'pending'), { recursive: true })
    const jobs = plan.items.flatMap(item => plan.voices.map(voice => ({ item, voice })))
    const completed = []
    const pending = []
    for (const job of jobs) {
      const stem = `${job.voice.voice}-${job.item.id}`
      job.recordPath = join(output, 'records', stem + '.json')
      job.pendingPath = join(output, 'pending', stem + '.json')
      job.file = `originals/${job.voice.voice}/${job.item.id}.mp3`
      const saved = await readOptional(job.recordPath)
      if (saved !== undefined) {
        const record = JSON.parse(saved)
        if (record.planIdentity !== identity || record.id !== job.item.id || record.voice !== job.voice.voice || record.voiceId !== job.voice.id || record.text !== job.item.text || record.file !== job.file) throw new Error('Saved recording identity mismatch: ' + stem)
        const audio = await readFile(join(output, record.file))
        if (hash(audio) !== record.sha256 || audio.length !== record.bytes) throw new Error('Saved recording hash mismatch: ' + stem)
        completed.push(record)
      } else {
        if (await readOptional(job.pendingPath) !== undefined || await readOptional(join(output, job.file)) !== undefined) throw new Error('Unresolved earlier request for ' + stem + '; inspect provider history before retrying.')
        pending.push(job)
      }
    }
    // Per-record sidecars are authoritative if a crash interrupted journal append.
    await writeFile(join(output, 'originals.jsonl'), completed.map(c => JSON.stringify(c) + '\n').join(''))
    const initialUsage = await balance(apiKey)
    const previousUsage = await readOptional(join(output, 'usage-before.json'))
    const baseline = previousUsage ? JSON.parse(previousUsage) : initialUsage
    let completedCharacters = completed.reduce((sum, record) => sum + [...record.text].length, 0)
    let unstartedCharacters = pending.reduce((sum, job) => sum + [...job.item.text].length, 0)
    let inFlightCharacters = 0
    let observedSpend = initialUsage.usedCredits - baseline.usedCredits
    if (pending.length && initialUsage.remainingCredits < unstartedCharacters) throw new Error('Insufficient credits for the remaining recordings.')
    // Reserve at the published approximate one-credit-per-character rate; account
    // measurements can lag, so use the greater of observed and projected spend.
    const projectedSpend = () => Math.max(observedSpend, completedCharacters) + unstartedCharacters + inFlightCharacters
    if (pending.length && projectedSpend() > budget) throw new Error('Remaining recordings exceed the credit budget.')
    if (!previousUsage) await writeFile(join(output, 'usage-before.json'), JSON.stringify(baseline, null, 2) + '\n', { flag: 'wx' })
    let next = 0
    let count = completed.length
    let fatal
    let nextBalanceAt = count + 100
    let checking
    const checkBudget = async () => {
      if (count < nextBalanceAt) return
      checking ??= balance(apiKey).then(usage => {
        observedSpend = usage.usedCredits - baseline.usedCredits
        if (projectedSpend() > budget || usage.remainingCredits < unstartedCharacters + inFlightCharacters) throw new Error('Credit budget reached. Completed recordings preserved.')
        nextBalanceAt = count + 100
      }).finally(() => { checking = undefined })
      await checking
    }
    const worker = async () => {
      while (!fatal) {
        try {
          await checkBudget()
          if (fatal || next >= pending.length) return
          if (projectedSpend() > budget) throw new Error('Credit budget reached.')
          const job = pending[next++]
          const characters = [...job.item.text].length
          unstartedCharacters -= characters
          inFlightCharacters += characters
          const request = speechBody(plan, job.item.text)
          await mkdir(join(output, 'originals', job.voice.voice), { recursive: true })
          await writeFile(job.pendingPath, JSON.stringify({ id: job.item.id, voice: job.voice.voice, request, startedAt: new Date().toISOString() }), { flag: 'wx' })
          const result = await speak(apiKey, job.voice.id, request)
          if (!Buffer.isBuffer(result.audio) || !result.audio.length) throw new Error('Empty provider audio.')
          await writeFile(join(output, job.file), result.audio, { flag: 'wx' })
          const record = { ...job.item, voice: job.voice.voice, voiceId: job.voice.id, voiceName: job.voice.name, model: plan.model, request,
            file: job.file, sha256: hash(result.audio), bytes: result.audio.length, requestId: result.requestId ?? null, planIdentity: identity, createdAt: new Date().toISOString() }
          await writeFile(job.recordPath, JSON.stringify(record) + '\n', { flag: 'wx' })
          journalQueue = journalQueue.then(() => appendFile(join(output, 'originals.jsonl'), JSON.stringify(record) + '\n'))
          await journalQueue
          inFlightCharacters -= characters
          completedCharacters += characters
          count++
          if (count % 25 === 0 || count === plan.expectedClips) log(JSON.stringify({ completed: count, total: plan.expectedClips, last: `${job.voice.name}: ${job.item.text}` }))
        } catch (error) {
          const status = /^ElevenLabs HTTP (\d+)/.exec(error?.message ?? '')?.[1]
          fatal ??= new Error(status ? `ElevenLabs HTTP ${status}; generation stopped without retry.` : 'Generation stopped; completed recordings and pending request records preserved.')
        }
      }
    }
    log(JSON.stringify({ resumeCompleted: count, remaining: pending.length, concurrency, budget }))
    await Promise.all(Array.from({ length: concurrency }, worker))
    await journalQueue
    const usage = await balance(apiKey)
    await writeFile(join(output, 'usage-after.json'), JSON.stringify(usage, null, 2) + '\n')
    const summary = { completed: count, total: plan.expectedClips, characters: plan.characters, usedCreditsThisBatch: usage.usedCredits - baseline.usedCredits, remainingCredits: usage.remainingCredits, status: fatal ? 'stopped' : 'generated', updatedAt: new Date().toISOString() }
    await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
    if (fatal) throw fatal
    return summary
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}

async function main() {
  const { values } = parseArgs({ options: { output: { type: 'string' }, 'dry-run': { type: 'boolean' }, concurrency: { type: 'string', default: '3' } } })
  const [catalog, starter, config] = await Promise.all(['content/catalog/ja.json', 'content/ja.json', 'content/elevenlabs-voices.json'].map(async path => JSON.parse(await readFile(path, 'utf8'))))
  const plan = generationPlan(cardItems(catalog, starter), config)
  if (values['dry-run']) { console.log(JSON.stringify({ cards: plan.items.length, voices: plan.voices.map(v => v.name), requests: plan.expectedClips, characters: plan.characters, budget: 13900 }, null, 2)); return }
  if (!values.output) throw new Error('Choose --output under artifacts/generated-originals/elevenlabs-cards/.')
  console.log(JSON.stringify(await generateCards({ plan, output: resolve(values.output), apiKey: process.env.ELEVENLABS_API_KEY, concurrency: Number(values.concurrency) })))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
