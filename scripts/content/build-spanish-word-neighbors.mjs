import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spanishNeighborBank, spanishSemanticDigest } from './spanish-neighbor-utils.mjs';
import { normalizedEditDistance } from './spanish-neighbor-metrics.mjs';
import { spanishPhonemeUnits } from '../../src/core/spanish-pronunciation.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const fileHash = path => hash(readFileSync(resolve(root, path)));
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const stable = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const model = { id: 'facebook/fasttext-es-vectors', revision: 'c4c84c726b98d02b1f0ec92d6fc2724fe3b84276',
  sha256: 'b8c800affac505d60c8a929cb90ff2ef616b4e8b5224d8f3a0a5e911a8a6546e' };
const espeakRevision = '4870adfa25b1a32b4361592f1be8a40337c58d6c';

/** Selected Spanish sources only; exact same-key pronunciations are not contrasts. */
export function buildSpanishWordNeighbors(bank, semantic, phonetic, probeData) {
  if (!bank.length || bank.some(item => item.language !== 'es-419') || new Set(bank.map(item => item.id)).size !== bank.length) throw new Error('Expected unique approved Spanish words.');
  if (bank.some(item => item.reading !== undefined)) throw new Error('Spanish reading overrides require explicit transcription preparation; surface-only data cannot be reused.');
  if (semantic.language !== 'es-419' || semantic.sourceDigest !== spanishSemanticDigest(bank) ||
      Object.entries(model).some(([key, value]) => semantic.model?.[key] !== value) ||
      semantic.recipeSha256 !== fileHash('scripts/content/es_semantic_neighbors.py') || semantic.repeatIdentical !== true) throw new Error('Spanish semantic source/model/recipe is stale. Regenerate Spanish semantic rankings.');
  const phoneticInputs = bank.map(({ id, language, text }) => ({ id, language, text }));
  if (phonetic.language !== 'es-419' || phonetic.sourceDigest !== hash(JSON.stringify(phoneticInputs)) ||
      phonetic.tool?.id !== 'espeak-ng' || phonetic.tool.version !== '1.52.0' || phonetic.tool.sourceCommit !== espeakRevision ||
      JSON.stringify(phonetic.tool.flags) !== JSON.stringify(['-q', '--ipa=1', '-v', 'es-419']) ||
      phonetic.recipeSha256 !== fileHash('scripts/content/es_phonemes.py') || phonetic.repeatIdentical !== true ||
      phonetic.probesSha256 !== fileHash('content/pronunciation-neighbors/es-probes.json')) throw new Error('Spanish phonetic source/model/recipe is stale. Regenerate Spanish transcriptions.');
  const ids = bank.map(item => item.id), indices = new Map(ids.map((id, index) => [id, index]));
  const entryIds = Object.keys(semantic.entries ?? {});
  if (entryIds.length !== ids.length || entryIds.some(id => !indices.has(id))) throw new Error('Unexpected Spanish semantic inventory.');
  const semanticRows = bank.map(item => {
    const entry = semantic.entries[item.id];
    if (entry.text !== item.text || entry.label !== item.label || !Array.isArray(entry.neighbors) || entry.neighbors.length !== ids.length - 1 ||
        new Set(entry.neighbors.map(([id]) => id)).size !== ids.length - 1 || entry.neighbors.some(([id, score], i, rows) =>
          id === item.id || !indices.has(id) || !Number.isFinite(score) || score < -1 || score > 1 ||
          (i > 0 && (score > rows[i - 1][1] || score === rows[i - 1][1] && stable(id, rows[i - 1][0]) < 0)))) throw new Error('Invalid or stale Spanish semantic ranking.');
    return entry.neighbors.map(([id]) => indices.get(id));
  });
  if (probeData?.language !== 'es-419' || !Array.isArray(probeData.probes) || !probeData.probes.length) throw new Error('Missing Spanish pronunciation probes.');
  const texts = new Set([...bank.map(item => item.text), ...probeData.probes.flatMap(probe => [probe.left, probe.right])]);
  if (Object.keys(phonetic.entries ?? {}).length !== texts.size || Object.keys(phonetic.entries).some(text => !texts.has(text))) throw new Error('Unexpected Spanish transcription inventory.');
  const transcriptions = new Map([...texts].map(text => {
    const entry = phonetic.entries[text];
    if (!entry || entry.normalized !== text.normalize('NFC').trim().toLowerCase() || typeof entry.ipa !== 'string') throw new Error('Missing or stale Spanish transcription: ' + text);
    const units = spanishPhonemeUnits(entry.ipa);
    if (units.filter(unit => unit === '|').length !== text.trim().split(/\s+/u).length - 1) throw new Error('Invalid Spanish lexical boundaries: ' + text);
    return [text, units];
  }));
  const probes = probeData.probes.map(probe => {
    const left = transcriptions.get(probe.left), right = transcriptions.get(probe.right);
    const same = JSON.stringify(left) === JSON.stringify(right);
    let passed;
    if (['same-pronunciation', 'normalization-equal'].includes(probe.expectation)) passed = same;
    else if (probe.expectation === 'distinct-pronunciation') passed = !same;
    else if (probe.expectation === 'retain-word-boundaries') passed = left.includes('|') && left.filter(unit => unit === '|').length === probe.left.trim().split(/\s+/u).length - 1;
    else throw new Error('Unknown Spanish pronunciation expectation.');
    if (!passed) throw new Error('Spanish phoneme normalization probe failed: ' + probe.id);
    return { id: probe.id, passed };
  });
  const units = bank.map(item => transcriptions.get(item.text));
  const pronunciationKeys = units.map(row => row.join('\u001f'));
  const pronunciation = bank.map((_, index) => bank.flatMap((other, position) => index === position || pronunciationKeys[index] === pronunciationKeys[position] ? [] :
    [{ position, id: other.id, distance: normalizedEditDistance(units[index], units[position]) }])
    .sort((a, b) => a.distance - b.distance || stable(a.id, b.id)).map(row => row.position));
  const exclusions = new Map();
  for (const [i, item] of bank.entries()) for (const id of item.pictureDistractorExclusions ?? []) {
    if (!indices.has(id) || id === item.id) throw new Error('Unknown Spanish picture exclusion.');
    const pair = [i, indices.get(id)].sort((a, b) => a - b);
    exclusions.set(pair.join(':'), pair);
  }
  const imageHashes = Object.fromEntries(bank.map(item => [item.id, { src: item.image.src, sha256: fileHash('public/' + item.image.src) }]));
  const sourceHashes = Object.fromEntries(['scripts/content/build-spanish-word-neighbors.mjs', 'scripts/content/spanish-neighbor-utils.mjs',
    'scripts/content/spanish-neighbor-metrics.mjs', 'src/core/spanish-pronunciation.ts', 'content/pronunciation-neighbors/es-probes.json'].map(path => [path, fileHash(path)]));
  const homophoneGroups = [...Map.groupBy(ids, (_, index) => pronunciationKeys[index]).values()].filter(group => group.length > 1);
  return { schemaVersion: 1, language: 'es-419', policyVersion: 'word-neighbors-v1',
    sourceDigest: semantic.sourceDigest, contentDigest: hash(JSON.stringify(bank)),
    preparationDigest: hash(JSON.stringify({ sourceHashes, imageHashes, semantic: fileHash('content/semantic-neighbors/es.json'), phonetic: fileHash('content/pronunciation-neighbors/es.json') })),
    semanticModel: { ...model, license: 'CC-BY-SA-3.0' },
    pronunciationMetric: 'Normalized unit phoneme Levenshtein distance with primary stress and lexical boundaries; all nonidentical canonical readings eligible',
    pronunciationModel: { id: 'espeak-ng', version: '1.52.0', sourceCommit: espeakRevision, license: 'GPL-3.0-or-later', normalization: 'canonical-es-419-yeismo-v1',
      normalizerSha256: sourceHashes['src/core/spanish-pronunciation.ts'], sourceHashes: phonetic.tool.sourceHashes },
    phonemeProbes: probes, homophoneGroups, ids, semantic: semanticRows, pronunciation, pronunciationKeys,
    pictureExclusionPairs: [...exclusions.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]) };
}

export function prepareSpanishWordNeighbors(check = process.argv.includes('--check')) {
  const output = buildSpanishWordNeighbors(spanishNeighborBank(root), read('content/semantic-neighbors/es.json'),
    read('content/pronunciation-neighbors/es.json'), read('content/pronunciation-neighbors/es-probes.json'));
  const file = resolve(root, 'content/semantic-neighbors/es-runtime.json');
  const text = JSON.stringify(output) + '\n';
  if (check) {
    if (readFileSync(file, 'utf8') !== text) throw new Error('Spanish runtime neighbor table is stale; regenerate selected sources if needed and run content:neighbors.');
  } else writeFileSync(file, text);
  console.log(`${check ? 'Verified' : 'Built'} runtime neighbors for ${output.ids.length} unique Spanish words (${Buffer.byteLength(text)} bytes); ${output.phonemeProbes.length} canonical pronunciation probes pass.`);
  return output;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepareSpanishWordNeighbors();
