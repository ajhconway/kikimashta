import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, copyFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWeightedPronunciationDistance, pronunciationModel } from './weighted-pronunciation.mjs';
import { createAcousticDistance } from './acoustic-pronunciation-distance.mjs';
import { japaneseSemanticBank } from './semantic-neighbor-utils.mjs';
import { pronunciationSimilarity } from '../../src/core/pronunciation.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const selected = createWeightedPronunciationDistance();
const runtime = JSON.parse(readFileSync(join(root, 'content/semantic-neighbors/ja-runtime.json'), 'utf8'));

test('production acoustic distances exactly match the reviewed frozen method for all approved pairs', () => {
  const reviewed = createAcousticDistance(join(root, 'artifacts/pronunciation-neighbors-212/vendor'));
  const bank = japaneseSemanticBank(root);
  for (const a of bank) for (const b of bank) {
    assert.equal(selected.distance(a.reading ?? a.text, b.reading ?? b.text), reviewed.distance(a.reading ?? a.text, b.reading ?? b.text));
  }
});

test('runtime preserves eligible candidates but ranks them by acoustic distance with stable ties', () => {
  const bank = japaneseSemanticBank(root);
  for (let i = 0; i < bank.length; i++) {
    const reading = bank[i].reading ?? bank[i].text;
    const eligible = bank.flatMap((other, index) => {
      if (i === index) return [];
      const score = pronunciationSimilarity(reading, other.reading ?? other.text);
      return score >= .5 && score < 1 ? [index] : [];
    });
    assert.deepEqual([...runtime.pronunciation[i]].sort((a, b) => a - b), eligible);
    const expected = eligible.sort((a, b) => selected.distance(reading, bank[a].reading ?? bank[a].text) - selected.distance(reading, bank[b].reading ?? bank[b].text) || a - b);
    assert.deepEqual(runtime.pronunciation[i], expected);
  }
  assert.equal(runtime.pronunciationModel.revision, pronunciationModel.revision);
  assert.deepEqual(runtime.pronunciationModel.sourceHashes, pronunciationModel.sourceHashes);
});

test('future supported mora combinations work while length and same-reading identity remain explicit', () => {
  assert.equal(selected.distance('ギャン', 'ぎゃん'), 0);
  assert.ok(selected.distance('ぎゃん', 'きゃん') > 0);
  assert.equal(selected.distance('きて', 'きって'), 1 / 3);
  assert.equal(selected.distance('コヒ', 'コーヒ'), 1 / 3);
  assert.equal(selected.distance('かん', 'か'), .5);
  assert.throws(() => selected.distance('ゎ', 'ゎ'), /Unsupported/);
  assert.throws(() => selected.distance('漢字', 'かな'), /Unsupported/);
});

test('changed pinned table bytes are rejected before generating rankings', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'kikimashta-weighted-source-'));
  try {
    for (const name of Object.keys(pronunciationModel.sourceHashes)) copyFileSync(join(root, 'content/pronunciation-neighbors/kanasim', name), join(temporary, name));
    appendFileSync(join(temporary, 'distance_consonants_bi.csv'), '\n');
    assert.throws(() => createWeightedPronunciationDistance(temporary), /Acoustic source hash mismatch/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
