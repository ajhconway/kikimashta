import { beforeEach, describe, expect, it } from 'vitest';
import catalogue from '../../content/catalog/ja.json';
import library from '../../public/vocabulary/library-data.json';
import { cardKey } from './cards';
import { practicePool } from './practice';
import { cardPacks, initialPackIds, packPreferenceKey, selectedPracticeCards } from './packs';
import { createQuestions } from './session';

beforeEach(() => localStorage.clear());
describe('WaniKani packs', () => {
  it('partitions the full library by level with an independent pack per exercise', () => {
    expect(cardPacks).toHaveLength(10);
    expect(new Set(cardPacks.map(pack => pack.id)).size).toBe(10);
    for (const level of [1, 2, 3, 4, 5]) {
      const packs = cardPacks.filter(pack => pack.sourceLevel === level);
      expect(packs.map(pack => pack.exercise)).toEqual(['audio-picture', 'audio-text']);
      const ids = library.cards.filter(card => card.sourceLevel === level).map(card => card.id);
      expect(packs[0]!.itemIds).toEqual(ids);
      expect(packs[1]!.itemIds).toEqual(ids);
    }
  });
  it('selects only approved items and the requested format, with playable choices in every pack', () => {
    for (const pack of cardPacks) {
      const cards = selectedPracticeCards(practicePool.items, [pack.id]);
      expect(cards.length).toBeGreaterThanOrEqual(4);
      expect(cards.every(card => card.exercise === pack.exercise && pack.itemIds.includes(card.item.id))).toBe(true);
      expect(cards.every(card => catalogue.items.find(item => item.id === card.item.id)?.sourceLevel === pack.sourceLevel)).toBe(true);
      expect(createQuestions(cards, cards.map(card => card.item), () => 0.5)).toHaveLength(cards.length);
    }
    const selected = selectedPracticeCards(practicePool.items, cardPacks.map(pack => pack.id));
    expect(new Set(selected.map(cardKey)).size).toBe(selected.length);
    expect(selectedPracticeCards(practicePool.items, [])).toEqual([]);
    expect(selectedPracticeCards(practicePool.items, ['unknown'])).toEqual([]);
  });
  it('includes every active card without retired starter words', () => {
    const cards = selectedPracticeCards(practicePool.items, cardPacks.map(pack => pack.id));
    expect(cards).toHaveLength(practicePool.items.length * 2);
    expect(cards.some(card => ['ja-cat', 'ja-banana', 'ja-umbrella', 'ja-cup'].includes(card.item.id))).toBe(false);
    expect(cards.some(card => card.item.id === 'ja-dog')).toBe(true);
    expect(cards.some(card => card.item.id === 'ja-apple')).toBe(true);
  });
  it('defaults to all packs and restores empty, valid, stale and invalid preferences safely', () => {
    expect(initialPackIds()).toEqual(cardPacks.map(pack => pack.id));
    for (const value of ['[]', '["unknown"]', '["ja-starter-pictures","ja-starter-writing"]']) {
      localStorage.setItem(packPreferenceKey, value);
      expect(initialPackIds()).toEqual([]);
    }
    localStorage.setItem(packPreferenceKey, JSON.stringify([cardPacks[3]!.id, 'ja-starter-pictures', 'ja-starter-writing', 'unknown']));
    expect(initialPackIds()).toEqual([cardPacks[3]!.id]);
    for (const value of ['bad json', '{}', '[null]']) {
      localStorage.setItem(packPreferenceKey, value);
      expect(initialPackIds()).toHaveLength(10);
    }
  });
});
