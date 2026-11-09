import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The ordinary banks registered in src/core/languages.ts; foundation contexts are separate.
export const spanishBankFiles = ['es-419.json', 'es-419-travel-2.json', 'es-419-travel-3.json', 'es-419-travel-4.json', 'es-419-basic-1.json'];
export function spanishNeighborBank(root) {
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const exclusions = read('content/spanish-picture-exclusions.json');
  const items = spanishBankFiles.flatMap(file => {
    const bank = read(`content/${file}`);
    return bank.items.map(item => ({ ...item, packId: `${bank.id}-pictures`,
      pictureDistractorExclusions: [...new Set([...(item.pictureDistractorExclusions ?? []),
        ...exclusions.pairs.filter(pair => pair.ids.includes(item.id)).flatMap(pair => pair.ids.filter(id => id !== item.id))])].sort() }));
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (new Set(items.map(item => item.id)).size !== items.length || items.some(item => item.language !== 'es-419')) throw new Error('Invalid Spanish ordinary bank.');
  return items;
}

export { spanishPictureCompatible, firstSpanishTrio, normalizedEditDistance } from './spanish-neighbor-metrics.mjs';
