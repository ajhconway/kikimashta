import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WordBank } from '../types';
import first from '../../content/es-419.json';
import second from '../../content/es-419-travel-2.json';
import third from '../../content/es-419-travel-3.json';
import fourth from '../../content/es-419-travel-4.json';
import food from '../../content/es-419-food-1.json';
import food2 from '../../content/es-419-food-2.json';
import food2Activation from '../../content/spanish-food-2/activation.json';
import food2Acceptance from '../../content/spanish-food-2/acceptance.json';
import food2PictureReview from '../../content/spanish-food-2/picture-choice-review.json';
import foodActivation from '../../content/spanish-food-1/activation.json';
import foodAcceptance from '../../content/spanish-food-1/acceptance.json';
import foodPictureReview from '../../content/spanish-food-1/picture-choice-review.json';
import fourthActivation from '../../content/spanish-travel-4/activation.json';
import fourthPictureReview from '../../content/spanish-travel-4/picture-ambiguity-review.json';
import thirdActivation from '../../content/spanish-travel-3/activation.json';
import thirdAcceptance from '../../content/spanish-travel-3/acceptance.json';
import thirdArtwork from '../../artifacts/spanish-travel-3-art/manifest.json';
import activation from '../../content/spanish-travel-2/activation.json';
import acceptance from '../../content/spanish-travel-2/acceptance.json';
import artwork from '../../artifacts/spanish-travel-2-art/manifest.json';
import exclusions from '../../content/spanish-picture-exclusions.json';
import { learningLanguages } from './languages';
import { cardKey } from './cards';
import { initialPackIds, selectedPracticeCards } from './packs';
import { createQuestions, validateBank } from './session';
import { selectWordChoices, spanishWordNeighbors } from './distractors';
import { masteryLevels } from './mastery';

