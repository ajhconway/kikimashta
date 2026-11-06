/** Local Japanese voice audition for issue #78; never publishes production media. */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

export const MODEL = 'eleven_multilingual_v2'
export const OUTPUT_FORMAT = 'mp3_44100_128'
class SpeechError extends Error {}
export const SAMPLES = [
  { id: 'cat', kind: 'word', text: 'ねこ', meaning: 'Cat' },
  { id: 'apple', kind: 'word', text: 'りんご', meaning: 'Apple' },
  { id: 'cup', kind: 'word', text: 'コップ', meaning: 'Cup' },
  { id: 'sleeping-cat', kind: 'sentence', text: 'ねこがソファで寝ています。', meaning: 'The cat is sleeping on the sofa.' },
  { id: 'three-apples', kind: 'sentence', text: 'テーブルの上に、りんごが三つあります。', meaning: 'There are three apples on the table.' },
  { id: 'red-cup', kind: 'sentence', text: '赤いコップはどこですか？', meaning: 'Where is the red cup?' },
  { id: 'rainy-day', kind: 'sentence', text: '雨が降っているので、かさを持っていきます。', meaning: 'It is raining, so I will take an umbrella.' },
]

export function auditionPlan({ voices = [], model = MODEL } = {}) {
  if (!Array.isArray(voices) || voices.length > 3 || voices.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) || new Set(voices).size !== voices.length) {
    throw new Error('Choose one to three unique voice IDs (letters, digits, underscores, or hyphens).')
  }
  if (typeof model !== 'string' || !/^[a-z0-9_]+$/.test(model)) throw new Error('Invalid ElevenLabs model ID.')
  return { provider: 'ElevenLabs', model, language: 'ja-JP', outputFormat: OUTPUT_FORMAT,
    voices, samples: SAMPLES, requestsPerVoice: SAMPLES.length,
    requests: voices.length ? voices.length * SAMPLES.length : null,
    textCharactersPerVoice: SAMPLES.reduce((sum, sample) => sum + [...sample.text].length, 0),
    voiceSettings: { stability: 0.5, similarity_boost: 0.75 },
  }
}

export function speechBody(plan, text) {
  return { text, model_id: plan.model, voice_settings: plan.voiceSettings,
    // Multilingual v2 detects language and does not support language_code.
    ...(plan.model === 'eleven_multilingual_v2' ? {} : { language_code: 'ja' }),
  }
}

export async function synthesize(apiKey, voice, body, { fetchImpl = fetch, timeoutMs = 45000 } = {}) {
  let response
  try {
    response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    })
  } catch {
    // Do not log transport errors or provider bodies: they can contain credentials.
    throw new SpeechError('ElevenLabs connection failed or timed out. No automatic retry.')
  }
  if (!response.ok) throw new SpeechError(`ElevenLabs HTTP ${response.status}. Check key permissions, voice/model access, and credits. No automatic retry.`)
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('audio/mpeg')) throw new SpeechError('ElevenLabs did not return MP3 audio.')
  let audio
  try { audio = Buffer.from(await response.arrayBuffer()) }
  catch { throw new SpeechError('ElevenLabs audio download failed. No automatic retry.') }
  if (!audio.length) throw new SpeechError('ElevenLabs returned empty audio.')
  return { audio, requestId: response.headers.get('request-id') }
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

export function reviewHtml(manifest) {
  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>ElevenLabs Japanese voice audition</title>
<style>body{font:18px system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem}article{border-top:1px solid #bbb;padding:1rem 0}audio{display:block;width:100%;margin:.5rem 0}p{line-height:1.5}</style>
<h1>ElevenLabs Japanese voice audition</h1><p>AI-generated speech · ${escapeHtml(manifest.model)}. Compare at the same device volume. Review pronunciation, pitch accent, word endings, and sentence rhythm on the iPhone before choosing voices. Provider MP3s are unmodified.</p>
${manifest.clips.map(clip => `<article><p lang="ja">${escapeHtml(clip.text)}</p><p>${escapeHtml(clip.meaning)} · Voice ${escapeHtml(clip.voice)}</p><audio controls preload="none" aria-label="${escapeHtml(`${clip.voice}: ${clip.text}`)}" src="${escapeHtml(clip.file)}"></audio></article>`).join('\n')}
<p>${manifest.failures.length} failed request(s). Successful samples are preserved; no automatic retries.</p></html>`
}

export async function generateAudition({ plan, output, apiKey, speak = synthesize }) {
  // Validate before directory creation or any paid call, including when invoked programmatically.
  plan = auditionPlan({ voices: plan.voices, model: plan.model })
  if (!plan.voices.length) throw new Error('Set ELEVENLABS_VOICE_IDS or pass --voice before generating.')
  if (!apiKey?.trim()) throw new Error('Set ELEVENLABS_API_KEY in the ignored .env.local file. Do not paste it into chat.')
  await mkdir(dirname(output), { recursive: true })
  await mkdir(output, { recursive: false })
  const manifest = { ...plan, createdAt: new Date().toISOString(),
    processing: 'Provider-original MP3 bytes preserved without processing or re-encoding.',
    review: 'Not approved; pronunciation and pitch accent require human listening.', clips: [], failures: [] }
  const save = async () => {
    await writeFile(join(output, 'provenance.json'), JSON.stringify(manifest, null, 2) + '\n')
    await writeFile(join(output, 'index.html'), reviewHtml(manifest))
  }
  await save()
  for (const voice of plan.voices) {
    for (const sample of plan.samples) {
      const request = speechBody(plan, sample.text)
      let result
      try { result = await speak(apiKey.trim(), voice, request) }
      catch (error) {
        const reason = error instanceof SpeechError ? error.message : 'Generation failed; run stopped without retry.'
        manifest.failures.push({ id: sample.id, voice, error: reason })
        await save()
        // eslint-disable-next-line preserve-caught-error -- Provider exceptions may contain credentials; discard their cause.
        throw new Error(`${reason} Failed sample: ${voice}/${sample.id}. Successful samples preserved in ${output}.`)
      }
      const file = `${voice}-${sample.id}.mp3`
      await writeFile(join(output, file), result.audio, { flag: 'wx' })
      manifest.clips.push({ ...sample, voice, request, file, original: file,
        sha256: createHash('sha256').update(result.audio).digest('hex'), bytes: result.audio.length,
        requestId: result.requestId ?? null })
      await save()
    }
  }
  return manifest
}

async function main() {
  const { values } = parseArgs({ options: {
    'dry-run': { type: 'boolean' }, voice: { type: 'string', multiple: true },
    model: { type: 'string' }, output: { type: 'string' },
  } })
  if (existsSync('.env.local')) loadEnvFile('.env.local')
  const voices = values.voice ?? (process.env.ELEVENLABS_VOICE_IDS?.split(',').map(id => id.trim()).filter(Boolean) ?? [])
  const plan = auditionPlan({ voices, model: values.model ?? MODEL })
  if (values['dry-run']) {
    console.log(JSON.stringify({ ...plan, note: 'No API calls or file changes. Set voice IDs to see total requests. Character count is input length, not a price estimate.' }, null, 2))
    return
  }
  const output = resolve(values.output ?? `artifacts/generated-originals/elevenlabs-audition/${new Date().toISOString().replaceAll(':', '-')}`)
  const manifest = await generateAudition({ plan, output, apiKey: process.env.ELEVENLABS_API_KEY })
  console.log(`${manifest.clips.length} samples ready to compare: ${join(output, 'index.html')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
