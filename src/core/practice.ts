import starter from '../../content/ja.json';
import catalogue from '../../content/catalog/ja.json';
import poolSelection from '../../content/practice-pool.json';
import reviewOverrides from '../../content/catalog/review-overrides.json';
import type { WordBank, WordItem } from '../types';
import { validateBank } from './session';

const removedIds = new Set(Object.entries(reviewOverrides)
  .filter(([, override]) => 'removalReason' in override).map(([id]) => id));

/** Initial eligible pool. Source labels control only introduction order, not mastery. */
export const practicePool: WordBank = {
  id: 'ja-adaptive', language: starter.language, title: 'Japanese listening',
  items: [
    // Keep shared WaniKani IDs and media; starter-only words are retired (#111).
    ...starter.items.filter(item => catalogue.items.some(entry => entry.id === item.id)) as WordItem[],
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
