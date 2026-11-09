import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWordNeighbors } from './build-word-neighbors.mjs';
import { bankDigest } from './semantic-neighbor-utils.mjs';

const bank = [
  { id: 'umbrella', text: '傘', reading: 'かさ', label: 'Umbrella', language: 'ja-JP' },
  { id: 'umbrella-alias', text: 'カサ', reading: 'カサ', label: 'Umbrella alias', language: 'ja-JP' },
  { id: 'shape', text: '型', reading: 'かた', label: 'Shape', language: 'ja-JP' },
  { id: 'dog', text: '犬', reading: 'いぬ', label: 'Dog', language: 'ja-JP' },
];
const source = () => ({ language: 'ja-JP', sourceDigest: bankDigest(bank),
  model: { id: 'facebook/fasttext-ja-vectors', revision: 'pinned' },
  entries: Object.fromEntries(bank.map(item => [item.id, { text: item.text, label: item.label,
    neighbors: bank.filter(other => other !== item).map(other => [other.id, .5]) }])) });
const policy = () => ({ language: 'ja-JP', semanticOverrides: [], pictureExclusionPairs: [] });

test('runtime table preserves full semantic ranks and replaces wrong-sense rows with bounded overrides', () => {
  const selected = policy();
  selected.semanticOverrides.push({ itemId: 'umbrella', neighborIds: ['shape'], reason: 'Intended concept' });
  const output = buildWordNeighbors(bank, source(), selected);
  assert.deepEqual(output.semantic[0], [2]);
  assert.equal(output.semantic[2].length, 3);
});

test('pronunciation suggestions normalize kana, exclude homophones and keep distinct close readings', () => {
  const output = buildWordNeighbors(bank, source(), policy());
  assert.deepEqual(output.pronunciation[0], [2]);
  assert.deepEqual(output.pronunciation[1], [2]);
  assert.deepEqual(output.pronunciation[3], []);
});

test('exclusions are symmetric compact pairs and bad policy IDs fail before writing', () => {
  const selected = policy();
  selected.pictureExclusionPairs.push({ ids: ['shape', 'umbrella'], reason: 'Reviewed overlap' });
  assert.deepEqual(buildWordNeighbors(bank, source(), selected).pictureExclusionPairs, [[0, 2]]);
  selected.pictureExclusionPairs.push({ ids: ['umbrella', 'missing'], reason: 'Bad ID' });
  assert.throws(() => buildWordNeighbors(bank, source(), selected), /Unknown policy/);
  const stale = source(); stale.sourceDigest = 'stale';
  assert.throws(() => buildWordNeighbors(bank, stale, policy()), /does not match/);
});
