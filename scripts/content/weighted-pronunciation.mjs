import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { japaneseMoras } from '../../src/core/pronunciation.ts';

const directory = fileURLToPath(new URL('../../content/pronunciation-neighbors/kanasim/', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = {
  'distance_consonants_bi.csv': '03101f602c7c9c433f3fbcae19ab618bdba817c8e46315d33dff9e679cfa4d9b',
  'distance_vowels_bi.csv': '2cf16b4ec38d4b88403deeddf1f11e371e8b0113a96f03d0137274f8a320aca9',
  'kana2phonome_bi.csv': 'c5da94be3379bd8072c615306440eac4d91b18c58d4bd8ff181f1708156da75b',
};

// Offline preparation only. The browser receives sorted item indices, never acoustic tables.
export const pronunciationModel = {
  id: 'kanasim-julius-biphone', revision: 'f067a4e8be10d818b37b8b9f08de933dae01524b',
  recipe: 'symmetric-self-offset-cv-equal-median-scaled-v1', sourceHashes,
  implementationSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
};

const katakana = text => text.replace(/[ぁ-ゔ]/gu, char => String.fromCharCode(char.charCodeAt(0) + 0x60));
const special = new Set(['っ', 'ん', 'ー']);
const pair = (a, b) => `${a}\t${b}`;

// The pinned upstream CSVs have simple unquoted fields and CRLF line endings.
export function readAcousticCsv(path) {
  const [header, ...lines] = readFileSync(path, 'utf8').trim().split(/\r?\n/u);
  const fields = header.split(',');
  return lines.map(line => {
    const values = line.split(',');
    if (values.length !== fields.length || line.includes('"')) throw new Error('Unsupported acoustic CSV row.');
    return Object.fromEntries(fields.map((field, index) => [field, values[index]]));
  });
}

export function weightedEditDistance(a, b, substitution) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = substitution(a[i - 1], b[j - 1]);
      if (!Number.isFinite(cost) || cost < 0) throw new Error('Invalid acoustic substitution cost.');
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

export function createWeightedPronunciationDistance(sourceDirectory = directory) {
  for (const [name, expected] of Object.entries(sourceHashes)) {
    if (sha256(readFileSync(`${sourceDirectory}/${name}`)) !== expected) throw new Error(`Acoustic source hash mismatch: ${name}`);
  }
  const mapping = new Map(readAcousticCsv(`${sourceDirectory}/kana2phonome_bi.csv`).map(row => [row.kana, row]));
  function phonemeCosts(name) {
    const table = new Map(readAcousticCsv(`${sourceDirectory}/${name}`).map(row => {
      const distance = Number(row.distance);
      if (!Number.isFinite(distance) || distance < 0) throw new Error('Invalid acoustic source distance.');
      return [pair(row.phonome1, row.phonome2), distance];
    }));
    return (a, b) => {
      const score = table.get(pair(a, b)), self = table.get(pair(a, a));
      if (score === undefined || self === undefined) throw new Error(`Missing acoustic phoneme: ${a}, ${b}`);
      return Math.max(0, score - self);
    };
  }
  const consonants = phonemeCosts('distance_consonants_bi.csv');
  const vowels = phonemeCosts('distance_vowels_bi.csv');
  const directed = (a, b) => .5 * consonants(a.consonant, b.consonant) + .5 * vowels(a.vowel, b.vowel);
  const raw = (a, b) => (directed(a, b) + directed(b, a)) / 2;
  // Use the complete upstream ordinary one-mora inventory, independent of this bank/benchmark.
  const ordinary = [...mapping.values()].filter(row => row.kana !== 'sp' && !row.kana.includes('ー') && !['ン', 'ッ'].includes(row.kana));
  const costs = ordinary.flatMap((a, i) => ordinary.slice(i + 1).map(b => raw(a, b))).sort((a, b) => a - b);
  const middle = Math.floor(costs.length / 2);
  const scale = costs.length % 2 ? costs[middle] : (costs[middle - 1] + costs[middle]) / 2;
  if (!(scale > 0)) throw new Error('Invalid acoustic normalization scale.');
  const cache = new Map();
  function substitution(a, b) {
    if (a === b) return 0;
    if (special.has(a) || special.has(b)) return 1;
    const key = pair(a, b);
    if (!cache.has(key)) {
      const first = mapping.get(katakana(a)), second = mapping.get(katakana(b));
      if (!first || !second) throw new Error(`Unsupported acoustic mora: ${a}, ${b}`);
      cache.set(key, raw(first, second) / scale);
    }
    return cache.get(key);
  }
  return {
    scale, substitution,
    distance(left, right) {
      const a = japaneseMoras(left), b = japaneseMoras(right);
      if (!a || !b) throw new Error(`Unsupported reading: ${left}, ${right}`);
      // Validate all units even for identity or paths containing only insertions.
      for (const mora of [...a, ...b]) {
        if (!special.has(mora) && !mapping.has(katakana(mora))) throw new Error(`Unsupported acoustic mora: ${mora}`);
      }
      return weightedEditDistance(a, b, substitution) / Math.max(a.length, b.length);
    },
  };
}
