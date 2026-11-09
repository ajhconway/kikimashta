import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { evaluateSpanish } from './evaluate-spanish-neighbors.mjs';
import { spanishPictureCompatible, firstSpanishTrio, normalizedEditDistance } from './spanish-neighbor-utils.mjs';

const item = id => ({ id, language: 'es-419', image: { src: `${id}.png` }, pictureDistractorExclusions: [] });
test('Spanish picture trios backtrack around exclusions between alternatives', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(item);
  a.pictureDistractorExclusions.push('b');
  assert.equal(spanishPictureCompatible(a, b), false);
  assert.equal(spanishPictureCompatible(b, a), false);
  assert.deepEqual(firstSpanishTrio([a, b, c, d]), [a, c, d]);
  assert.equal(firstSpanishTrio([a, b, c]), undefined);
});

test('phoneme distance treats stress and boundaries as units rather than stripping them', () => {
  assert.equal(normalizedEditDistance(['t͡ʃ', 'a'], ['t͡ʃ', 'e']), .5);
  assert.ok(normalizedEditDistance(['p', 'ˈ', 'a'], ['p', 'a']) > 0);
  assert.ok(normalizedEditDistance(['a', '|', 'b'], ['a', 'b']) > 0);
  assert.throws(() => normalizedEditDistance([], ['a']), /Empty/);
});

test('frozen semantic and phonetic comparison regenerates without model packages', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  execFileSync(process.execPath, ['scripts/content/evaluate-spanish-neighbors.mjs', '--check'], { cwd: root });
  const metrics = JSON.parse(readFileSync(new URL('../../artifacts/spanish-neighbors-222/metrics.json', import.meta.url), 'utf8'));
  assert.equal(metrics.pictureInvariants.every(row => row.passed), true);
  assert.equal(metrics.phonetic.probes.filter(row => row.id === 'P08')[0].passed, false);
  assert.equal(metrics.humanReview.status, 'pending-human-review');
});

test('unblinded inspection has a valid Unicode-aware search script', () => {
  const html = readFileSync(new URL('../../artifacts/spanish-neighbors-222/inspection.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*)<\/script>/u)[1];
  assert.doesNotThrow(() => new Script(script));
});

test('picture-removed semantic positives are reported separately from raw recall', () => {
  const bank = ['water', 'glass', 'milk', 'car'].map((id, index) => ({ ...item(id), text: id, label: id, packId: 'fixture', index }));
  bank[0].pictureDistractorExclusions.push('glass');
  const matrix = [[1,.9,.8,.1],[.9,1,.6,.2],[.8,.6,1,.3],[.1,.2,.3,1]];
  const data = { items: bank.map(({ id, language, text, label }) => ({ id, language, text, label })), cosineSimilarities: matrix, model: { id: 'fixture' } };
  const benchmark = { policy: { tieTolerance: 1e-9 }, triplets: [], queries: [{ targetId: 'water', expectedUsefulIds: ['glass', 'milk'] }], phoneticProbes: [], pictureInvariants: [] };
  const phonetic = { entries: Object.fromEntries(bank.map(word => [word.text, { normalized: word.text, units: [word.id] }])) };
  const result = evaluateSpanish(bank, benchmark, data, data, phonetic);
  const query = result.semantic.fasttext.queries[0];
  assert.equal(query.rawRecallAt5, 1);
  assert.equal(query.pictureRecallAt5, 1);
  assert.deepEqual(query.pictureRemovedPositives, ['glass']);
  benchmark.queries[0].expectedUsefulIds = ['glass'];
  assert.equal(evaluateSpanish(bank, benchmark, data, data, phonetic).semantic.fasttext.meanPictureRecallAt5, null);
});
