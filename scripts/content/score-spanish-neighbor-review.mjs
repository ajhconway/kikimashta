import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validSpanishResponses } from './spanish-neighbor-review.mjs';

export function scoreSpanishResponses(saved, report, key) {
  if (!validSpanishResponses(saved, report) || key.inputDigest !== report.inputDigest) throw new Error('Spanish responses/key do not match this revision.');
  const rows = saved.responses.map(response => {
    const mapping = key.trials.find(row => row.trialId === response.trialId);
    if (!mapping || mapping.kind !== response.kind || mapping.voice !== response.voice || mapping.A === mapping.B || !mapping.A || !mapping.B) throw new Error('Invalid Spanish blind key.');
    return { ...response, outcome: response.preference === null ? 'unanswered' : ['A', 'B'].includes(response.preference) ? mapping[response.preference] : response.preference };
  });
  const counts = group => Object.fromEntries([...new Set([...group.map(row => row.outcome), 'tie', 'neither', 'uncertain', 'unanswered'])].sort().map(outcome => [outcome, group.filter(row => row.outcome === outcome).length]));
  return { experimentId: report.experimentId, inputDigest: report.inputDigest,
    semantic: counts(rows.filter(row => row.kind === 'semantic')),
    pronunciation: counts(rows.filter(row => row.kind === 'pronunciation')),
    pronunciationByVoice: Object.fromEntries(report.voices.map(voice => [voice.id, counts(rows.filter(row => row.kind === 'pronunciation' && row.voice === voice.id))])),
    pronunciationUnexposed: counts(rows.filter(row => row.kind === 'pronunciation' && !row.revealed && !row.priorWordExposure)),
    pronunciationAfterWordExposure: counts(rows.filter(row => row.kind === 'pronunciation' && row.priorWordExposure)),
    pronunciationAfterSemanticExposure: counts(rows.filter(row => row.kind === 'pronunciation' && row.semanticExposure)),
    pronunciationUnrevealed: counts(rows.filter(row => row.kind === 'pronunciation' && !row.revealed)),
    pronunciationRevealed: counts(rows.filter(row => row.kind === 'pronunciation' && row.revealed)),
    semanticViewed: saved.semanticViewed, wordsViewed: saved.wordsViewed,
    note: 'Semantic text is visible by design. Unexposed listening requires both no reveal and no prior word exposure from any trial or the semantic section. Repeated targets/voices from one reviewer are dependent; no significance or learner-effectiveness claim.', rows };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/content/score-spanish-neighbor-review.mjs /path/to/spanish-neighbors-222-responses.json');
  const folder = new URL('../../artifacts/spanish-neighbors-222/', import.meta.url);
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  console.log(JSON.stringify(scoreSpanishResponses(read(process.argv[2]), read(new URL('review-data.json', folder)), read(new URL('blind-key.json', folder))), null, 2));
}
