import starter from '../../content/ja.json';
import catalogue from '../../content/catalog/ja.json';
import sets from '../../content/practice-sets.json';
import type { WordBank, WordItem } from '../types';
import { validateBank } from './session';

export interface PracticeSet {
  id: string;
  title: string;
  theme: string;
  itemIds: string[];
}

type CatalogueItem = Omit<WordItem, 'label' | 'theme'> & { meaning: string };

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
