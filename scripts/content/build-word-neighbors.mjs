import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { bankDigest, japaneseSemanticBank } from './semantic-neighbor-utils.mjs';
import { pronunciationSimilarity } from '../../src/core/pronunciation.ts';
import { createWeightedPronunciationDistance, pronunciationModel } from './weighted-pronunciation.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const readJson = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const acoustic = createWeightedPronunciationDistance();

/** Build only index lists for the browser; model vectors and inference stay offline. */
export function buildWordNeighbors(bank, semantic, policy) {
  if (semantic.language !== 'ja-JP' || policy.language !== 'ja-JP' || semantic.sourceDigest !== bankDigest(bank) ||
      semantic.model.id !== 'facebook/fasttext-ja-vectors') throw new Error('Semantic data does not match the selected Japanese bank/model.');
  const ids = bank.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('Neighbor IDs must be unique.');
  const indices = new Map(ids.map((id, index) => [id, index]));
  function indexOf(id) {
    if (!indices.has(id)) throw new Error(`Unknown policy/neighbor ID: ${id}`);
    return indices.get(id);
  }
  const overrides = new Map();
  for (const entry of policy.semanticOverrides) {
    indexOf(entry.itemId);
    if (!entry.reason?.trim() || overrides.has(entry.itemId) || !Array.isArray(entry.neighborIds) ||
        entry.neighborIds.includes(entry.itemId) || new Set(entry.neighborIds).size !== entry.neighborIds.length) throw new Error('Invalid semantic override.');
    overrides.set(entry.itemId, entry.neighborIds.map(indexOf));
  }
  const exclusions = new Map();
  for (const pair of policy.pictureExclusionPairs) {
    if (!Array.isArray(pair.ids) || pair.ids.length !== 2 || pair.ids[0] === pair.ids[1] || !pair.reason?.trim()) throw new Error('Invalid picture exclusion pair.');
    const values = pair.ids.map(indexOf).sort((a, b) => a - b);
    exclusions.set(values.join(':'), values);
  }
  const semanticRows = bank.map(item => {
    const entry = semantic.entries[item.id];
    if (!entry || entry.text !== item.text || entry.label !== item.label || entry.neighbors.length !== bank.length - 1 ||
        new Set(entry.neighbors.map(([id]) => id)).size !== bank.length - 1 ||
        entry.neighbors.some(([id, score]) => id === item.id || !Number.isFinite(score) || score < -1 || score > 1)) throw new Error('Invalid or stale semantic ranking.');
    const row = entry.neighbors.map(([id]) => indexOf(id));
    return overrides.get(item.id) ?? row;
  });
  // Validate every approved reading, including words without an eligible neighbor.
  for (const item of bank) acoustic.distance(item.reading ?? item.text, item.reading ?? item.text);
  const pronunciation = bank.map((item, index) => bank.flatMap((other, position) => {
    if (index === position) return [];
    const score = pronunciationSimilarity(item.reading ?? item.text, other.reading ?? other.text);
    return score !== undefined && score >= .5 && score < 1 ? [{ position,
      distance: acoustic.distance(item.reading ?? item.text, other.reading ?? other.text) }] : [];
  }).sort((a, b) => a.distance - b.distance || a.position - b.position).map(value => value.position));
  return { schemaVersion: 1, language: 'ja-JP', sourceDigest: semantic.sourceDigest,
    policyDigest: createHash('sha256').update(JSON.stringify(policy)).digest('hex'),
    policyVersion: 'word-neighbors-v1', semanticModel: { id: semantic.model.id, revision: semantic.model.revision },
    pronunciationMetric: 'acoustic-weighted mora edit distance; baseline .5 <= similarity < 1 eligibility',
    pronunciationModel: { ...pronunciationModel, normalizationScale: acoustic.scale,
      moraNormalizerSha256: createHash('sha256').update(readFileSync(resolve(root, 'src/core/pronunciation.ts'))).digest('hex') },
    ids, semantic: semanticRows, pronunciation,
    pictureExclusionPairs: [...exclusions.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
  };
}

export function buildRuntimeNeighbors() {
  const bank = japaneseSemanticBank(root);
  const policy = readJson('content/semantic-neighbors/ja-policy.json');
  const reviewed = new Map(policy.imageReview.map(entry => [entry.itemId, entry]));
  for (const id of new Set(policy.pictureExclusionPairs.flatMap(pair => pair.ids))) {
    const item = bank.find(item => item.id === id), entry = reviewed.get(id);
    if (!item || !entry || item.image.src !== entry.src ||
        createHash('sha256').update(readFileSync(resolve(root, 'public', item.image.src))).digest('hex') !== entry.sha256) {
      throw new Error(`Picture ambiguity review is stale: ${id}`);
    }
  }
  const output = buildWordNeighbors(bank, readJson('content/semantic-neighbors/ja.json'), policy);
  const path = resolve(root, 'content/semantic-neighbors/ja-runtime.json');
  const text = JSON.stringify(output) + '\n';
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== text) throw new Error('Runtime neighbor table is stale; run npm run content:neighbors.');
    console.log(`Verified runtime neighbors for ${output.ids.length} Japanese words.`);
  } else {
    writeFileSync(path, text);
    console.log(`Built runtime neighbors for ${output.ids.length} Japanese words (${Buffer.byteLength(text)} bytes).`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildRuntimeNeighbors();
