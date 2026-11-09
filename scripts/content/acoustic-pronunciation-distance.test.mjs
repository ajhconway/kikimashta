import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createAcousticDistance, weightedEditDistance } from './acoustic-pronunciation-distance.mjs';
import { compatibleTrio, evaluateBenchmark, validPair } from './compare-pronunciation-neighbors.mjs';

const folder = fileURLToPath(new URL('../../artifacts/pronunciation-neighbors-212/', import.meta.url));
const acoustic = createAcousticDistance(`${folder}/vendor`);

test('weighted alignment can use an insertion instead of expensive substitutions', () => {
  const substitution = (a, b) => a === b ? 0 : 1.5;
  assert.equal(weightedEditDistance(['a', 'b'], ['b', 'a', 'b'], substitution), 1);
  assert.equal(weightedEditDistance(['a'], ['b'], () => 9), 2);
  assert.throws(() => weightedEditDistance(['a'], ['b'], () => NaN), /Invalid/);
});

test('pinned acoustic distance preserves script identity and meaningful duration distinctions', () => {
  assert.equal(acoustic.distance('ｷｬｸ', 'きゃく'), 0);
  assert.equal(acoustic.distance('きて', 'きって'), 1 / 3);
  assert.equal(acoustic.distance('さん', 'さ'), .5);
  assert.equal(acoustic.distance('コヒ', 'コーヒ'), 1 / 3);
  assert.ok(acoustic.distance('かた', 'がた') > 0);
  assert.equal(acoustic.distance('かた', 'さた'), acoustic.distance('さた', 'かた'));
  assert.throws(() => acoustic.distance('漢字', 'かな'), /Unsupported/);
  assert.throws(() => acoustic.distance('ゎ', 'ゎ'), /Unsupported/);
});

const item = (id, image = id) => ({ id, language: 'ja-JP', text: id, image: { src: image } });
test('review choices enforce format-specific exclusions and search past incompatible alternatives', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(id => item(id));
  const exclusions = new Set(['a:b']);
  assert.equal(validPair(a, b, 'audio-picture', exclusions), false);
  assert.equal(validPair(a, b, 'audio-text', exclusions), true);
  assert.equal(validPair(a, item('other', 'a'), 'audio-picture', exclusions), false);
  assert.deepEqual(compatibleTrio([a, b, c, d], 'audio-picture', exclusions), [a, c, d]);
  assert.equal(compatibleTrio([a, b, c], 'audio-picture', exclusions), undefined);
});

test('unsupported benchmark probes remain visible and ties are not scored as successes', () => {
  const benchmark = { policy: { tieTolerance: 1e-9 }, triplets: [
    { target: 'か', closer: 'き', farther: 'く' }, { target: '漢字', closer: 'き', farther: 'く' },
  ] };
  const rows = evaluateBenchmark(benchmark, acoustic.distance);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].distances.baseline.result, 'tie');
  assert.equal(rows[1].distances.baseline.result, 'unsupported');
  assert.equal(rows[1].distances.weighted.result, 'unsupported');
});

test('archived comparison regenerates exactly and pins every acoustic input', () => {
  execFileSync(process.execPath, ['scripts/content/compare-pronunciation-neighbors.mjs', '--check'], { cwd: fileURLToPath(new URL('../..', import.meta.url)) });
  const results = JSON.parse(readFileSync(`${folder}/results.json`, 'utf8'));
  for (const [path, expected] of Object.entries(results.sourceDigests)) {
    const bytes = readFileSync(new URL(`../../${path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected);
  }
  const bank = new Map(JSON.parse(readFileSync(`${folder}/bank.json`, 'utf8')).map(item => [item.id, item]));
  const trials = JSON.parse(readFileSync(`${folder}/listening.json`, 'utf8')).trials;
  const key = JSON.parse(readFileSync(`${folder}/blind-key.json`, 'utf8')).trials;
  for (const target of new Set(key.map(row => row.targetId))) {
    const pair = key.filter(row => row.targetId === target);
    assert.equal(pair.length, 2);
    assert.notEqual(pair[0].A, pair[1].A);
    assert.notEqual(pair[0].voice, pair[1].voice);
  }
  for (const trial of trials) for (const item of [trial.target, ...trial.sides.A, ...trial.sides.B]) {
    assert.ok(bank.has(item.id));
    for (const clip of item.audio) assert.ok(readFileSync(new URL(`../../public${clip.src}`, import.meta.url)).length > 0);
  }
});
