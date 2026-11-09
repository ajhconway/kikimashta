import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { renderListeningReview, validListeningResponses } from './pronunciation-listening-review.mjs';

const item = (id, text = 'かみ') => ({ id, text, reading: 'かみ', label: 'Paper',
  audio: [{ voice: 'otani', src: `/audio/otani/${id}.mp3` }, { voice: 'morioki', src: `/audio/morioki/${id}.mp3` }] });
function fixture() {
  return { schemaVersion: 1, experimentId: 'pronunciation-neighbors-212', inputDigest: 'fixture-digest',
    voices: [{ id: 'otani', name: 'Otani' }, { id: 'morioki', name: 'Morioki' }],
    trials: [{ id: 'trial-1', target: item('target'), sides: { A: [item('a1'), item('a2'), item('a3')],
      B: [item('b1'), item('b2'), item('b3')] }, defaultVoice: 'otani' }] };
}
function saved(report, overrides = {}) {
  return { schemaVersion: 1, experimentId: report.experimentId, inputDigest: report.inputDigest,
    responses: report.trials.map(trial => ({ trialId: trial.id, voice: trial.defaultVoice, preference: null,
      notes: '', revealed: false, ...overrides })) };
}

test('renders a pending, blinded, assigned-voice comparison with native audio', () => {
  const report = fixture();
  report.methodKey = { A: 'baseline-secret', B: 'weighted-secret' };
  report.trials[0].sides.A[0].score = 'hidden-score';
  const html = renderListeningReview(report);
  assert.match(html, /Human review pending — 0 of 1 trials answered/);
  assert.equal((html.match(/<audio controls /gu) ?? []).length, 7);
  assert.equal((html.match(/<p class="word" hidden>/gu) ?? []).length, 7);
  assert.match(html, /src="\/audio\/otani\/target.mp3"/);
  assert.match(html, /Assigned voice: <strong>Otani<\/strong>/);
  assert.doesNotMatch(html, /<select|baseline-secret|weighted-secret|hidden-score/);
  for (const value of ['A', 'B', 'tie', 'neither', 'uncertain']) assert.match(html, new RegExp(`value="${value}"`));
  assert.match(html, /Export responses/);
});

test('escapes visible and embedded data without creating executable markup', () => {
  const report = fixture();
  report.trials[0].target.text = '</script><script>evil()</script>&';
  report.voices[0].name = '<img onerror="evil()">';
  const html = renderListeningReview(report);
  assert.match(html, /&lt;\/script&gt;&lt;script&gt;evil\(\)&lt;\/script&gt;&amp;/);
  assert.match(html, /&lt;img onerror=&quot;evil\(\)&quot;&gt;/);
  assert.equal((html.match(/<script>/gu) ?? []).length, 1);
  const script = html.match(/<script>([\s\S]*)<\/script>/u)[1];
  assert.doesNotMatch(script, /<script>|<\/script>/);
  assert.doesNotThrow(() => new Script(script));
});

test('rejects missing or unsafe media and incomplete comparisons', () => {
  for (const src of ['https://example.com/a.mp3', 'javascript:evil()', '/audio/../secret.mp3', '/images/a.png', '/audio/otani/a.mp3" onerror="evil()']) {
    const report = fixture();
    report.trials[0].target.audio[0].src = src;
    assert.throws(() => renderListeningReview(report), /Invalid listening item\/audio/);
  }
  const missingVoice = fixture();
  missingVoice.trials[0].target.audio.pop();
  assert.throws(() => renderListeningReview(missingVoice), /Invalid listening item\/audio/);
  const missingCandidate = fixture();
  missingCandidate.trials[0].sides.A.pop();
  assert.throws(() => renderListeningReview(missingCandidate), /Invalid listening trial/);
});

test('restores only complete matching trial inventories and assigned voices', () => {
  const report = fixture();
  assert.equal(validListeningResponses(saved(report), report), true);
  for (const preference of ['A', 'B', 'tie', 'neither', 'uncertain']) {
    assert.equal(validListeningResponses(saved(report, { preference, notes: 'Different vowel', revealed: true }), report), true);
  }
  for (const overrides of [{ voice: 'morioki' }, { trialId: 'other' }, { preference: 'weighted' },
    { notes: 3 }, { notes: 'x'.repeat(4001) }, { revealed: 'yes' }]) {
    assert.equal(validListeningResponses(saved(report, overrides), report), false);
  }
  for (const overrides of [{ inputDigest: 'stale' }, { experimentId: 'practice' }, { responses: [] },
    { responses: [...saved(report).responses, ...saved(report).responses] }, { schemaVersion: 2 }]) {
    assert.equal(validListeningResponses({ ...saved(report), ...overrides }, report), false);
  }
  assert.equal(validListeningResponses(null, report), false);
});
