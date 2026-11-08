import starter from '../../content/ja.json';
import catalogue from '../../content/catalog/ja.json';
import sets from '../../content/practice-sets.json';
import poolSelection from '../../content/practice-pool.json';
import reviewOverrides from '../../content/catalog/review-overrides.json';
import type { WordBank, WordItem } from '../types';
import { validateBank } from './session';

export interface PracticeSet {
  id: string;
  title: string;
  theme: string;
  itemIds: string[];
}

type CatalogueItem = Omit<WordItem, 'label' | 'theme'> & { meaning: string };

const removedIds = new Set(Object.entries(reviewOverrides)
  .filter(([, override]) => 'removalReason' in override).map(([id]) => id));

/** Sets reference stable vocabulary IDs; source levels never determine membership. */
export function buildPracticeBanks(items: CatalogueItem[], selections: PracticeSet[]): WordBank[] {
  const byId = new Map(items.map(item => [item.id, item]));
  if (byId.size !== items.length) throw new Error('Duplicate catalogue item IDs.');
  const ids = new Set([starter.id]);
  return [starter as WordBank, ...selections.map(selection => {
    if (!selection.id || ids.has(selection.id) || !selection.title || !selection.theme) throw new Error('Invalid or duplicate practice set.');
    ids.add(selection.id);
    if (selection.itemIds.length !== 6 || new Set(selection.itemIds).size !== 6) throw new Error('A practice set needs six unique words.');
    const words = selection.itemIds.map(id => {
      if (removedIds.has(id)) throw new Error('Removed vocabulary item: ' + id);
      const item = byId.get(id);
      if (!item) throw new Error('Unknown vocabulary item: ' + id);
      return {
        id: item.id, language: item.language, theme: selection.theme,
        label: item.meaning, text: item.text, reading: item.reading,
        image: item.image, audio: item.audio,
      };
    });
    if (new Set(words.map(item => item.label.toLowerCase())).size !== words.length ||
        new Set(words.map(item => item.image.src)).size !== words.length) throw new Error('Practice pictures and meanings must be distinct.');
    const bank: WordBank = { id: selection.id, title: selection.title, language: starter.language, items: words };
    validateBank(bank);
    return bank;
  })];
}

export const practiceBanks: WordBank[] = buildPracticeBanks(catalogue.items as CatalogueItem[], sets);

/** Initial eligible pool. Source labels control only introduction order, not mastery. */
export const practicePool: WordBank = {
  id: 'ja-adaptive', language: starter.language, title: 'Japanese listening',
  items: [
    ...starter.items as WordItem[],
    ...poolSelection.itemIds.map(id => {
      if (removedIds.has(id)) throw new Error('Removed practice-pool item: ' + id);
      const item = catalogue.items.find(candidate => candidate.id === id);
      if (!item) throw new Error('Unknown practice-pool item: ' + id);
      return { id: item.id, language: item.language, theme: 'vocabulary', label: item.meaning,
        text: item.text, reading: item.reading, image: item.image, audio: item.audio } as WordItem;
    }),
  ],
};
validateBank(practicePool);
