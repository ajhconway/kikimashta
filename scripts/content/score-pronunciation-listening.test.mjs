import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreListeningResponses } from './score-pronunciation-listening.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('listening analysis decodes opposite A/B assignments without inventing missing votes', () => {
  const trials = Array.from({ length: 4 }, (_, i) => ({ id: String(i), defaultVoice: 'v' }));
  const report = { schemaVersion: 1, experimentId: 'pronunciation-neighbors-212', inputDigest: 'digest', trials, voices: [{ id: 'v' }] };
  const saved = { schemaVersion: 1, experimentId: report.experimentId, inputDigest: 'digest', responses: trials.map((trial, i) => ({
    trialId: trial.id, voice: 'v', preference: ['A', 'B', null, 'uncertain'][i], revealed: i === 1, notes: '',
  })) };
  const key = { inputDigest: 'digest', trials: trials.map(trial => ({ trialId: trial.id, voice: 'v', A: 'weighted', B: 'baseline' })) };
  const result = scoreListeningResponses(saved, report, key);
  assert.deepEqual(result.totals, { baseline: 1, weighted: 1, tie: 0, neither: 0, uncertain: 1, unanswered: 1 });
  assert.equal(result.revealed.baseline, 1);
  assert.equal(result.unrevealed.weighted, 1);
  assert.throws(() => scoreListeningResponses({ ...saved, inputDigest: 'stale' }, report, key), /do not match/);
});

test('collected responses keep their original revision and cannot mix with the new protocol digest', () => {
  const folder = new URL('../../artifacts/pronunciation-neighbors-212/', import.meta.url);
  const read = path => JSON.parse(readFileSync(new URL(path, folder), 'utf8'));
  const raw = read('collected/owner-responses.json');
  const report = read('collected/listening.json'), key = read('collected/blind-key.json');
  assert.deepEqual(scoreListeningResponses(raw, report, key), read('collected/scored-responses.json'));
  assert.throws(() => scoreListeningResponses(raw, read('listening.json'), read('blind-key.json')), /do not match/);
  const metadata = read('collected/provenance.json');
  for (const [path, expected] of Object.entries(metadata.sha256)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`collected/${path}`, folder))).digest('hex'), expected);
  }
});
