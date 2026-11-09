import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { renderSpanishReview, validSpanishResponses } from './spanish-neighbor-review.mjs';

const item = (id, text = 'vaso') => ({ id, text, label: 'Drinking glass', image: { src: `/images/${id}.png`, alt: 'A glass' },
  audio: [{ voice: 'juan', src: `/audio/juan/${id}.mp3` }, { voice: 'albeiro', src: `/audio/albeiro/${id}.mp3` }] });
function fixture() {
  const trial = id => ({ id, target: item('target'), sides: { A: [item('a1'), item('a2'), item('a3')], B: [item('b1'), item('b2'), item('b3')] } });
  return { schemaVersion: 1, experimentId: 'spanish-neighbors-222', inputDigest: 'test-revision',
    voices: [{ id: 'juan', name: 'Juan', region: 'Mexico City' }, { id: 'albeiro', name: 'Albeiro', region: 'Bogotá' }],
    semanticTrials: [trial('semantic-1')], pronunciationTrials: [{ ...trial('pronunciation-1'), defaultVoice: 'albeiro' }] };
}
function saved(report) {
  return { schemaVersion: 1, experimentId: report.experimentId, inputDigest: report.inputDigest, semanticViewed: !report.pronunciationTrials.length, wordsViewed: !report.pronunciationTrials.length,
    responses: [...report.semanticTrials.map(trial => ({ trialId: trial.id, kind: 'semantic', voice: null, preference: null, notes: '', revealed: true, semanticExposure: false, priorWordExposure: false })),
      ...report.pronunciationTrials.map(trial => ({ trialId: trial.id, kind: 'pronunciation', voice: trial.defaultVoice, preference: null, notes: '', revealed: false, semanticExposure: false, priorWordExposure: false }))] };
}

test('renders visible semantic pictures and words, assigned-voice audio and pending answers', () => {
  const html = renderSpanishReview(fixture());
  assert.match(html, /role="tab" aria-selected="false" aria-controls="panel-semantic"/);
  assert.match(html, /role="tab" aria-selected="true" aria-controls="panel-pronunciation"/);
  assert.match(html, /id="panel-semantic" role="tabpanel" aria-labelledby="tab-semantic" hidden/);
  assert.doesNotMatch(html, /<img src=/);
  assert.match(html, /<img data-src="\/images\/target.png"/);
  assert.match(html, /Complete Pronunciation before Semantic relatedness/);
  assert.match(html, /lang="es">vaso<\/p>/);
  assert.match(html, /Drinking glass/);
  assert.equal((html.match(/<img /gu) ?? []).length, 14);
  assert.equal((html.match(/<audio controls /gu) ?? []).length, 7);
  assert.equal((html.match(/<div class="reveal-content" hidden>/gu) ?? []).length, 7);
  assert.match(html, /Assigned voice: <strong>Albeiro<\/strong> · Bogotá/);
  assert.match(html, /src="\/audio\/albeiro\/target.mp3"/);
  assert.match(html, /class="reveal" type="button" disabled/);
  assert.match(html, /Human review pending — 0 of 2 trials answered/);
  for (const preference of ['A', 'B', 'tie', 'neither', 'uncertain']) assert.equal((html.match(new RegExp(`value="${preference}"`, 'gu')) ?? []).length, 2);
});

test('strips method information, escapes markup and produces a parseable standalone script', () => {
  const report = fixture();
  report.methodKey = { A: 'method-secret-one', B: 'method-secret-two' };
  report.semanticTrials[0].scores = 'secret-scores';
  report.semanticTrials[0].target.text = '</script><script>evil()</script>&';
  report.semanticTrials[0].target.image.alt = 'Glass" onerror="evil()';
  report.semanticTrials[0].target.algorithm = 'secret-algorithm';
  report.voices[1].name = '<img onerror="evil()">';
  const html = renderSpanishReview(report);
  assert.doesNotMatch(html, /method-secret|secret-scores|secret-algorithm/);
  assert.match(html, /&lt;\/script&gt;&lt;script&gt;evil\(\)&lt;\/script&gt;&amp;/);
  assert.match(html, /alt="Glass&quot; onerror=&quot;evil\(\)"/);
  assert.match(html, /&lt;img onerror=&quot;evil\(\)&quot;&gt;/);
  assert.equal((html.match(/<script>/gu) ?? []).length, 1);
  const script = html.match(/<script>([\s\S]*)<\/script>/u)[1];
  assert.doesNotMatch(script, /<script>|<\/script>/);
  assert.doesNotThrow(() => new Script(script));
});

test('rejects untrusted paths, missing assigned audio and malformed trial inventories', () => {
  for (const src of ['https://example.com/a.png', '/images/../secret.png', '/images/./a.png', '/images//a.png', '/images/%2e%2e/a.png', '/audio/a.mp3', '/images/a.png" onerror="evil()']) {
    const report = fixture(); report.semanticTrials[0].target.image.src = src;
    assert.throws(() => renderSpanishReview(report), /Invalid Spanish item\/media/);
  }
  for (const src of ['javascript:evil()', 'https://example.com/a.mp3', '/audio/../a.mp3', '/images/a.mp3']) {
    const report = fixture(); report.pronunciationTrials[0].target.audio[0].src = src;
    assert.throws(() => renderSpanishReview(report), /Invalid Spanish item\/media/);
  }
  const missing = fixture(); missing.pronunciationTrials[0].sides.A[0].audio.pop();
  assert.throws(() => renderSpanishReview(missing), /Missing assigned Spanish voice/);
  const duplicate = fixture(); duplicate.pronunciationTrials[0].id = duplicate.semanticTrials[0].id;
  assert.throws(() => renderSpanishReview(duplicate), /Invalid Spanish trial inventory/);
  const incomplete = fixture(); incomplete.semanticTrials[0].sides.B.pop();
  assert.throws(() => renderSpanishReview(incomplete), /Invalid Spanish trial sides/);
});

