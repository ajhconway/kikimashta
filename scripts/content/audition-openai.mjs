/** Generate a small, local voice comparison for issue #10. No browser API calls. */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { WebSocket } from 'undici'

export const MODEL = 'gpt-realtime-2.1-mini'
export const VOICES = ['marin', 'cedar', 'coral']
export const WORDS = [
  { id: 'cat', text: 'ねこ' },
  { id: 'apple', text: 'りんご' },
  { id: 'cup', text: 'コップ' },
]
export const INSTRUCTIONS = 'You are recording individual vocabulary words for a Japanese listening game. '
  + 'Speak only the supplied Japanese word, exactly once, with no introduction, translation, or explanation. '
  + 'Use native standard Tokyo Japanese pronunciation and natural pitch accent. '
  + 'Sound warm, friendly, and attentive, like a relaxed person speaking to a friend. '
  + 'Use a clear, comfortable conversational pace, with natural word endings. '
  + 'Avoid exaggerated teaching intonation, an announcer voice, whispering, or a singsong delivery. '
  + 'No music or sound effects.'
const RATE = 24000
const MAX_BYTES = RATE * 2 * 8 // Reject unexpectedly long output; no automatic paid retries.

export function sessionEvent(voice) {
  return { type: 'session.update', session: {
    type: 'realtime', output_modalities: ['audio'], instructions: INSTRUCTIONS,
    audio: {
      input: { turn_detection: null },
      output: { format: { type: 'audio/pcm', rate: RATE }, voice },
    },
  } }
}

export function responseEvent(text) {
  return { type: 'response.create', response: {
    conversation: 'none', output_modalities: ['audio'], max_output_tokens: 128,
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text }] }],
  } }
}

// Kept independent of the transport so failure paths can be tested without billing.
export function audioCollector() {
  const chunks = []
  let bytes = 0
  let transcript = ''
  return event => {
    if (event.type === 'error') {
      // Codes are enough to diagnose auth/quota/schema failures; never log request data or headers.
      throw new Error(`OpenAI error (${event.error?.code ?? 'unknown'}).`)
    }
    if (event.type === 'response.output_audio.delta') {
      const chunk = Buffer.from(event.delta, 'base64')
      bytes += chunk.length
      if (bytes > MAX_BYTES) throw new Error('Unexpectedly long audio; stopped generation.')
      chunks.push(chunk)
    }
    if (event.type === 'response.output_audio_transcript.done') transcript = event.transcript
    if (event.type === 'response.done') {
      if (event.response?.status !== 'completed') throw new Error('Audio response did not complete.')
      const pcm = Buffer.concat(chunks)
      if (pcm.length < RATE / 5 || pcm.length % 2) throw new Error('Missing or invalid PCM audio.')
      return { pcm, transcript, usage: event.response.usage ?? null }
    }
    return null
  }
}