const spanish = learningLanguages.find(language => language.id === 'es-419')!;
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('Spanish picture packs', () => {
  it('keeps separate pack membership and restores existing device choices', () => {
    expect(spanish.pool.items).toHaveLength(238);
    expect(new Set(spanish.pool.items.map(item => item.id)).size).toBe(238);
    for (const bank of [first, second, third, fourth] as WordBank[]) {
      const cards = selectedPracticeCards(spanish.pool.items, [`${bank.id}-pictures`], spanish.packs);
      expect(cards.map(card => card.item.id)).toEqual(bank.items.map(item => item.id));
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

  it('ships the exact accepted level 2 pictures and all eight voices', () => {
    expect(second.items).toHaveLength(36);
    expect(digest(acceptance.artworkManifest)).toBe(acceptance.artworkManifestSha256);
    expect(digest(acceptance.audioReviewManifest)).toBe(acceptance.audioReviewSha256);
    expect(artwork.images.find(image => image.slug === 'stairs')?.file).toBe('originals/stairs-v5.png');
    expect(activation.recordings).toHaveLength(288);
    expect(activation.images).toHaveLength(36);
    for (const media of activation.images) expect(digest('public/' + media.src)).toBe(media.sha256);
    for (const item of second.items) expect(item.audio.map(clip => clip.voice)).toEqual(first.items[0]!.audio.map(clip => clip.voice));
    validateBank(spanish.pool);
  });

  it('ships the accepted level 3 revisions, five reuses and all eight voices', () => {
    expect(third.items).toHaveLength(36);
    expect(digest(thirdAcceptance.artworkManifest)).toBe(thirdAcceptance.artworkManifestSha256);
    expect(digest(thirdAcceptance.audioReviewManifest)).toBe(thirdAcceptance.audioReviewSha256);
    expect(digest(thirdActivation.acceptance)).toBe(thirdActivation.acceptanceSha256);
    expect(thirdActivation.recordings).toHaveLength(288);
    expect(thirdActivation.images).toHaveLength(36);
    expect(thirdArtwork.generatedImages).toBe(31);
    expect(thirdArtwork.reusedImages).toBe(5);
    for (const [slug, version] of Object.entries(thirdAcceptance.selectedRevisions)) {
      expect(thirdArtwork.images.find(image => image.slug === slug)?.file).toBe(`originals/${slug}-v${version}.png`);
    }
    expect(third.items.find(item => item.id.endsWith('-banana'))?.image.src).toBe(thirdAcceptance.approvedBananaSource.slice(7));
    for (const media of thirdActivation.images) expect(digest('public/' + media.src)).toBe(media.sha256);
    for (const item of third.items) expect(item.audio.map(clip => clip.voice)).toEqual(first.items[0]!.audio.map(clip => clip.voice));
  });

  it('ships the current level 4 word amendment with all accepted pictures and voices', () => {
    expect(fourth.items).toHaveLength(36);
    expect(fourth.items.some(item => item.id === 'es-419-travel-bandage')).toBe(false);
    expect(fourth.items.find(item => item.id === 'es-419-travel-power-outlet')).toMatchObject({ text: 'enchufe', label: 'Power outlet' });
    expect(fourth.items.find(item => item.id === 'es-419-travel-flower')?.image.src).toBe('images/approved/ja-v-fa6a4c8f27b4-3610d3fbdc0c.png');
    expect(digest(fourthActivation.acceptance)).toBe(fourthActivation.acceptanceSha256);
    expect(fourthActivation.images).toHaveLength(36);
    expect(fourthActivation.recordings).toHaveLength(288);
    for (const media of [...fourthActivation.images, ...fourthActivation.recordings]) expect(digest('public/' + media.src)).toBe(media.sha256);
    const existingIds = new Set([first, second, third].flatMap(bank => bank.items.map(item => item.id)));
    for (const item of fourth.items) {
      expect(existingIds.has(item.id)).toBe(false);
      expect(item.audio.map(clip => clip.voice)).toEqual(first.items[0]!.audio.map(clip => clip.voice));
      expect(item.audio.every(clip => clip.src.startsWith('audio/es-419-travel-4/'))).toBe(true);
    }
  });

  it('activates the exact accepted Food media and shares existing word identities', () => {
    expect(food.items).toHaveLength(36);
    expect(foodActivation.sharedItemIds).toHaveLength(24);
    expect(foodActivation.copiedFiles).toBe(108);
    expect(foodActivation.newWords).toBe(12);
    expect(foodActivation.generatedImages).toBe(12);
    expect(foodActivation.newRecordings).toBe(96);
    expect(foodActivation.reusedRecordings).toBe(192);
    expect(digest(foodActivation.acceptance)).toBe(foodActivation.acceptanceSha256);
    expect(digest(foodAcceptance.combinedMediaManifest)).toBe(foodAcceptance.combinedMediaManifestSha256);
    for (const asset of [...foodActivation.images, ...foodActivation.recordings]) expect(digest('public/' + asset.src)).toBe(asset.sha256);
    const old = new Map([first, second, third, fourth].flatMap(bank => bank.items).map(item => [item.id, item]));
    for (const item of food.items) {
      const previous = old.get(item.id);
      if (previous) expect(item).toEqual({ ...previous, image: item.id === 'es-419-travel-rice' ? item.image : previous.image });
      else expect(item.audio.every(clip => clip.src.startsWith('audio/es-419-food-1/'))).toBe(true);
      expect(item.audio.map(clip => clip.voice)).toEqual(first.items[0]!.audio.map(clip => clip.voice));
    }
    const cards = selectedPracticeCards(spanish.pool.items, ['es-419-food-1-pictures'], spanish.packs);
    expect(new Set(cards.map(card => card.item.id))).toEqual(new Set(food.items.map(item => item.id)));
    expect(cards.every(card => card.exercise === 'audio-picture')).toBe(true);
  });

  it('ships accepted Food level 2 media with five shared IDs and keeps one progress key for each shared card', () => {
    expect(food2.items).toHaveLength(36);
    expect(food2Activation.sharedItemIds).toHaveLength(5);
    expect(food2Activation.newWords).toBe(31);
    expect(food2Activation.generatedImages).toBe(32);
    expect(food2Activation.reusedImages).toBe(4);
    expect(food2Activation.newRecordings).toBe(248);
    expect(food2Activation.reusedRecordings).toBe(40);
    expect(food2Activation.copiedFiles).toBe(280);
    expect(digest(food2Activation.acceptance)).toBe(food2Activation.acceptanceSha256);
    expect(digest(food2Acceptance.combinedMediaManifest)).toBe(food2Acceptance.combinedMediaManifestSha256);
    for (const asset of [...food2Activation.images, ...food2Activation.recordings]) expect(digest('public/' + asset.src)).toBe(asset.sha256);
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
    for (const item of food2.items.filter(item => !food2Activation.sharedItemIds.includes(item.id))) {
      expect(item.audio.map(clip => clip.voice)).toEqual(first.items[0]!.audio.map(clip => clip.voice));
      expect(item.audio.every(clip => clip.src.startsWith('audio/es-419-food-2/'))).toBe(true);
    }
    localStorage.setItem(spanish.packPreferenceKey, JSON.stringify(['es-419-travel-2-pictures', 'es-419-food-1-pictures']));
    expect(initialPackIds(spanish.packs, spanish.packPreferenceKey)).toEqual(['es-419-travel-2-pictures', 'es-419-food-1-pictures']);
    localStorage.clear();
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

  it('keeps the complete picture review and symmetric exclusions consistent with approved assets', () => {
    const byId = new Map(spanish.pool.items.map(item => [item.id, item]));
    expect(digest(fourthPictureReview.selectedArtworkManifest)).toBe(fourthPictureReview.selectedArtworkManifestSha256);
    expect(new Set(fourthPictureReview.inspectedAssets.map(asset => asset.id)).size).toBe(159);
    for (const asset of fourthPictureReview.inspectedAssets) {
      expect(digest(asset.path)).toBe(asset.sha256);
    }
    expect(digest(foodPictureReview.foodArtworkManifest)).toBe(foodPictureReview.foodArtworkManifestSha256);
    expect(digest(foodPictureReview.foodArtworkAcceptance)).toBe(foodPictureReview.foodArtworkAcceptanceSha256);
    expect(digest(foodPictureReview.historicalSpanishAudit)).toBe(foodPictureReview.historicalSpanishAuditSha256);
    expect(new Set(foodPictureReview.inspectedAssets.map(asset => asset.id)).size).toBe(171);
    for (const asset of foodPictureReview.inspectedAssets) expect(digest(asset.path)).toBe(asset.sha256);
    expect(digest(food2PictureReview.foodArtworkManifest)).toBe(food2PictureReview.foodArtworkManifestSha256);
    expect(digest(food2PictureReview.foodArtworkAcceptance)).toBe(food2PictureReview.foodArtworkAcceptanceSha256);
    expect(digest(food2PictureReview.historicalSpanishAudit)).toBe(food2PictureReview.historicalSpanishAuditSha256);
    expect(new Set(food2PictureReview.inspectedAssets.map(asset => asset.id)).size).toBe(202);
    for (const asset of food2PictureReview.inspectedAssets) expect(digest('public/' + byId.get(asset.id)!.image.src)).toBe(asset.sha256);
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
