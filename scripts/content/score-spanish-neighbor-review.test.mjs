import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreSpanishResponses } from './score-spanish-neighbor-review.mjs';

test('Spanish scoring separates method/voice/reveal groups and preserves missing judgments', () => {
  const folder = new URL('../../artifacts/spanish-neighbors-222/', import.meta.url);
  const report = JSON.parse(readFileSync(new URL('review-data.json', folder), 'utf8'));
  const key = JSON.parse(readFileSync(new URL('blind-key.json', folder), 'utf8'));
  const responses = [...report.semanticTrials.map(trial => ({ trialId: trial.id, kind: 'semantic', voice: null, preference: null, notes: '', revealed: true, semanticExposure: false, priorWordExposure: false })),
    ...report.pronunciationTrials.map(trial => ({ trialId: trial.id, kind: 'pronunciation', voice: trial.defaultVoice, preference: null, notes: '', revealed: false, semanticExposure: false, priorWordExposure: false }))];
  const pending = { schemaVersion: 1, experimentId: report.experimentId, inputDigest: report.inputDigest, semanticViewed: false, wordsViewed: false, responses };
  const empty = scoreSpanishResponses(pending, report, key);
  assert.equal(empty.semantic.unanswered, report.semanticTrials.length);
  assert.equal(empty.pronunciation.unanswered, report.pronunciationTrials.length);
  responses[0].preference = 'A';
  responses[report.semanticTrials.length].preference = 'tie';
  const scored = scoreSpanishResponses(pending, report, key);
  assert.equal(scored.semantic[key.trials.find(row => row.trialId === responses[0].trialId).A], 1);
  assert.equal(scored.pronunciation.tie, 1);
  assert.equal(scored.pronunciationUnrevealed.tie, 1);
  assert.equal(scored.pronunciationUnexposed.tie, 1);
  pending.semanticViewed = true;
  pending.wordsViewed = true;
  responses[report.semanticTrials.length].semanticExposure = true;
  responses[report.semanticTrials.length].priorWordExposure = true;
  const exposed = scoreSpanishResponses(pending, report, key);
  assert.equal(exposed.pronunciationAfterSemanticExposure.tie, 1);
  assert.equal(exposed.pronunciationAfterWordExposure.tie, 1);
  assert.equal(exposed.pronunciationUnexposed.tie, 0);
  responses[report.semanticTrials.length].revealed = true;
  assert.equal(scoreSpanishResponses(pending, report, key).pronunciationRevealed.tie, 1);
  assert.throws(() => scoreSpanishResponses({ ...pending, inputDigest: 'stale' }, report, key), /do not match/);
});
