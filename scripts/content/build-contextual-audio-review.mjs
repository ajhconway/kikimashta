/** Verify normalized audition deliveries, then make local WAV listening pairs (#124). */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadContextualAudition } from './contextual-audio-plan.mjs'
import { speechBody } from './audition-elevenlabs.mjs'
import { projectRoot } from './validate-contextual.mjs'

const RATE = 44100
const PROFILE = { version: 1, targetLufs: -22, truePeakCeilingDbtp: -2, maxBoostDb: 9,
  rate: RATE, bitrate: '128k', dualMono: true, shortClipAnalysis: 'pad-to-500ms-only-for-measurement' }
const hash = value => createHash('sha256').update(value).digest('hex')
const canonical = value => JSON.stringify(sorted(value))
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]))
  return value
}

export { PROFILE as CONTEXTUAL_AUDIO_PROFILE, verifyLevel as verifyContextualAudioLevel }
const same = (left, right) => canonical(left) === canonical(right)
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])

function inside(root, path) {
  const within = relative(root, path)
  return within !== '..' && !within.startsWith('../') && !isAbsolute(within)
}

async function resolvedDestination(path) {
  let ancestor = path
  for (;;) {
    try { return resolve(await realpath(ancestor), relative(ancestor, path)) }
    catch (error) {
      if (error.code !== 'ENOENT' || ancestor === dirname(ancestor)) throw error
      ancestor = dirname(ancestor)
    }
  }
}

async function readSafe(root, path) {
  if (typeof path !== 'string' || isAbsolute(path) || /[\\%?#]/u.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Unsafe audition media path.')
  }
  const source = await realpath(join(root, path))
  if (!inside(root, source)) throw new Error('Audition media path escapes its source directory.')
  return { bytes: await readFile(source), source }
}

const readJson = async (root, path) => JSON.parse((await readSafe(root, path)).bytes.toString('utf8'))
async function readJournal(root, path) {
  const raw = (await readSafe(root, path)).bytes.toString('utf8')
  return raw.split('\n').filter(line => line.trim()).map(JSON.parse)
}

function recordIndex(records, expected, description) {
  if (records.length !== expected) throw new Error(`Expected ${expected} ${description}; received ${records.length}.`)
  const result = new Map()
  for (const record of records) {
    const key = `${record?.voice}:${record?.id}`
    if (!record || typeof record.id !== 'string' || typeof record.voice !== 'string' || result.has(key)) {
      throw new Error(`Unknown or duplicate ${description}.`)
    }
    result.set(key, record)
  }
  return result
}

function verifyLevel(record, key) {
  const reasons = ['true_peak_headroom', 'maximum_gain', 'encoded_loudness_resolution']
  const limited = record.targetLimited === true && record.after?.integratedLufs < -22.25 &&
    Array.isArray(record.limitingReasons) && record.limitingReasons.length > 0 && record.limitingReasons.every(reason => reasons.includes(reason))
  if (!same(record.profile, PROFILE) || typeof record.targetLimited !== 'boolean' || (record.targetLimited && !limited) ||
      !Number.isFinite(record.after?.integratedLufs) || !Number.isFinite(record.after?.truePeakDbtp) || record.after.truePeakDbtp > -2 ||
      (!limited && Math.abs(record.after.integratedLufs + 22) > 0.25) ||
      !Number.isFinite(record.gainDb) || record.gainDb > 9 || !Number.isSafeInteger(record.decodedFrames) ||
      record.decodedFrames < 1 || record.decodedFrames > RATE * 120) throw new Error('Unverified normalized level or duration: ' + key)
}

function decodeRecording(ffmpeg, source, expectedFrames, key) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-nostdin', '-threads', '1', '-i', source,
    '-map', '0:a:0', '-ar', String(RATE), '-ac', '1', '-f', 's16le', '-'], { maxBuffer: 64 * 1024 * 1024, timeout: 30000 })
  if (result.error || result.status !== 0 || result.stderr?.length || !Buffer.isBuffer(result.stdout) ||
      result.stdout.length !== expectedFrames * 2) throw new Error('Normalized recording failed complete decode: ' + key)
  return result.stdout
}

