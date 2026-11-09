import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

// The ordinary banks registered in src/core/languages.ts; foundation contexts are separate.
export const spanishBankFiles = ['es-419.json', 'es-419-travel-2.json', 'es-419-travel-3.json', 'es-419-travel-4.json', 'es-419-basic-1.json', 'es-419-food-1.json', 'es-419-food-2.json'];
export function spanishNeighborBank(root) {
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const exclusions = read('content/spanish-picture-exclusions.json');
  const memberships = new Map();
  const items = [...new Map(spanishBankFiles.flatMap(file => {
    const bank = read(`content/${file}`);
    return bank.items.map(item => {
      memberships.set(item.id, [...(memberships.get(item.id) ?? []), `${bank.id}-pictures`]);
      return [item.id, { ...item, packId: `${bank.id}-pictures`,
      pictureDistractorExclusions: [...new Set([...(item.pictureDistractorExclusions ?? []),
        ...exclusions.pairs.filter(pair => pair.ids.includes(item.id)).flatMap(pair => pair.ids.filter(id => id !== item.id))])].sort() }];
    });
  })).values()].map(item => ({ ...item, packIds: [...new Set(memberships.get(item.id))].sort() }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (new Set(items.map(item => item.id)).size !== items.length || items.some(item => item.language !== 'es-419')) throw new Error('Invalid Spanish ordinary bank.');
  return items;
}

export function spanishSemanticInputs(bank) {
  return bank.map(({ id, language, text, label }) => ({ id, language, text, label }));
}
export function spanishSemanticDigest(bank) {
  return createHash('sha256').update(JSON.stringify(spanishSemanticInputs(bank))).digest('hex');
}

export { spanishPictureCompatible, firstSpanishTrio, normalizedEditDistance } from './spanish-neighbor-metrics.mjs';
