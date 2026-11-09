import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const normalized = text => text.normalize('NFKC').trim();
const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/** Match the app's approved Japanese bank, preserving canonical starter IDs. */
export function japaneseSemanticBank(root) {
  const catalog = readJson(resolve(root, 'content/catalog/ja.json'));
  const starter = readJson(resolve(root, 'content/ja.json'));
  const selection = readJson(resolve(root, 'content/practice-pool.json'));
  const overrides = readJson(resolve(root, 'content/catalog/review-overrides.json'));
  const packPolicy = readJson(resolve(root, 'content/contextual/pack-1/practice-policy.json'));
  const selectedIds = new Set([...selection.itemIds, ...starter.items.map(item => item.id)]);
  const items = [
    ...starter.items.filter(item => catalog.items.some(entry => entry.id === item.id)),
    ...selection.itemIds.map(id => {
      if ('removalReason' in (overrides[id] ?? {})) throw new Error(`Removed practice item: ${id}`);
      const item = catalog.items.find(entry => entry.id === id);
      if (!item) throw new Error(`Unknown practice item: ${id}`);
      return { ...item, label: item.meaning, theme: 'vocabulary' };
    }),
    ...packPolicy.writingOnlyItemIds.filter(id => !selectedIds.has(id)).map(id => {
      const item = catalog.items.find(entry => entry.id === id);
      if (!item || 'removalReason' in (overrides[id] ?? {})) throw new Error(`Unknown writing-only practice item: ${id}`);
      return { ...item, label: item.meaning, theme: 'vocabulary' };
    }),
  ];
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Duplicate practice IDs.');
  return items.sort((a, b) => compareIds(a.id, b.id));
}

export function bankDigest(bank) {
  return createHash('sha256').update(JSON.stringify(bank.map(({ id, language, text, label }) =>
    ({ id, language, text, label })))).digest('hex');
}

/** Filters match session.ts; staged #79 exclusions are diagnostics, not active rules. */
export function rankedNeighbors(bank, similarities, targetId, exercise = 'audio-picture', selectedIds = bank.map(item => item.id)) {
  if (!['audio-picture', 'audio-text', 'semantic'].includes(exercise)) throw new Error('Unsupported neighbor format.');
  const index = bank.findIndex(item => item.id === targetId);
  if (index < 0) throw new Error(`Unknown neighbor target: ${targetId}`);
  const allowed = new Set(selectedIds);
  const target = bank[index];
  const visible = item => exercise === 'audio-picture' ? item.image.src : normalized(item.text);
  const seen = new Set([visible(target)]);
  return bank.map((item, position) => ({ id: item.id, score: similarities[index][position], item }))
    .filter(({ item, score }) => item.id !== targetId && item.language === target.language && allowed.has(item.id) && Number.isFinite(score))
    .sort((a, b) => b.score - a.score || compareIds(a.id, b.id))
    .filter(({ item }) => {
      if (exercise === 'semantic') return true;
      if (exercise === 'audio-picture' && (target.pictureDistractorExclusions?.includes(item.id) ||
          item.pictureDistractorExclusions?.includes(target.id))) return false;
      if (seen.has(visible(item)) || normalized(item.reading ?? item.text) === normalized(target.reading ?? target.text)) return false;
      seen.add(visible(item));
      return true;
    }).map(({ id, score }) => ({ id, score }));
}

export function validateResult(result, bank) {
  const expected = bank.map(({ id, language, text, label }) => ({ id, language, text, label }));
  if (JSON.stringify(result.items) !== JSON.stringify(expected)) throw new Error('Embedding inputs do not match the approved bank.');
  const matrix = result.cosineSimilarities;
  if (!Array.isArray(matrix) || matrix.length !== bank.length || matrix.some(row =>
    !Array.isArray(row) || row.length !== bank.length || row.some(score => !Number.isFinite(score) || score < -1 || score > 1))) {
    throw new Error('Invalid cosine matrix.');
  }
  for (let i = 0; i < bank.length; i++) {
    if (Math.abs(matrix[i][i] - 1) > 0.00001 || matrix[i].some((score, j) => Math.abs(score - matrix[j][i]) > 0.00001)) {
      throw new Error('Cosine matrix must be symmetric with unit diagonal.');
    }
  }
}

export function evaluateNeighbors(result, bank, benchmark) {
  validateResult(result, bank);
  const indices = new Map(bank.map((item, index) => [item.id, index]));
  const similarity = (a, b) => {
    if (!indices.has(a) || !indices.has(b)) throw new Error('Unknown benchmark ID.');
    return result.cosineSimilarities[indices.get(a)][indices.get(b)];
  };
  const triplets = benchmark.triplets.map(triplet => {
    const relatedScore = similarity(triplet.targetId, triplet.relatedId);
    const unrelatedScore = similarity(triplet.targetId, triplet.unrelatedId);
    return { ...triplet, relatedScore, unrelatedScore, pass: relatedScore > unrelatedScore };
  });
  const groups = Object.fromEntries([...new Set(triplets.map(t => t.group))].map(group => {
    const rows = triplets.filter(triplet => triplet.group === group);
    return [group, { passed: rows.filter(t => t.pass).length, total: rows.length }];
  }));
  const queries = benchmark.queries.map(query => ({ ...query, results: Object.fromEntries(
    ['semantic', 'audio-picture', 'audio-text'].map(format => {
      const top5 = rankedNeighbors(bank, result.cosineSimilarities, query.targetId, format).slice(0, 5);
      const found = query.expectedUsefulIds.filter(id => top5.some(neighbor => neighbor.id === id)).length;
      return [format, { top5, found, recallAt5: found / query.expectedUsefulIds.length }];
    })) }));
  return {
    model: result.model,
    triplets: { passed: triplets.filter(t => t.pass).length, total: triplets.length, groups,
      macroGroupAccuracy: Object.values(groups).reduce((sum, g) => sum + g.passed / g.total, 0) / Object.keys(groups).length,
      failures: triplets.filter(t => !t.pass) },
    queries,
    querySummary: Object.fromEntries(['semantic', 'audio-picture', 'audio-text'].map(format => [format, {
      meanRecallAt5: queries.reduce((sum, query) => sum + query.results[format].recallAt5, 0) / queries.length,
      hitRateAt5: queries.filter(query => query.results[format].found > 0).length / queries.length,
    }])),
  };
}
