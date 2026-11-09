import starter from '../../content/ja.json';
import catalogue from '../../content/catalog/ja.json';
import poolSelection from '../../content/practice-pool.json';
import reviewOverrides from '../../content/catalog/review-overrides.json';
import pack1Policy from '../../content/contextual/pack-1/practice-policy.json';
import type { WordBank, WordItem } from '../types';
import { validateBank } from './session';

const removedIds = new Set(Object.entries(reviewOverrides)
  .filter(([, override]) => 'removalReason' in override).map(([id]) => id));
const selectedWordIds = new Set([...poolSelection.itemIds, ...starter.items.map(item => item.id)]);
const writingOnlyIds = new Set(pack1Policy.writingOnlyItemIds);

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
    ...pack1Policy.writingOnlyItemIds.filter(id => !selectedWordIds.has(id)).map(id => {
      const item = catalogue.items.find(candidate => candidate.id === id);
      if (!item || removedIds.has(id)) throw new Error('Unknown writing-only practice item: ' + id);
      return { ...item, theme: 'vocabulary', label: item.meaning } as WordItem;
    }),
  ].map((item): WordItem => writingOnlyIds.has(item.id) ? { ...item, wordExercises: ['audio-text'] } : item),
};
validateBank(practicePool);
