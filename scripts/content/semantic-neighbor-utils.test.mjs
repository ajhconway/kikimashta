import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rankedNeighbors, evaluateNeighbors, validateResult, japaneseSemanticBank } from './semantic-neighbor-utils.mjs';

const item = (id, overrides = {}) => ({ id, language: 'ja-JP', text: id, reading: id, label: id,
  image: { src: `${id}.png` }, ...overrides });
const bank = [item('target'), item('related'), item('other')];
const result = { items: bank.map(({ id, language, text, label }) => ({ id, language, text, label })),
  cosineSimilarities: [[1, .8, .1], [.8, 1, .3], [.1, .3, 1]] };

test('neighbor rankings filter the selected scope before taking closest matches', () => {
  assert.deepEqual(rankedNeighbors(bank, result.cosineSimilarities, 'target', 'audio-picture', ['target', 'other']), [{ id: 'other', score: .1 }]);
  assert.deepEqual(rankedNeighbors(bank, result.cosineSimilarities, 'target').map(n => n.id), ['related', 'other']);
});

test('picture ambiguity is symmetric while written choices remain eligible', () => {
  const words = [bank[0], item('related', { pictureDistractorExclusions: ['target'] }), bank[2]];
  assert.deepEqual(rankedNeighbors(words, result.cosineSimilarities, 'target').map(n => n.id), ['other']);
  assert.equal(rankedNeighbors(words, result.cosineSimilarities, 'target', 'audio-text')[0].id, 'related');
});

test('homophones, duplicate visible choices, and another language cannot enter eligible neighbors', () => {
  const words = [item('target'), item('homophone', { reading: 'target' }),
    item('alias', { image: { src: 'target.png' } }), item('foreign', { language: 'es-419' }), item('valid')];
  const matrix = Array.from({ length: 5 }, () => [1, .9, .8, .7, .6]);
  assert.deepEqual(rankedNeighbors(words, matrix, 'target').map(n => n.id), ['valid']);
});

test('semantic diagnostics retain related concepts excluded from picture choices', () => {
  const words = [bank[0], item('related', { reading: 'target' }), bank[2]];
  assert.equal(rankedNeighbors(words, result.cosineSimilarities, 'target', 'semantic')[0].id, 'related');
  assert.deepEqual(rankedNeighbors(words, result.cosineSimilarities, 'target').map(n => n.id), ['other']);
});

test('comparison reports actual triplet failures and recall against incomplete positive sets', () => {
  const benchmark = { triplets: [
    { targetId: 'target', relatedId: 'related', unrelatedId: 'other', group: 'category' },
    { targetId: 'target', relatedId: 'other', unrelatedId: 'related', group: 'sense' },
  ], queries: [{ targetId: 'target', expectedUsefulIds: ['related'] }] };
  const report = evaluateNeighbors(result, bank, benchmark);
  assert.equal(report.triplets.passed, 1);
  assert.equal(report.triplets.failures[0].group, 'sense');
  assert.equal(report.triplets.macroGroupAccuracy, .5);
  assert.equal(report.querySummary.semantic.meanRecallAt5, 1);
});

test('stale inputs and malformed vectors fail instead of silently ranking another bank', () => {
  assert.throws(() => validateResult({ ...result, items: [] }, bank), /approved bank/);
  const broken = structuredClone(result);
  broken.cosineSimilarities[0][1] = NaN;
  assert.throws(() => validateResult(broken, bank), /Invalid cosine/);
  broken.cosineSimilarities[0][1] = .7;
  assert.throws(() => validateResult(broken, bank), /symmetric/);
});

test('the deployment candidate preserves the selected measured run, rather than mixing model scores', () => {
  const words = JSON.parse(readFileSync('artifacts/semantic-neighbors-198/bank.json', 'utf8'));
  const measured = JSON.parse(readFileSync('artifacts/semantic-neighbors-198/fasttext-results.json', 'utf8'));
  const candidate = JSON.parse(readFileSync('content/semantic-neighbors/ja.json', 'utf8'));
  validateResult(measured, words);
  assert.equal(candidate.model.id, measured.model.id);
  assert.equal(candidate.model.revision, measured.model.revision);
  const originalIds = new Set(words.map(word => word.id));
  for (const word of words) {
    const expected = rankedNeighbors(words, measured.cosineSimilarities, word.id, 'semantic').map(({ id, score }) => [id, score]);
    assert.deepEqual(candidate.entries[word.id].neighbors.filter(([id]) => originalIds.has(id)), expected);
  }
});

test('prepared runtime inputs include newly approved writing-only items from the current bank', () => {
  const words = japaneseSemanticBank(process.cwd());
  const candidate = JSON.parse(readFileSync('content/semantic-neighbors/ja.json', 'utf8'));
  assert.equal(words.length, Object.keys(candidate.entries).length);
  for (const word of words) assert.equal(candidate.entries[word.id].text, word.text);
});
