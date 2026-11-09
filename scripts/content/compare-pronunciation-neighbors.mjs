import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { japaneseSemanticBank } from './semantic-neighbor-utils.mjs';
import { japanesePronunciationKey, pronunciationSimilarity } from '../../artifacts/pronunciation-neighbors-212/baseline-pronunciation.ts';
import { createAcousticDistance } from './acoustic-pronunciation-distance.mjs';
import { renderListeningReview } from './pronunciation-listening-review.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const folder = resolve(root, 'artifacts/pronunciation-neighbors-212');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, null, 2) + '\n';
const sound = item => item.reading ?? item.text;
const key = (a, b) => [a, b].sort().join(':');
const round = value => Number(value.toFixed(8));

export function validPair(a, b, exercise, excluded) {
  if (a.id === b.id || a.language !== b.language) return false;
  if (exercise === 'audio-text') return a.text.normalize('NFKC').trim() !== b.text.normalize('NFKC').trim();
  return a.image.src !== b.image.src && !excluded.has(key(a.id, b.id)) &&
    !a.pictureDistractorExclusions?.includes(b.id) && !b.pictureDistractorExclusions?.includes(a.id);
}

export function compatibleTrio(candidates, exercise, excluded) {
  function search(chosen, start) {
    if (chosen.length === 3) return chosen;
    for (let i = start; i < candidates.length; i++) {
      if (chosen.every(other => validPair(candidates[i], other, exercise, excluded))) {
        const result = search([...chosen, candidates[i]], i + 1);
        if (result) return result;
      }
    }
    return undefined;
  }
  return search([], 0);
}

export function evaluateBenchmark(benchmark, weighted) {
  return benchmark.triplets.map(row => {
    const distances = {};
    for (const [name, distance] of Object.entries({ baseline: (a, b) => {
      const value = pronunciationSimilarity(a, b);
      if (value === undefined) throw new Error('Unsupported baseline reading.');
      return 1 - value;
    }, weighted })) {
      try {
        const closer = distance(row.target, row.closer), farther = distance(row.target, row.farther);
        distances[name] = { closer: round(closer), farther: round(farther),
          result: Math.abs(closer - farther) <= benchmark.policy.tieTolerance ? 'tie' : closer < farther ? 'ordered' : 'reversed' };
      } catch (error) { distances[name] = { result: 'unsupported', error: error.message }; }
    }
    return { ...row, distances };
  });
}