export function synthesize(apiKey, voice, text, { Socket = WebSocket, timeoutMs = 45000 } = {}) {
  return new Promise((accept, reject) => {
    const socket = new Socket(`wss://api.openai.com/v1/realtime?model=${MODEL}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const collect = audioCollector()
    let settled = false
    let requested = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.close()
      if (error) reject(error)
      else accept(result)
    }
    const timer = setTimeout(() => finish(new Error('OpenAI audio request timed out.')), timeoutMs)
    socket.addEventListener('error', () => finish(new Error('OpenAI connection failed. Check network, key, and model access.')))
    socket.addEventListener('close', () => finish(new Error('OpenAI connection closed before audio completed.')))
    socket.addEventListener('message', ({ data }) => {
      if (settled) return
      try {
        const event = JSON.parse(data)
        if (event.type === 'session.created') socket.send(JSON.stringify(sessionEvent(voice)))
        if (event.type === 'session.updated' && !requested) {
          requested = true
          socket.send(JSON.stringify(responseEvent(text)))
        }
        const result = collect(event)
        if (result) finish(null, result)
      } catch (error) { finish(error) }
    })
  })
}

export function wavFromPcm(pcm) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export function levelAudio(pcm) {
  let peak = 0
  let squares = 0
  let active = 0
  for (let i = 0; i < pcm.length; i += 2) {
    const sample = Math.abs(pcm.readInt16LE(i) / 32768)
    peak = Math.max(peak, sample)
    // Exclude quiet background/silence from this short-clip loudness approximation.
    if (sample > 0.01) { squares += sample ** 2; active++ }
  }
  if (!active) throw new Error('Audio contains no usable speech signal.')
  const rmsDb = 20 * Math.log10(Math.sqrt(squares / active))
  const peakDb = 20 * Math.log10(peak)
  // Conservative gain only: no compression, stretching, silence trimming, or pitch changes.
  const gainDb = Math.min(-22 - rmsDb, -4 - peakDb, 9)
  return { rmsDb, peakDb, gainDb }
}

function encode(wav, mp3, gainDb) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-n', '-i', wav,
    '-af', `volume=${gainDb}dB,adelay=120,apad=pad_dur=0.24`,
    '-ac', '1', '-codec:a', 'libmp3lame', '-q:a', '2', mp3], { encoding: 'utf8' })
  if (result.error || result.status !== 0) throw new Error('MP3 encoding failed. Check ffmpeg is installed.')
}

export function reviewHtml() {
  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Kikimashta voice comparison</title>
<style>body{font:18px system-ui;max-width:36rem;margin:2rem auto;padding:0 1rem;background:#ffe4cc;color:#301d49}section{background:#fff4fc;border:3px solid #9a4cff;border-radius:20px;padding:1rem;margin:1.5rem 0}audio{width:100%}h1{font-size:1.7rem}p{line-height:1.5}</style>
<h1>Choose a listening voice</h1><p>AI-generated Japanese speech from OpenAI. Compare at the same device volume. Listen for warmth, clear pronunciation, and comfortable word endings.</p>
${VOICES.map(voice => `<section><h2>${voice}</h2>${WORDS.map(word => `<p lang="ja">${word.text}</p><audio controls preload="none" aria-label="${voice}: ${word.text}" src="${voice}-${word.id}.mp3"></audio>`).join('')}</section>`).join('')}
<p>These are audition clips. Japanese pronunciation and pitch accent still need listening review. Tell me your preferred voice and anything you would change.</p></html>`
}

async function main() {
  const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, output: { type: 'string' } } })
  if (values['dry-run']) {
    console.log(JSON.stringify({ model: MODEL, voices: VOICES, words: WORDS, requests: VOICES.length * WORDS.length,
      instructions: INSTRUCTIONS, note: 'No API calls or file changes. Production audio is untouched.' }, null, 2))
    return
  }
  if (existsSync('.env.local')) loadEnvFile('.env.local')
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Add OPENAI_API_KEY to the ignored .env.local file first. Do not paste it into chat.')
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) throw new Error('Install ffmpeg first.')
  const output = resolve(values.output ?? `artifacts/generated-originals/audio-audition/${new Date().toISOString().replaceAll(':', '-')}`)
  // A new directory prevents accidental paid regeneration and keeps provider originals intact.
  await mkdir(dirname(output), { recursive: true })
  await mkdir(output, { recursive: false })
  const manifest = { provider: 'OpenAI', model: MODEL, createdAt: new Date().toISOString(),
    language: 'ja-JP', instructions: INSTRUCTIONS, sampleRate: RATE,
    processing: 'Gain only, active-sample RMS target -22 dBFS, max boost 9 dB, sample peak ceiling -4 dBFS before MP3; add 120 ms lead and 240 ms tail, no trimming.',
    review: 'Not yet approved; pronunciation and pitch accent require human listening.', clips: [] }
  for (const voice of VOICES) {
    for (const word of WORDS) {
      console.log(`Generating ${voice}: ${word.text}`)
      const { pcm, transcript, usage } = await synthesize(key, voice, word.text)
      const stem = `${voice}-${word.id}`
      const wav = wavFromPcm(pcm)
      await writeFile(join(output, `${stem}.wav`), wav, { flag: 'wx' })
      const levels = levelAudio(pcm)
      encode(join(output, `${stem}.wav`), join(output, `${stem}.mp3`), levels.gainDb)
      manifest.clips.push({ voice, ...word, file: `${stem}.mp3`, original: `${stem}.wav`,
        originalSha256: createHash('sha256').update(wav).digest('hex'),
        transcript, usage, durationSeconds: pcm.length / (RATE * 2), ...levels })
      await writeFile(join(output, 'provenance.json'), JSON.stringify(manifest, null, 2) + '\n')
    }
  }
  await writeFile(join(output, 'index.html'), reviewHtml(), { flag: 'wx' })
  console.log(`Ready to compare: ${join(output, 'index.html')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
