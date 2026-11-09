import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSpanishWordNeighbors, prepareSpanishWordNeighbors } from './build-spanish-word-neighbors.mjs';
import { spanishNeighborBank, spanishSemanticDigest } from './spanish-neighbor-utils.mjs';
import { normalizedEditDistance } from './spanish-neighbor-metrics.mjs';
import { spanishPhonemeUnits } from '../../src/core/spanish-pronunciation.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = path => JSON.parse(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'));
const bank = spanishNeighborBank(root), semantic = read('content/semantic-neighbors/es.json');
const phonetic = read('content/pronunciation-neighbors/es.json'), probes = read('content/pronunciation-neighbors/es-probes.json');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('selected Spanish production data exactly regenerate without model packages or eSpeak', () => {
  const output = prepareSpanishWordNeighbors(true);
  assert.equal(output.ids.length, bank.length);
  assert.ok(output.phonemeProbes.every(probe => probe.passed));
  assert.equal(output.phonemeProbes.length, 22);
  assert.equal(output.pictureExclusionPairs.length, 72);
  assert.equal(output.ids.length, new Set(output.ids).size);
  assert.deepEqual(output.homophoneGroups, []);
  assert.equal(output.semanticModel.id, 'facebook/fasttext-es-vectors');
  assert.equal(output.pronunciationModel.id, 'espeak-ng');
  assert.match(execFileSync(process.execPath, ['scripts/content/build-spanish-word-neighbors.mjs', '--check'], { cwd: root, encoding: 'utf8' }), /Verified runtime neighbors/);
});

test('Spanish pronunciation ordering retains full scope rankings, stress and unit-phone costs', () => {
  const output = buildSpanishWordNeighbors(bank, semantic, phonetic, probes);
  const units = bank.map(item => spanishPhonemeUnits(phonetic.entries[item.text].ipa));
  assert.equal(normalizedEditDistance(['p', 'ˈ', 'a'], ['p', 'a', 'ˈ']), 2 / 3);
  for (const [i, row] of output.pronunciation.entries()) {
    assert.equal(row.length, bank.length - 1);
    assert.ok(!row.includes(i));
    let previous = -1;
    for (const j of row) {
      const distance = normalizedEditDistance(units[i], units[j]);
      assert.ok(distance >= previous);
      assert.ok(distance > 0);
      previous = distance;
    }
  }
  assert.notDeepEqual(spanishPhonemeUnits(phonetic.entries.papa.ipa), spanishPhonemeUnits(phonetic.entries['papá'].ipa));
  assert.deepEqual(spanishPhonemeUnits(phonetic.entries.halla.ipa), spanishPhonemeUnits(phonetic.entries.haya.ipa));
  assert.notEqual(phonetic.entries.halla.ipa, phonetic.entries.haya.ipa);
});

test('Spanish preparation rejects stale membership, intended meanings, spelling and source recipes', () => {
  const label = structuredClone(bank); label[0].label += ' changed';
  assert.throws(() => buildSpanishWordNeighbors(label, semantic, phonetic, probes), /semantic.*stale/);
  assert.throws(() => buildSpanishWordNeighbors(bank.slice(1), semantic, phonetic, probes), /semantic.*stale/);
  const text = structuredClone(bank); text[0].text += ' cambiado';
  assert.throws(() => buildSpanishWordNeighbors(text, semantic, phonetic, probes), /semantic.*stale/);
  const reading = structuredClone(bank); reading[0].reading = 'changed';
  assert.throws(() => buildSpanishWordNeighbors(reading, semantic, phonetic, probes), /reading overrides/);
  const badRecipe = structuredClone(semantic); badRecipe.recipeSha256 = 'stale';
  assert.throws(() => buildSpanishWordNeighbors(bank, badRecipe, phonetic, probes), /semantic.*stale/);
  const badSource = structuredClone(phonetic); badSource.tool.sourceCommit = 'stale';
  assert.throws(() => buildSpanishWordNeighbors(bank, semantic, badSource, probes), /phonetic.*stale/);
});

test('Spanish preparation rejects missing, tied-order-invalid and nonfinite rankings/transcriptions', () => {
  const missing = structuredClone(semantic); missing.entries[bank[0].id].neighbors.pop();
  assert.throws(() => buildSpanishWordNeighbors(bank, missing, phonetic, probes), /semantic ranking/);
  const nonfinite = structuredClone(semantic); nonfinite.entries[bank[0].id].neighbors[0][1] = NaN;
  assert.throws(() => buildSpanishWordNeighbors(bank, nonfinite, phonetic, probes), /semantic ranking/);
  const missingPhone = structuredClone(phonetic); delete missingPhone.entries[bank[0].text];
  assert.throws(() => buildSpanishWordNeighbors(bank, semantic, missingPhone, probes), /transcription inventory/);
  const wrongPhone = structuredClone(phonetic); wrongPhone.entries[bank[0].text].normalized += ' changed';
  assert.throws(() => buildSpanishWordNeighbors(bank, semantic, wrongPhone, probes), /stale Spanish transcription/);
});

test('canonical same-pronunciation words are excluded from Spanish phoneme rows', () => {
  const small = bank.slice(0, 3).map((item, i) => ({ ...item, text: ['casa', 'caza', 'café'][i], pictureDistractorExclusions: [] }));
  const semanticFixture = { ...semantic, sourceDigest: spanishSemanticDigest(small), entries: Object.fromEntries(small.map(item => [item.id, {
    text: item.text, label: item.label, neighbors: small.filter(other => other.id !== item.id).map(other => [other.id, .5]).sort(([a], [b]) => a < b ? -1 : 1),
  }])) };
  const neededTexts = new Set([...small.map(item => item.text), ...probes.probes.flatMap(probe => [probe.left, probe.right])]);
  const phoneticFixture = { ...phonetic, sourceDigest: hash(small.map(({ id, language, text }) => ({ id, language, text }))),
    entries: Object.fromEntries([...neededTexts].map(text => [text, phonetic.entries[text]])) };
  const output = buildSpanishWordNeighbors(small, semanticFixture, phoneticFixture, probes);
  assert.equal(output.pronunciationKeys[0], output.pronunciationKeys[1]);
  assert.deepEqual(output.pronunciation[0], [2]);
  assert.deepEqual(output.pronunciation[1], [2]);
  assert.deepEqual(output.homophoneGroups, [[small[0].id, small[1].id]]);
});

test('canonical shared Food metadata and pack membership affect preparation identity', () => {
  const output = buildSpanishWordNeighbors(bank, semantic, phonetic, probes);
  const membership = structuredClone(bank); membership[0].packIds = [...membership[0].packIds, 'future'];
  assert.notEqual(buildSpanishWordNeighbors(membership, semantic, phonetic, probes).contentDigest, output.contentDigest);
  const exclusions = structuredClone(bank); exclusions[0].pictureDistractorExclusions = [bank[1].id];
  assert.notDeepEqual(buildSpanishWordNeighbors(exclusions, semantic, phonetic, probes).pictureExclusionPairs, output.pictureExclusionPairs);
  const rice = bank.find(item => item.text === 'arroz');
  assert.ok(rice.packIds.includes('es-419-food-1-pictures'));
  assert.ok(rice.packIds.includes('es-419-travel-1-pictures'));
});