export function runComparison(bank, policy, benchmark, acoustic) {
  const excluded = new Set(policy.pictureExclusionPairs.map(pair => key(...pair.ids)));
  const byId = new Map(bank.map(item => [item.id, item]));
  const baseline = new Map(), weighted = new Map(), collisions = [];
  for (const a of bank) for (const b of bank) {
    const similarity = pronunciationSimilarity(sound(a), sound(b));
    if (similarity === undefined) throw new Error(`Unsupported bank reading: ${a.id}`);
    const distance = acoustic.distance(sound(a), sound(b));
    baseline.set(`${a.id}:${b.id}`, 1 - similarity);
    weighted.set(`${a.id}:${b.id}`, distance);
    if (a.id < b.id && distance === 0 && japanesePronunciationKey(sound(a)) !== japanesePronunciationKey(sound(b))) collisions.push([a.id, b.id]);
  }
  const scopes = [
    ...['audio-picture', 'audio-text'].map(exercise => ({ id: `all-${exercise}`, exercise })),
    ...[1, 2, 3, 4, 5].flatMap(sourceLevel => ['audio-picture', 'audio-text'].map(exercise => ({ id: `level-${sourceLevel}-${exercise}`, sourceLevel, exercise }))),
  ];
  const all = {}, scopeResults = [];
  for (const scope of scopes) {
    const pool = bank.filter(item => (!scope.sourceLevel || item.sourceLevel === scope.sourceLevel) && item.wordExercises.includes(scope.exercise));
    const rows = pool.map(target => {
      const candidates = pool.filter(other => validPair(target, other, scope.exercise, excluded) &&
        japanesePronunciationKey(sound(target)) !== japanesePronunciationKey(sound(other)) &&
        baseline.get(`${target.id}:${other.id}`) > 0 && baseline.get(`${target.id}:${other.id}`) <= .5);
      const rank = scores => [...candidates].sort((a, b) => scores.get(`${target.id}:${a.id}`) - scores.get(`${target.id}:${b.id}`) || a.id.localeCompare(b.id, 'en'));
      const b = rank(baseline), w = rank(weighted), bs = b.slice(0, 6), ws = w.slice(0, 6);
      const bt = compatibleTrio(bs, scope.exercise, excluded), wt = compatibleTrio(ws, scope.exercise, excluded);
      const set = values => values.map(item => item.id).sort().join(',');
      return { itemId: target.id, eligible: candidates.length,
        baseline: bs.map(item => [item.id, round(baseline.get(`${target.id}:${item.id}`))]),
        weighted: ws.map(item => [item.id, round(weighted.get(`${target.id}:${item.id}`))]),
        baselineTrio: bt?.map(item => item.id) ?? null, weightedTrio: wt?.map(item => item.id) ?? null,
        changedShortlist: set(bs) !== set(ws), changedTrio: Boolean(bt && wt && set(bt) !== set(wt)),
        baselineTieAtSix: b.length > 6 && Math.abs(baseline.get(`${target.id}:${b[5].id}`) - baseline.get(`${target.id}:${b[6].id}`)) < 1e-9,
      };
    });
    all[scope.id] = rows;
    scopeResults.push({ ...scope, words: pool.length, withCandidates: rows.filter(row => row.eligible).length,
      baselineCompleteTrios: rows.filter(row => row.baselineTrio).length,
      weightedCompleteTrios: rows.filter(row => row.weightedTrio).length,
      changedShortlists: rows.filter(row => row.changedShortlist).length,
      changedTrios: rows.filter(row => row.changedTrio).length,
      baselineTiesAtSix: rows.filter(row => row.baselineTieAtSix).length });
  }
  const benchmarkRows = evaluateBenchmark(benchmark, acoustic.distance);
  const counts = {};
  for (const group of ['invariant', 'exploratory']) {
    counts[group] = {};
    for (const method of ['baseline', 'weighted']) counts[group][method] = Object.fromEntries(
      ['ordered', 'tie', 'reversed', 'unsupported'].map(result => [result, benchmarkRows.filter(row => row.classification === group && row.distances[method].result === result).length]));
  }
  const sourceFiles = ['scripts/content/acoustic-pronunciation-distance.mjs', 'scripts/content/compare-pronunciation-neighbors.mjs',
    'scripts/content/pronunciation-listening-review.mjs',
    'artifacts/pronunciation-neighbors-212/baseline-pronunciation.ts', ...['distance_consonants_bi.csv', 'distance_vowels_bi.csv', 'kana2phonome_bi.csv'].map(name => `artifacts/pronunciation-neighbors-212/vendor/${name}`)];
  const sourceDigests = Object.fromEntries(sourceFiles.map(path => [path, digest(readFileSync(resolve(root, path)))]));
  const audioDigests = Object.fromEntries(bank.flatMap(item => item.audio.filter(clip => ['otani', 'morioki'].includes(clip.voice))
    .map(clip => [clip.src, digest(readFileSync(resolve(root, 'public', clip.src)))])));
  const inputDigest = digest(canonical({ bank, policy, benchmark, sourceDigests, audioDigests }));
  const voices = [{ id: 'otani', name: 'Otani' }, { id: 'morioki', name: 'Morioki' }];
  const trials = [], blindKey = [], omitted = [];
  const presentation = item => ({ id: item.id, text: item.text, reading: sound(item), label: item.label,
    audio: item.audio.filter(clip => voices.some(voice => voice.id === clip.voice)).map(clip => ({ voice: clip.voice, src: `/${clip.src}` })) });
  for (const [index, declared] of benchmark.listening.targets.entries()) {
    const target = byId.get(declared.itemId);
    if (!target || target.text !== declared.text || sound(target) !== declared.reading) throw new Error('Stale listening target.');
    const row = all['all-audio-text'].find(row => row.itemId === target.id);
    if (!row.baselineTrio || !row.weightedTrio || !row.changedTrio) {
      omitted.push({ itemId: target.id, reason: !row.baselineTrio || !row.weightedTrio ? 'insufficient pronunciation-only trio' : 'identical candidate sets' });
      continue;
    }
    for (let pass = 0; pass < 2; pass++) {
      const aMethod = (index + pass) % 2 === 0 ? 'baseline' : 'weighted';
      const bMethod = aMethod === 'baseline' ? 'weighted' : 'baseline';
      const id = `T${String(index + 1).padStart(2, '0')}-V${pass + 1}`;
      const sides = Object.fromEntries([['A', aMethod], ['B', bMethod]].map(([side, method]) => [side,
        row[`${method}Trio`].map(itemId => byId.get(itemId)).sort((a, b) => a.id.localeCompare(b.id, 'en')).map(presentation)]));
      const defaultVoice = voices[pass].id;
      for (const item of [presentation(target), ...sides.A, ...sides.B]) {
        if (!item.audio.some(clip => clip.voice === defaultVoice)) throw new Error(`Missing review audio: ${item.id}, ${defaultVoice}`);
      }
      trials.push({ id, target: presentation(target), sides, defaultVoice });
      blindKey.push({ trialId: id, targetId: target.id, voice: defaultVoice, A: aMethod, B: bMethod });
    }
  }
  // Fixed hash ordering spreads repeated targets across the review; no model-score selection.
  trials.sort((a, b) => digest(`212-v1:${a.id}`).localeCompare(digest(`212-v1:${b.id}`)));
  return {
    results: { schemaVersion: 1, inputDigest, sourceDigests, audioDigests,
      bankSourceCommit: 'fa1cfe382d2196f2e0efb8e515d9754f2dec5e99', upstreamCommit: 'f067a4e8be10d818b37b8b9f08de933dae01524b', vocabulary: bank.length, counts, benchmark: benchmarkRows, scopes: scopeResults,
      acousticZeroDistancePairs: collisions, listening: { status: 'pending-human-listening', declaredTargets: benchmark.listening.targets.length, trials: trials.length, omitted },
      rankings: { writing: all['all-audio-text'], pictures: all['all-audio-picture'] } },
    blind: { schemaVersion: 1, experimentId: 'pronunciation-neighbors-212', inputDigest, voices, trials },
    blindKey: { inputDigest, orderSeed: '212-v1', trials: blindKey },
  };
}

