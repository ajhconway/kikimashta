import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreListeningResponses } from './score-pronunciation-listening.mjs';

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
