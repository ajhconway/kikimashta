import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validListeningResponses } from './pronunciation-listening-review.mjs';

export function scoreListeningResponses(saved, report, key) {
  if (!validListeningResponses(saved, report) || key.inputDigest !== report.inputDigest) throw new Error('Responses/key do not match this experiment revision.');
  const rows = saved.responses.map(response => {
    const mapping = key.trials.find(row => row.trialId === response.trialId);
    if (!mapping || mapping.voice !== response.voice || !['baseline', 'weighted'].includes(mapping.A) || !['baseline', 'weighted'].includes(mapping.B) || mapping.A === mapping.B) throw new Error('Invalid blind key.');
    return { ...response, outcome: response.preference === null ? 'unanswered' : ['A', 'B'].includes(response.preference) ? mapping[response.preference] : response.preference };
  });
  function counts(group) {
    return Object.fromEntries(['baseline', 'weighted', 'tie', 'neither', 'uncertain', 'unanswered'].map(outcome => [outcome, group.filter(row => row.outcome === outcome).length]));
  }
  return { experimentId: report.experimentId, inputDigest: report.inputDigest, totals: counts(rows),
    unrevealed: counts(rows.filter(row => !row.revealed)), revealed: counts(rows.filter(row => row.revealed)),
    byVoice: Object.fromEntries(report.voices.map(voice => [voice.id, counts(rows.filter(row => row.voice === voice.id))])),
    note: 'Descriptive paired judgments only. Repeated voices of one target are not independent samples; no learner-difficulty or significance claim.', rows };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/content/score-pronunciation-listening.mjs /path/to/exported-responses.json');
  const folder = new URL('../../artifacts/pronunciation-neighbors-212/', import.meta.url);
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  console.log(JSON.stringify(scoreListeningResponses(read(process.argv[2]), read(new URL('listening.json', folder)), read(new URL('blind-key.json', folder))), null, 2));
}
