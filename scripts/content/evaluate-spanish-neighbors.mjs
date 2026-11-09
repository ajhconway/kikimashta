import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateResult } from './semantic-neighbor-utils.mjs';
import { spanishPictureCompatible, firstSpanishTrio, normalizedEditDistance } from './spanish-neighbor-metrics.mjs';
import { renderSpanishReview } from './spanish-neighbor-review.mjs';
import { renderSpanishInspection } from './spanish-neighbor-inspection.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const folder = resolve(root, 'artifacts/spanish-neighbors-222');
const read = name => JSON.parse(readFileSync(resolve(folder, name), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const stable = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const letters = text => [...text.normalize('NFC').toLowerCase().trim().replace(/\s+/gu, ' ')];
const round = value => Number(value.toFixed(8));

export function evaluateSpanish(bank, benchmark, fasttext, e5, phonetic) {
  validateResult(fasttext, bank); validateResult(e5, bank);
  const index = new Map(bank.map((item, i) => [item.id, i]));
  const byId = new Map(bank.map(item => [item.id, item]));
  const units = item => {
    const entry = phonetic.entries[item.text];
    if (!entry?.units?.length || entry.normalized !== item.text.normalize('NFC').trim().toLowerCase()) throw new Error(`Missing/stale transcription: ${item.id}`);
    return entry.units;
  };
  const pronunciationKey = item => units(item).join('\u001f');
  const valid = (target, other) => spanishPictureCompatible(target, other) && pronunciationKey(target) !== pronunciationKey(other);
  const semantic = {};
  for (const [method, data] of Object.entries({ fasttext, e5 })) {
    const score = (a, b) => data.cosineSimilarities[index.get(a)][index.get(b)];
    const rank = (target, scoped = bank, pictures = true) => scoped.filter(other => other.id !== target.id && (!pictures || valid(target, other)))
      .sort((a, b) => score(target.id, b.id) - score(target.id, a.id) || stable(a.id, b.id));
    const triplets = benchmark.triplets.map(row => {
      const related = score(row.targetId, row.relatedId), unrelated = score(row.targetId, row.unrelatedId);
      return { ...row, related, unrelated, result: Math.abs(related - unrelated) <= benchmark.policy.tieTolerance ? 'tie' : related > unrelated ? 'ordered' : 'reversed' };
    });
    const queries = benchmark.queries.map(row => {
      const target = byId.get(row.targetId);
      const rawTop5 = rank(target, bank, false).slice(0, 5).map(item => item.id);
      const pictureTop5 = rank(target).slice(0, 5).map(item => item.id);
      const allowed = row.expectedUsefulIds.filter(id => valid(target, byId.get(id)));
      return { ...row, rawTop5, pictureTop5,
        pictureRemovedPositives: row.expectedUsefulIds.filter(id => !allowed.includes(id)),
        rawRecallAt5: row.expectedUsefulIds.filter(id => rawTop5.includes(id)).length / row.expectedUsefulIds.length,
        pictureRecallAt5: allowed.length ? allowed.filter(id => pictureTop5.includes(id)).length / allowed.length : null };
    });
    const scorableQueries = queries.filter(row => row.pictureRecallAt5 !== null);
    semantic[method] = { model: data.model, repeatMaxAbsoluteDifference: data.repeatMaxAbsoluteDifference,
      triplets, counts: Object.fromEntries(['ordered', 'tie', 'reversed'].map(result => [result, triplets.filter(row => row.result === result).length])),
      groups: Object.fromEntries([...new Set(triplets.map(row => row.group))].map(group => [group, {
        ordered: triplets.filter(row => row.group === group && row.result === 'ordered').length, total: triplets.filter(row => row.group === group).length }])),
      queries, meanRawRecallAt5: queries.reduce((sum, row) => sum + row.rawRecallAt5, 0) / queries.length,
      meanPictureRecallAt5: scorableQueries.length ? scorableQueries.reduce((sum, row) => sum + row.pictureRecallAt5, 0) / scorableQueries.length : null,
      rankings: bank.map(target => ({ itemId: target.id, top6: rank(target).slice(0, 6).map(item => [item.id, score(target.id, item.id)]) })) };
  }
  const phoneDistances = new Map(), letterDistances = new Map();
  for (const a of bank) for (const b of bank) {
    phoneDistances.set(`${a.id}:${b.id}`, normalizedEditDistance(units(a), units(b)));
    letterDistances.set(`${a.id}:${b.id}`, normalizedEditDistance(letters(a.text), letters(b.text)));
  }
  const pronunciation = {};
  for (const [method, distances] of Object.entries({ letters: letterDistances, phones: phoneDistances })) {
    pronunciation[method] = { rankings: bank.map(target => ({ itemId: target.id, top6: bank.filter(other => valid(target, other))
      .sort((a, b) => distances.get(`${target.id}:${a.id}`) - distances.get(`${target.id}:${b.id}`) || stable(a.id, b.id))
      .slice(0, 6).map(item => [item.id, round(distances.get(`${target.id}:${item.id}`))]) })) };
  }
  const probes = benchmark.phoneticProbes.map(row => {
    const left = phonetic.entries[row.left], right = phonetic.entries[row.right];
    if (!left || !right) throw new Error(`Missing phonetic probe: ${row.id}`);
    const same = JSON.stringify(left.units) === JSON.stringify(right.units);
    const passed = row.expectation === 'distinct-pronunciation' ? !same : row.expectation === 'retain-word-boundaries' ?
      left.units.filter(unit => unit === '|').length === row.left.trim().split(/\s+/u).length - 1 && left.units.includes('|') : same;
    return { ...row, leftIpa: left.ipa, rightIpa: right.ipa, leftUnits: left.units, rightUnits: right.units, passed };
  });
  const homophones = [...Map.groupBy(bank, pronunciationKey).values()].filter(group => group.length > 1).map(group => group.map(item => item.id));
  const pictureInvariants = benchmark.pictureInvariants.map(row => {
    const a = byId.get(row.itemIds[0]), b = byId.get(row.itemIds[1]);
    if (!a || !b) throw new Error('Unknown picture probe.');
    const excluded = !spanishPictureCompatible(a, b);
    return { ...row, actualPictureExcluded: excluded, passed: excluded === row.expectedPictureExcluded };
  });
  const scopeMetrics = [...new Set(bank.map(item => item.packId)), 'all'].map(packId => {
    const scoped = packId === 'all' ? bank : bank.filter(item => item.packId === packId);
    const methods = {};
    for (const [method, data] of Object.entries({ fasttext, e5, letters: null, phones: null })) {
      const ranked = scoped.map(target => {
        const candidates = scoped.filter(other => valid(target, other));
        candidates.sort((a, b) => data ? data.cosineSimilarities[index.get(target.id)][index.get(b.id)] - data.cosineSimilarities[index.get(target.id)][index.get(a.id)] || stable(a.id, b.id) :
          (method === 'phones' ? phoneDistances : letterDistances).get(`${target.id}:${a.id}`) - (method === 'phones' ? phoneDistances : letterDistances).get(`${target.id}:${b.id}`) || stable(a.id, b.id));
        return { itemId: target.id, top6: candidates.slice(0, 6), trio: firstSpanishTrio(candidates.slice(0, 6)) };
      });
      methods[method] = { wordsWithCompleteTrio: ranked.filter(row => row.trio).length, top6: ranked.map(row => ({ itemId: row.itemId, ids: row.top6.map(item => item.id) })) };
    }
    return { packId, words: scoped.length, methods };
  });
  return { semantic, pronunciation, phonetic: { tool: phonetic.tool, recipe: phonetic.recipe, probes, passed: probes.filter(row => row.passed).length, total: probes.length, homophones }, pictureInvariants, scopeMetrics };
}

function main() {
  const bank = read('bank.json'), benchmark = read('benchmark.json');
  const results = evaluateSpanish(bank, benchmark, read('fasttext-results.json'), read('e5-results.json'), read('phonetic-source.json'));
  const byId = new Map(bank.map(item => [item.id, item]));
  const sourceFiles = ['bank.json', 'benchmark.json', 'fasttext-results.json', 'e5-results.json', 'phonetic-source.json', 'experiment.py', 'phonemize.py'];
  const sourceHashes = Object.fromEntries(sourceFiles.map(name => [name, hash(readFileSync(resolve(folder, name)))]));
  for (const name of ['scripts/content/spanish-neighbor-metrics.mjs', 'scripts/content/evaluate-spanish-neighbors.mjs', 'scripts/content/spanish-neighbor-review.mjs', 'scripts/content/spanish-neighbor-inspection.mjs']) sourceHashes[name] = hash(readFileSync(resolve(root, name)));
  const mediaHashes = Object.fromEntries(bank.flatMap(item => [item.image.src, ...item.audio.map(clip => clip.src)]).sort().map(path => [path, hash(readFileSync(resolve(root, 'public', path)))]));
  const inputDigest = hash(json({ sourceHashes, mediaHashes }));
  const voices = [{ id: 'juan', name: 'Juan', region: 'Mexico City' }, { id: 'carito', name: 'Carito', region: 'Bogotá' },
    { id: 'santiago', name: 'Santiago', region: 'Buenos Aires' }, { id: 'veronica', name: 'Veronica', region: 'Puerto Rico' }];
  const presentation = item => ({ id: item.id, text: item.text, label: item.label, image: { ...item.image, src: `/${item.image.src}` }, audio: item.audio.map(clip => ({ voice: clip.voice, src: `/${clip.src}` })) });
  const semanticTrials = [], pronunciationTrials = [], key = [], omitted = [];
  const models = { ...results.semantic, ...results.pronunciation };
  const trio = (id, method) => firstSpanishTrio(models[method].rankings.find(row => row.itemId === id).top6.map(([itemId]) => byId.get(itemId)));
  function makeSides(first, second, aMethod) {
    return Object.fromEntries([['A', first], ['B', second]].map(([side, items]) => [aMethod ? side : side === 'A' ? 'B' : 'A',
      [...items].sort((a, b) => stable(a.id, b.id)).map(presentation)]));
  }
  function unchanged(a, b) { return a && b && a.map(item => item.id).sort().join(',') === b.map(item => item.id).sort().join(','); }
  for (const [i, query] of benchmark.queries.entries()) {
    const first = trio(query.targetId, 'fasttext'), second = trio(query.targetId, 'e5');
    if (!first || !second || unchanged(first, second)) { omitted.push({ kind: 'semantic', targetId: query.targetId, reason: !first || !second ? 'insufficient compatible trio' : 'identical candidate sets' }); continue; }
    const id = `S${String(i + 1).padStart(2, '0')}`, aMethod = i % 2 === 0;
    semanticTrials.push({ id, target: presentation(byId.get(query.targetId)), sides: makeSides(first, second, aMethod) });
    key.push({ trialId: id, kind: 'semantic', voice: null, A: aMethod ? 'fasttext' : 'e5', B: aMethod ? 'e5' : 'fasttext' });
  }
  for (const [i, target] of benchmark.listening.targets.entries()) {
    const first = trio(target.itemId, 'letters'), second = trio(target.itemId, 'phones');
    if (!first || !second || unchanged(first, second)) { omitted.push({ kind: 'pronunciation', targetId: target.itemId, reason: !first || !second ? 'insufficient compatible trio' : 'identical candidate sets' }); continue; }
    for (const [v, voice] of voices.entries()) {
      const id = `P${String(i + 1).padStart(2, '0')}-${voice.id}`, aMethod = (i + v) % 2 === 0;
      pronunciationTrials.push({ id, target: presentation(byId.get(target.itemId)), sides: makeSides(first, second, aMethod), defaultVoice: voice.id });
      key.push({ trialId: id, kind: 'pronunciation', voice: voice.id, A: aMethod ? 'letters' : 'phones', B: aMethod ? 'phones' : 'letters' });
    }
  }
  pronunciationTrials.sort((a, b) => stable(hash(`222-v1:${a.id}`), hash(`222-v1:${b.id}`)));
  const report = { schemaVersion: 1, experimentId: 'spanish-neighbors-222', inputDigest, voices, semanticTrials, pronunciationTrials };
  const metrics = { schemaVersion: 1, language: 'es-419', inputDigest, sourceHashes, mediaHashes, vocabulary: bank.length, ...results,
    humanReview: { status: 'pending-human-review', semanticTrials: semanticTrials.length, pronunciationTrials: pronunciationTrials.length, omitted,
      warning: 'Ranked first-three examples are not production six-window sampling. Phonetic distances have no calibrated threshold and are not an acoustic model.' } };
  const files = { 'metrics.json': json(metrics), 'review-data.json': json(report), 'blind-key.json': json({ inputDigest, orderSeed: '222-v1', trials: key }), 'review.html': renderSpanishReview(report),
    'inspection.html': renderSpanishInspection(bank, metrics, read('phonetic-source.json')) };
  for (const [name, body] of Object.entries(files)) {
    if (process.argv.includes('--check')) { if (readFileSync(resolve(folder, name), 'utf8') !== body) throw new Error(`Stale Spanish evaluation: ${name}`); }
    else writeFileSync(resolve(folder, name), body);
  }
  console.log(json({ vocabulary: bank.length, semantic: Object.fromEntries(Object.entries(results.semantic).map(([name, data]) => [name, { counts: data.counts, rawRecallAt5: data.meanRawRecallAt5, pictureRecallAt5: data.meanPictureRecallAt5 }])),
    phonetic: { passed: results.phonetic.passed, total: results.phonetic.total, failures: results.phonetic.probes.filter(row => !row.passed), homophones: results.phonetic.homophones }, humanReview: metrics.humanReview }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
