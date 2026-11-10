

import { describe, expect, it } from 'vitest';
import type { WordBank } from '../types';
import first from '../../content/es-419.json';
import second from '../../content/es-419-travel-2.json';
import third from '../../content/es-419-travel-3.json';
import fourth from '../../content/es-419-travel-4.json';
import fifth from '../../content/es-419-travel-5.json';
import food from '../../content/es-419-food-1.json';
import food2 from '../../content/es-419-food-2.json';
import food2Activation from '../../content/spanish-food-2/activation.json';

import food2PictureReview from '../../content/spanish-food-2/picture-choice-review.json';
import foodActivation from '../../content/spanish-food-1/activation.json';

import foodPictureReview from '../../content/spanish-food-1/picture-choice-review.json';

import fourthPictureReview from '../../content/spanish-travel-4/picture-ambiguity-review.json';

import exclusions from '../../content/spanish-picture-exclusions.json';
import { learningLanguages } from './languages';
import { cardKey } from './cards';
import { initialPackIds, selectedPracticeCards } from './packs';
import { createQuestions, validateBank } from './session';
import { selectWordChoices, spanishWordNeighbors } from './distractors';
import { masteryLevels } from './mastery';

const spanish = learningLanguages.find(language => language.id === 'es-419')!;

describe('Spanish picture packs', () => {
  it('keeps separate pack membership and restores existing device choices', () => {
    validateBank(spanish.pool);
    expect(spanish.pool.items).toHaveLength(238);
    expect(new Set(spanish.pool.items.map(item => item.id)).size).toBe(238);
    for (const bank of [first, second, third, fourth, fifth, food, food2] as WordBank[]) {
      const cards = selectedPracticeCards(spanish.pool.items, [`${bank.id}-pictures`], spanish.packs);
      expect(new Set(cards.map(card => card.item.id))).toEqual(new Set(bank.items.map(item => item.id)));
      expect(cards.every(card => card.exercise === 'audio-picture')).toBe(true);
      for (const item of bank.items) expect(spanish.pool.items.find(word => word.id === item.id)).toMatchObject({
        ...item, image: item.id === 'es-419-travel-rice' ? food.items.find(word => word.id === item.id)!.image : item.id === 'es-419-travel-drinking-glass' ? food2.items.find(word => word.id === item.id)!.image : item.image, pictureDistractorExclusions: expect.arrayContaining(item.pictureDistractorExclusions ?? []),
      });
    }
    localStorage.setItem(spanish.packPreferenceKey, JSON.stringify(['es-419-travel-1-pictures']));
    expect(initialPackIds(spanish.packs, spanish.packPreferenceKey)).toEqual(['es-419-travel-1-pictures']);
    localStorage.setItem(spanish.packPreferenceKey, JSON.stringify(['es-419-travel-1-pictures', 'es-419-travel-2-pictures']));
    expect(initialPackIds(spanish.packs, spanish.packPreferenceKey)).toEqual(['es-419-travel-1-pictures', 'es-419-travel-2-pictures']);
    localStorage.setItem(spanish.packPreferenceKey, '[]');
    expect(initialPackIds(spanish.packs, spanish.packPreferenceKey)).toEqual([]);
    localStorage.clear();
  });

  it('keeps one progress key and current artwork for Food level 2 shared cards', () => {
    const cards = selectedPracticeCards(spanish.pool.items, ['es-419-food-2-pictures'], spanish.packs);
    const travel = selectedPracticeCards(spanish.pool.items, ['es-419-travel-2-pictures'], spanish.packs);
    const together = selectedPracticeCards(spanish.pool.items, ['es-419-food-2-pictures', 'es-419-travel-2-pictures'], spanish.packs);
    expect(cards).toHaveLength(36);
    expect(together).toHaveLength(67);
    expect(new Set(together.map(cardKey)).size).toBe(67);
    for (const shared of food2Activation.sharedItemIds) {
      const old = second.items.find(item => item.id === shared)!;
      const current = food2.items.find(item => item.id === shared)!;
      expect(current).toEqual({ ...old, image: shared === 'es-419-travel-drinking-glass' ? current.image : old.image });
      expect(cardKey(cards.find(card => card.item.id === shared)!)).toBe(cardKey(travel.find(card => card.item.id === shared)!));
    }
  });

  it('keeps shared progress keys and cooked Spanish rice across overlapping selections', () => {
    const select = (packIds: string[]) => selectedPracticeCards(spanish.pool.items, packIds, spanish.packs);
    const travel = select(['es-419-travel-1-pictures']);
    const foodCards = select(['es-419-food-1-pictures']);
    const together = select(['es-419-travel-1-pictures', 'es-419-food-1-pictures']);
    expect(together).toHaveLength(66);
    expect(new Set(together.map(cardKey)).size).toBe(66);
    for (const shared of foodActivation.sharedItemIds) {
      const foodCard = foodCards.find(card => card.item.id === shared)!;
      const otherPacks = select(spanish.packs.filter(pack => pack.id !== 'es-419-food-1-pictures').map(pack => pack.id));
      expect(cardKey(foodCard)).toBe(cardKey(otherPacks.find(card => card.item.id === shared)!));
    }
    const rice = food.items.find(item => item.id === 'es-419-travel-rice')!;
    expect(travel.find(card => card.item.id === rice.id)!.item.image).toEqual(rice.image);
    expect(rice.image.src).toContain('es-419-travel-rice-622cdf579932');
    const japanese = learningLanguages.find(language => language.id === 'ja-JP')!;
    expect(japanese.pool.items.find(item => item.id === foodPictureReview.japaneseRicePreserved.id)!.image).toEqual(foodPictureReview.japaneseRicePreserved.image);
    expect(first.items.find(item => item.id === rice.id)!.image.src).toBe(foodPictureReview.japaneseRicePreserved.image.src);
  });

  it('does not offer the milk illustration for vaso or the drinking glass for leche', () => {
    const word = (slug: string) => spanish.pool.items.find(item => item.id === `es-419-travel-${slug}`)!;
    const safe = ['table', 'chair', 'spoon'].map(word);
    for (const [target, ambiguous] of [[word('drinking-glass'), word('milk')], [word('milk'), word('drinking-glass')]]) {
      const question = createQuestions([{ item: target!, exercise: 'audio-picture' }], [target!, ambiguous!, ...safe], () => 0.5)[0]!;
      expect(question.choices).toHaveLength(4);
      expect(question.choices.map(choice => choice.id)).not.toContain(ambiguous!.id);
    }
  });

  it('does not offer the orange half in the juice picture as a competing naranja answer', () => {
    const word = (slug: string) => spanish.pool.items.find(item => item.id === `es-419-travel-${slug}`)!;
    const safe = ['table', 'chair', 'spoon'].map(word);
    for (const [target, ambiguous] of [[word('orange'), word('juice')], [word('juice'), word('orange')]]) {
      for (const random of [() => 0, () => 0.5, () => 0.99]) {
        const question = createQuestions([{ item: target!, exercise: 'audio-picture' }], [target!, ambiguous!, ...safe], random)[0]!;
        expect(question.choices).toHaveLength(4);
        expect(question.choices.map(choice => choice.id)).not.toContain(ambiguous!.id);
      }
    }
  });

  // Released-media integrity owns acceptance chains and byte hashes for every pack.
  it('applies every reviewed symmetric picture exclusion to the active pool', () => {
    const byId = new Map(spanish.pool.items.map(item => [item.id, item]));
    for (const pair of food2PictureReview.addedSymmetricPairs) expect(exclusions.pairs).toContainEqual(pair);
    for (const pair of foodPictureReview.addedSymmetricPairs) expect(exclusions.pairs).toContainEqual(pair);
    for (const pair of fourthPictureReview.addedSymmetricPairs) expect(exclusions.pairs).toContainEqual(pair);
    for (const pair of exclusions.pairs) {
      const [left, right] = pair.ids;
      expect(byId.get(left!)?.pictureDistractorExclusions).toContain(right);
      expect(byId.get(right!)?.pictureDistractorExclusions).toContain(left);
    }
  });

  // Individual packs, the complete union, and both shared-word boundaries cover
  // scope/deduplication without the exponentially growing power set. Synthetic
  // selector tests own mastery quotas, source fallbacks and random-window rules.
  const scopes = [
    ...spanish.packs.map(pack => ({ packIds: [pack.id] })),
    { packIds: spanish.packs.map(pack => pack.id) },
    { packIds: ['es-419-travel-1-pictures', 'es-419-food-1-pictures'] },
    { packIds: ['es-419-travel-2-pictures', 'es-419-food-2-pictures'] },
  ];
  it.each(scopes)('keeps scoped choices distinct and unambiguous for $packIds', ({ packIds }) => {
    const cards = selectedPracticeCards(spanish.pool.items, packIds, spanish.packs);
    expect(new Set(cards.map(cardKey)).size).toBe(cards.length);
    const pool = cards.map(card => card.item);
    const sampledLevels = [masteryLevels[0], masteryLevels[4], masteryLevels[7]];
    let state = 1;
    const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const [index, card] of cards.entries()) {
      const result = selectWordChoices(card, pool, sampledLevels[index % sampledLevels.length]!, random);
      expect(result.choices).toHaveLength(4);
      expect(new Set(result.choices.map(item => item.id)).size).toBe(4);
      expect(result.choices.map(item => item.id)).toContain(card.item.id);
      expect(result.choices.every(item => pool.includes(item))).toBe(true);
      const targetSound = spanishWordNeighbors.pronunciationKey?.(card.item.id);
      expect(targetSound).toBeTruthy();
      for (const [position, first] of result.choices.entries()) {
        for (const second of result.choices.slice(position + 1)) {
          expect(spanishWordNeighbors.pictureExcluded(first.id, second.id)).toBe(false);
          expect(first.pictureDistractorExclusions ?? []).not.toContain(second.id);
          expect(second.pictureDistractorExclusions ?? []).not.toContain(first.id);
          expect(first.image.src).not.toBe(second.image.src);
        }
      }
      expect(result.choices.filter(item => item.id !== card.item.id).every(item =>
        spanishWordNeighbors.pronunciationKey?.(item.id) !== targetSound)).toBe(true);
    }
  });
});