function main() {
  if (process.argv.includes('--refresh-bank')) {
    const policy = read(resolve(root, 'content/contextual/pack-1/practice-policy.json'));
    const writingOnly = new Set(policy.writingOnlyItemIds);
    const catalogue = read(resolve(root, 'content/catalog/ja.json'));
    const bank = japaneseSemanticBank(root).map(item => ({ ...item,
      sourceLevel: catalogue.items.find(entry => entry.id === item.id)?.sourceLevel,
      wordExercises: writingOnly.has(item.id) ? ['audio-text'] : ['audio-picture', 'audio-text'] }));
    writeFileSync(`${folder}/bank.json`, canonical(bank));
    writeFileSync(`${folder}/picture-policy.json`, canonical(read(resolve(root, 'content/semantic-neighbors/ja-policy.json'))));
  }
  const acoustic = createAcousticDistance(`${folder}/vendor`);
  const outputs = runComparison(read(`${folder}/bank.json`), read(`${folder}/picture-policy.json`), read(`${folder}/benchmark.json`), acoustic);
  const files = { 'results.json': canonical(outputs.results), 'listening.json': canonical(outputs.blind), 'blind-key.json': canonical(outputs.blindKey),
    'review.html': renderListeningReview(outputs.blind) };
  for (const [name, body] of Object.entries(files)) {
    if (process.argv.includes('--check')) {
      if (readFileSync(`${folder}/${name}`, 'utf8') !== body) throw new Error(`Stale experiment output: ${name}`);
    } else writeFileSync(`${folder}/${name}`, body);
  }
  console.log(JSON.stringify({ vocabulary: outputs.results.vocabulary, counts: outputs.results.counts,
    scopes: outputs.results.scopes.slice(0, 2), listening: outputs.results.listening, scale: acoustic.scale }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