test('supports omitted pronunciation comparisons without enabling an empty tab', () => {
  const report = fixture(); report.pronunciationTrials = [];
  const html = renderSpanishReview(report);
  assert.match(html, /aria-controls="panel-pronunciation" tabindex="-1" disabled/);
  assert.match(html, /Human review pending — 0 of 1 trials answered/);
  assert.equal((html.match(/<audio controls /gu) ?? []).length, 0);
  assert.equal(validSpanishResponses(saved(report), report), true);
  const hidden = saved(report); hidden.semanticViewed = false;
  assert.equal(validSpanishResponses(hidden, report), false);
  report.semanticTrials = [];
  assert.throws(() => renderSpanishReview(report), /Invalid Spanish trial inventory/);
});

test('restores only this revision, inventory order, kind, voice and valid response fields', () => {
  const report = fixture();
  assert.equal(validSpanishResponses(saved(report), report), true);
  const stale = saved(report); delete stale.semanticViewed;
  assert.equal(validSpanishResponses(stale, report), false);
  const staleResponse = saved(report); delete staleResponse.responses[1].semanticExposure;
  assert.equal(validSpanishResponses(staleResponse, report), false);
  const exposed = saved(report); exposed.semanticViewed = true; exposed.wordsViewed = true; exposed.responses[1].semanticExposure = true; exposed.responses[1].priorWordExposure = true;
  assert.equal(validSpanishResponses(exposed, report), true);
  exposed.semanticViewed = false;
  assert.equal(validSpanishResponses(exposed, report), false);
  for (const preference of ['A', 'B', 'tie', 'neither', 'uncertain']) {
    const responses = saved(report); responses.responses[1].preference = preference;
    responses.responses[1].revealed = true;
    responses.wordsViewed = true;
    assert.equal(validSpanishResponses(responses, report), true);
  }
  for (const [index, override] of [[0, { voice: 'juan' }], [0, { revealed: false }], [0, { kind: 'pronunciation' }],
    [1, { voice: 'juan' }], [1, { trialId: 'another-trial' }], [1, { preference: 'method-a' }],
    [1, { notes: 'x'.repeat(4001) }], [1, { notes: 123 }], [1, { revealed: 'yes' }], [1, { semanticExposure: 'yes' }], [1, { priorWordExposure: 'yes' }]]) {
    const responses = saved(report); Object.assign(responses.responses[index], override);
    assert.equal(validSpanishResponses(responses, report), false);
  }
  for (const override of [{ schemaVersion: 2 }, { experimentId: 'practice' }, { inputDigest: 'old' }, { responses: [] }]) {
    assert.equal(validSpanishResponses({ ...saved(report), ...override }, report), false);
  }
  const reversed = saved(report); reversed.responses.reverse();
  assert.equal(validSpanishResponses(reversed, report), false);
  assert.equal(validSpanishResponses(null, report), false);
});

test('requires consistent cross-trial word exposure flags and rejects the prior protocol', () => {
  const report = fixture();
  const missingGlobal = saved(report); delete missingGlobal.wordsViewed;
  assert.equal(validSpanishResponses(missingGlobal, report), false);
  const missingPrior = saved(report); delete missingPrior.responses[1].priorWordExposure;
  assert.equal(validSpanishResponses(missingPrior, report), false);
  const revealed = saved(report); revealed.responses[1].revealed = true;
  assert.equal(validSpanishResponses(revealed, report), false);
  revealed.wordsViewed = true;
  assert.equal(validSpanishResponses(revealed, report), true);
  revealed.responses[1].priorWordExposure = true;
  assert.equal(validSpanishResponses(revealed, report), true);
  const semanticExposure = saved(report); semanticExposure.semanticViewed = true;
  assert.equal(validSpanishResponses(semanticExposure, report), false);
  semanticExposure.wordsViewed = true;
  assert.equal(validSpanishResponses(semanticExposure, report), true);
  semanticExposure.responses[1].semanticExposure = true;
  assert.equal(validSpanishResponses(semanticExposure, report), false);
  semanticExposure.responses[1].priorWordExposure = true;
  assert.equal(validSpanishResponses(semanticExposure, report), true);
  const impossiblePrior = saved(report); impossiblePrior.responses[1].priorWordExposure = true;
  assert.equal(validSpanishResponses(impossiblePrior, report), false);
  for (const semanticAnswer of [{ preference: 'A' }, { notes: 'These meanings are closer.' }]) {
    const semanticAnswered = saved(report); Object.assign(semanticAnswered.responses[0], semanticAnswer);
    assert.equal(validSpanishResponses(semanticAnswered, report), false);
    semanticAnswered.semanticViewed = true; semanticAnswered.wordsViewed = true;
    assert.equal(validSpanishResponses(semanticAnswered, report), true);
  }
});
