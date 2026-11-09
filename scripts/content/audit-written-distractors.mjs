import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { japaneseSemanticBank } from './semantic-neighbor-utils.mjs';
import { writtenKanaEnding } from '../../src/core/written-plausibility.ts';
import { japanesePronunciationKey } from '../../src/core/pronunciation.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const catalogue = JSON.parse(readFileSync(`${root}/content/catalog/ja.json`, 'utf8'));
const bank = japaneseSemanticBank(root);
const sound = word => japanesePronunciationKey(word.reading ?? word.text);
const scopes = [undefined, 1, 2, 3, 4, 5].map(level => {
  const pool = bank.filter(word => !level || catalogue.items.find(item => item.id === word.id)?.sourceLevel === level);
  const rows = pool.map(target => {
    const ending = writtenKanaEnding(target.text);
    const seen = new Set([target.text.normalize('NFKC').trim()]);
    const matches = ending ? pool.filter(other => {
      const text = other.text.normalize('NFKC').trim();
      if (other.id === target.id || sound(other) === sound(target) || seen.has(text) || writtenKanaEnding(other.text) !== ending) return false;
      seen.add(text); return true;
    }).map(other => other.id) : [];
    return { itemId: target.id, text: target.text, ending: ending ?? null, matchingIds: matches };
  });
  const applicable = rows.filter(row => row.ending);
  return { scope: level ? `ja-wanikani-${level}-writing` : 'all-writing', words: pool.length,
    withEnding: applicable.length, withAnyMatch: applicable.filter(row => row.matchingIds.length).length,
    withThreeMatches: applicable.filter(row => row.matchingIds.length >= 3).length, rows };
});
console.log(JSON.stringify({ schemaVersion: 1, inputDigest: createHash('sha256').update(JSON.stringify(bank.map(({ id, text, reading }) => ({ id, text, reading })))).digest('hex'),
  note: 'Inventory ceiling only: exact trailing kana, normalized homophones and duplicate written forms filtered. Actual semantic/pronunciation/broad source quotas can reduce selected matching counts.', scopes }, null, 2));