function wave(pcm) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export function contextualAudioReviewHtml(review) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contextual listening audio review</title><style>body{font:18px system-ui;max-width:48rem;margin:2rem auto;padding:0 1rem;color:#30233d;background:#faf7ff}article{border-top:1px solid #bda9cf;padding:1.4rem 0}h2{font-size:1.1rem}audio{display:block;width:100%;margin:1rem 0}p{line-height:1.55}[lang=ja]{font-size:1.15rem}.label{font-weight:650}</style>
<h1>Contextual listening · first audio sample</h1><p>${review.contexts.length} contexts · ${review.voices.map(voice => escapeHtml(voice.name)).join(' / ')} · ${review.samples.length} sentence/question pairs. AI-generated Japanese speech. Listening approval is pending; these recordings are not active practice content.</p>
<p>Each sample plays its sentence, ${review.gapMs} ms of silence, then its question. Compare at the same device volume. Check pronunciation, word endings, sentence rhythm, pause and volume on the iPhone.</p>
<p>WAV previews decode the verified constant-gain MP3 deliveries, with no further lossy encoding or gain adjustment. Provider originals and normalization records remain preserved in their separate local artifacts.</p>
${review.samples.map(sample => `<article id="${escapeHtml(`${sample.voice}-${sample.question.id}`)}"><h2>${escapeHtml(sample.voiceName)} · ${escapeHtml(sample.contextId)} · ${sample.question.kind === 'target' ? 'Target-word answer' : 'Sentence-detail answer'}</h2>
<audio controls preload="none" aria-label="${escapeHtml(`${sample.voiceName}: ${sample.contextId}, ${sample.question.kind} question, sentence then question`)}" src="${escapeHtml(sample.src)}"></audio>
<p class="label">Sentence</p><p lang="ja">${escapeHtml(sample.sentence.text)}</p>${sample.sentence.reading ? `<p lang="ja">${escapeHtml(sample.sentence.reading)}</p>` : ''}<p>${escapeHtml(sample.sentence.meaning)}</p>
<p class="label">Question</p><p lang="ja">${escapeHtml(sample.question.text)}</p>${sample.question.reading ? `<p lang="ja">${escapeHtml(sample.question.reading)}</p>` : ''}<p>${escapeHtml(sample.question.meaning)}</p>
<p><strong>Correct answer:</strong> <span lang="ja">${escapeHtml(sample.question.correctAnswer)}</span> — ${escapeHtml(sample.question.correctMeaning)}</p></article>`).join('\n')}
<p><a href="review-provenance.json">Review provenance</a></p></html>`
}

export async function buildContextualAudioReview({ root = projectRoot, input, delivery, output, stage = 'contrastive', batch = 'sample', ffmpeg = process.env.FFMPEG || 'ffmpeg', render = contextualAudioReviewHtml }) {
  const { bank, plan } = loadContextualAudition(root, { stage, batch })
  if (![input, delivery, output].every(path => typeof path === 'string' && path.trim())) throw new Error('Choose --input originals, --delivery normalized recordings and a new --output review directory.')
  const sourceRoot = await realpath(resolve(root, input))
  const deliveryRoot = await realpath(resolve(root, delivery))
  const destination = await resolvedDestination(resolve(root, output))
  if (!inside(resolve(await realpath(root), 'artifacts/contextual-audio-review'), destination) ||
      inside(sourceRoot, destination) || inside(deliveryRoot, destination) || inside(destination, sourceRoot) || inside(destination, deliveryRoot)) {
    throw new Error('Choose a separate output under artifacts/contextual-audio-review/.')
  }
  const generation = plan.generation
  const identity = hash(JSON.stringify(generation))
  const [snapshot, savedAudition, originals, normalized] = await Promise.all([
    readJson(sourceRoot, 'plan.json'), readJson(sourceRoot, 'audition-plan.json'),
    readJournal(sourceRoot, 'originals.jsonl'), readJournal(deliveryRoot, 'deliveries.jsonl'),
  ])
  const { identity: savedIdentity, ...savedGeneration } = snapshot
  if (savedIdentity !== identity || !same(savedGeneration, generation) || !same(savedAudition, plan)) {
    throw new Error('Saved audition no longer matches the approved text, pairing or voices.')
  }
  const originalByKey = recordIndex(originals, generation.expectedClips, 'original recordings')
  const deliveryByKey = recordIndex(normalized, generation.expectedClips, 'normalized deliveries')
  const clips = new Map()
  for (const voice of generation.voices) {
    for (const item of generation.items) {
      const key = `${voice.voice}:${item.id}`
      const original = originalByKey.get(key)
      const record = deliveryByKey.get(key)
      const expectedOriginal = `originals/${voice.voice}/${item.id}.mp3`
      const expectedDelivery = `${voice.voice}/${item.id}.mp3`
      if (!original || !record || original.planIdentity !== identity || original.voiceId !== voice.id || original.voiceName !== voice.name ||
          original.model !== generation.model || original.file !== expectedOriginal || !same(original.request, speechBody(generation, item.text)) ||
          Object.entries(item).some(([field, value]) => !same(original[field], value)) ||
          record.file !== expectedDelivery || record.originalFile !== expectedOriginal || record.originalSha256 !== original.sha256 ||
          record.sourceRecordSha256 !== hash(canonical(original)) ||
          Object.entries(original).some(([field, value]) => field !== 'file' && !same(record[field], value))) {
        throw new Error('Original/delivery identity mismatch: ' + key)
      }
      const sidecar = await readJson(sourceRoot, `records/${voice.voice}-${item.id}.json`)
      if (!same(sidecar, original)) throw new Error('Original journal and sidecar differ: ' + key)
      verifyLevel(record, key)
      const [provider, delivered] = await Promise.all([readSafe(sourceRoot, expectedOriginal), readSafe(deliveryRoot, expectedDelivery)])
      if (!provider.bytes.length || provider.bytes.length !== original.bytes || hash(provider.bytes) !== original.sha256 ||
          !delivered.bytes.length || delivered.bytes.length !== record.deliveryBytes || hash(delivered.bytes) !== record.deliverySha256) {
        throw new Error('Original/delivery hash mismatch: ' + key)
      }
      clips.set(key, { item, record, source: delivered.source })
    }
  }
  // All identities, complete journals and source hashes pass before decoding or
  // creating any review output. Decode every clip before publishing the gallery.
  for (const [key, clip] of clips) clip.pcm = decodeRecording(ffmpeg, clip.source, clip.record.decodedFrames, key)
  const gapFrames = RATE * plan.gapMs / 1000
  if (!Number.isSafeInteger(gapFrames)) throw new Error('Pause cannot be represented exactly at the review sample rate.')
  const pause = Buffer.alloc(gapFrames * 2)
  const samples = []
  const outputs = []
  for (const voice of generation.voices) {
    for (const context of plan.contexts) {
      const authoredContext = bank.contexts.find(entry => entry.id === context.id)
      const sentence = clips.get(`${voice.voice}:${context.sentenceItemId}`)
      for (const question of context.questions) {
        const authoredQuestion = authoredContext.questions.find(entry => entry.id === question.id)
        const answer = clips.get(`${voice.voice}:${question.itemId ?? question.id}`)
        const src = `samples/${voice.voice}-${question.id}.wav`
        const bytes = wave(Buffer.concat([sentence.pcm, pause, answer.pcm]))
        outputs.push({ src, bytes })
        const sourceInfo = clip => ({ id: clip.item.id, originalFile: clip.record.originalFile, originalSha256: clip.record.originalSha256,
          normalizedFile: clip.record.file, deliverySha256: clip.record.deliverySha256, decodedFrames: clip.record.decodedFrames,
          targetLimited: clip.record.targetLimited, limitingReasons: clip.record.limitingReasons })
        samples.push({ src, sha256: hash(bytes), bytes: bytes.length, frames: sentence.record.decodedFrames + gapFrames + answer.record.decodedFrames,
          voice: voice.voice, voiceName: voice.name, contextId: context.id, contextRevision: context.revision, targetItemId: context.targetItemId,
          sentence: { text: sentence.item.text, reading: authoredContext.sentence.reading, meaning: authoredContext.sentence.meaning, ...sourceInfo(sentence) },
          question: { ...question, text: answer.item.text, reading: authoredQuestion.prompt.reading, meaning: authoredQuestion.prompt.meaning,
            ...sourceInfo(answer), id: question.id } })
      }
    }
  }
  const review = { schemaVersion: 1, issue: plan.issue, bankId: bank.id, approval: plan.approval, generationIdentity: identity,
    input: relative(root, sourceRoot), delivery: relative(root, deliveryRoot), voices: generation.voices, contexts: plan.contexts,
    originalRecordings: originals.length, normalizationProfile: PROFILE, gapMs: plan.gapMs, gapFrames,
    previewEncoding: { container: 'WAV', codec: 'PCM signed 16-bit little-endian', sampleRate: RATE, channels: 1,
      processing: 'Decoded normalized deliveries joined with exact zero-valued pause; no additional gain or lossy encoding.' },
    originalsPreserved: true, review: 'Listening approval pending; not active practice media.',
    ...(plan.aliases ? { aliases: plan.aliases, logicalRecordings: plan.logicalRecordings } : {}), samples }
  await mkdir(dirname(destination), { recursive: true })
  await mkdir(destination, { recursive: false })
  await mkdir(join(destination, 'samples'))
  for (const file of outputs) await writeFile(join(destination, file.src), file.bytes, { flag: 'wx' })
  await writeFile(join(destination, 'review-provenance.json'), JSON.stringify(review, null, 2) + '\n', { flag: 'wx' })
  await writeFile(join(destination, 'index.html'), render(review), { flag: 'wx' })
  return { contexts: plan.contexts.length, voices: generation.voices.map(voice => voice.name), recordings: originals.length, pairs: samples.length,
    gapMs: plan.gapMs, targetLimited: normalized.filter(record => record.targetLimited).length, output: destination }
}

async function main() {
  const { values } = parseArgs({ options: { input: { type: 'string' }, delivery: { type: 'string' }, output: { type: 'string' }, ffmpeg: { type: 'string' }, stage: { type: 'string', default: 'contrastive' }, batch: { type: 'string', default: 'sample' } } })
  console.log(JSON.stringify(await buildContextualAudioReview({ input: values.input, delivery: values.delivery, output: values.output,
    stage: values.stage, batch: values.batch, ...(values.ffmpeg ? { ffmpeg: values.ffmpeg } : {}) })))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
