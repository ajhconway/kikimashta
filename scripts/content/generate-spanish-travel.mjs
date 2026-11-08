/** Bounded first Spanish travel pack generation (#143). Never logs credentials. */
import { readFile, writeFile, mkdir, access, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { synthesize } from './audition-elevenlabs.mjs';

const bank = JSON.parse(await readFile('content/es-419.json', 'utf8'));
const output = 'artifacts/audio/es-419-travel-1';
const voice = { id: 'euXtEAlRno6A0KpxwWXn', name: 'Cesar - Natural, Calm', language: 'es', accent: 'mexican' };
const characters = bank.items.reduce((sum, item) => sum + [...item.text].length, 0);
if (bank.items.length !== 6 || characters > 40) throw new Error('Generation exceeds six words / 40 characters.');
if (!process.env.ELEVENLABS_API_KEY) throw new Error('Load the configured ElevenLabs environment file.');
await mkdir(output + '/originals/cesar', { recursive: true });
const manifest = { issue: 143, language: 'es-419', provider: 'ElevenLabs', model: 'eleven_v4', voice,
  createdAt: new Date().toISOString(), characterBudget: 40, characters, review: 'Generated; owner pronunciation acceptance pending.', recordings: [] };
// Refuse an existing run, including an interrupted run, to prevent duplicate charges.
await writeFile(output + '/started.json', JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
for (const item of bank.items) {
  try { await access(`${output}/originals/cesar/${item.id}.mp3`); throw new Error('Existing recording; inspect before retrying.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const request = { text: item.text, model_id: manifest.model, language_code: 'es', voice_settings: { stability: 0.5, similarity_boost: 0.75 } };
  const result = await synthesize(process.env.ELEVENLABS_API_KEY, voice.id, request);
  const file = `${output}/originals/cesar/${item.id}.mp3`;
  await writeFile(file, result.audio, { flag: 'wx' });
  manifest.recordings.push({ id: item.id, itemId: item.id, voice: 'cesar', voiceId: voice.id, text: item.text, request, file: `originals/cesar/${item.id}.mp3`, requestId: result.requestId ?? null,
    bytes: result.audio.length, sha256: createHash('sha256').update(result.audio).digest('hex') });
  await appendFile(output + '/originals.jsonl', JSON.stringify(manifest.recordings.at(-1)) + '\n');
  await writeFile(output + '/provenance.json', JSON.stringify(manifest, null, 2) + '\n');
  console.log('Saved ' + item.id);
}
