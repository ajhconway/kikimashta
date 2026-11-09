import { describe, expect, it } from 'vitest';
import starter from '../../content/ja.json';
import food2 from '../../content/es-419-food-2.json';
import { withCurrentImage } from './current-images';
import { contextualVocabulary } from './contextual-runtime';
import { spanishContextualVocabulary } from './spanish-basic';
import { learningLanguages } from '../core/languages';
import { selectedPracticeCards, cardPacks } from '../core/packs';
import type { WordItem } from '../types';

describe('accepted shared drinking-glass presentation', () => {
  it('uses the current glass in every Spanish scope and contextual source while preserving the legacy Japanese identity and retirement', () => {
    const spanish = learningLanguages.find(language => language.id === 'es-419')!;
    const glass = food2.items.find(item => item.id === 'es-419-travel-drinking-glass')!;
    const travel = selectedPracticeCards(spanish.pool.items, ['es-419-travel-2-pictures'], spanish.packs);
    expect(travel.find(card => card.item.id === glass.id)!.item.image).toEqual(glass.image);
    expect(spanishContextualVocabulary.find(item => item.id === glass.id)!.image).toEqual(glass.image);
    expect(contextualVocabulary.find(item => item.id === glass.id)!.image).toEqual(glass.image);
    const legacy = starter.items.find(item => item.id === 'ja-cup')! as WordItem;
    const before = structuredClone(legacy);
    expect(withCurrentImage(legacy)).toEqual({ ...legacy, image: { ...legacy.image, src: glass.image.src } });
    expect(legacy).toEqual(before);
    expect(legacy.image.src).toBe('images/approved/ja-cup-a6b3cf43ae54.jpg');
    expect(learningLanguages.find(language => language.id === 'ja-JP')!.pool.items.some(item => item.id === legacy.id)).toBe(false);
    expect(cardPacks.some(pack => pack.itemIds.includes(legacy.id))).toBe(false);
  });
  it('keeps unrelated words and cross-language ID collisions unchanged', () => {
    const legacy = starter.items.find(item => item.id === 'ja-cup')! as WordItem;
    const otherLanguage = { ...legacy, language: 'es-419' };
    const otherId = { ...legacy, id: 'ja-unrelated' };
    expect(withCurrentImage(otherLanguage)).toBe(otherLanguage);
    expect(withCurrentImage(otherId)).toBe(otherId);
  });
});
