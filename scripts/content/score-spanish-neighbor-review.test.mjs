import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  pending.semanticViewed = true;
  pending.wordsViewed = true;
  responses[report.semanticTrials.length].preference = 'tie';
  const scored = scoreSpanishResponses(pending, report, key);
  assert.equal(scored.semantic[key.trials.find(row => row.trialId === responses[0].trialId).A], 1);
  assert.equal(scored.pronunciation.tie, 1);
  assert.equal(scored.pronunciationUnrevealed.tie, 1);
  assert.equal(scored.pronunciationUnexposed.tie, 1);
  pending.semanticViewed = true;
  pending.wordsViewed = true;
  responses[report.semanticTrials.length].semanticExposure = true;
  assert.throws(() => scoreSpanishResponses(pending, report, key), /do not match/);
  responses[report.semanticTrials.length].priorWordExposure = true;
  const exposed = scoreSpanishResponses(pending, report, key);
  assert.equal(exposed.pronunciationAfterSemanticExposure.tie, 1);
  assert.equal(exposed.pronunciationAfterWordExposure.tie, 1);
  assert.equal(exposed.pronunciationUnexposed.tie, 0);
  responses[report.semanticTrials.length].revealed = true;
  assert.equal(scoreSpanishResponses(pending, report, key).pronunciationRevealed.tie, 1);
  assert.throws(() => scoreSpanishResponses({ ...pending, inputDigest: 'stale' }, report, key), /do not match/);
});


test('collected partial owner export retains exact revision, exposure and nine missing judgments', () => {
  const folder = new URL('../../artifacts/spanish-neighbors-222/', import.meta.url);
  const collected = new URL('collected/', folder);
  const read = name => JSON.parse(readFileSync(new URL(name, collected), 'utf8'));
  const provenance = read('provenance.json');
  const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
  for (const [name, sha] of Object.entries(provenance.files)) assert.equal(hash(new URL(name, collected)), sha, name);
  for (const [name, sha] of Object.entries(provenance.frozenReviewFiles)) assert.equal(hash(new URL(name, folder)), sha, name);
  const report = read('review-data.json'), key = read('blind-key.json');
  assert.equal(report.inputDigest, provenance.inputDigest);
  const scored = scoreSpanishResponses(read('owner-responses.json'), report, key);
  assert.deepEqual(scored, read('scored-responses.json'));
  assert.deepEqual(scored.semantic, { e5: 3, fasttext: 6, neither: 1, tie: 2, unanswered: 0, uncertain: 0 });
  assert.deepEqual(scored.pronunciation, { letters: 7, neither: 0, phones: 7, tie: 5, unanswered: 9, uncertain: 0 });
  const answered = scored.rows.filter(row => row.kind === 'pronunciation' && row.preference !== null);
  assert.equal(answered.length, 19);
  assert.ok(answered.every(row => row.semanticExposure && row.priorWordExposure && !row.revealed));
  const byTrial = new Map(report.pronunciationTrials.map(trial => [trial.id, trial]));
  assert.equal(new Set(answered.map(row => byTrial.get(row.trialId).target.id)).size, 7);
  assert.equal(scored.pronunciationUnexposed.unanswered, 9);
  assert.equal((scored.pronunciationUnexposed.letters ?? 0) + (scored.pronunciationUnexposed.phones ?? 0) + scored.pronunciationUnexposed.tie, 0);
});
