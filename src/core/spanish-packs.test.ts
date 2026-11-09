import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WordBank } from '../types';
import first from '../../content/es-419.json';
import second from '../../content/es-419-travel-2.json';
import third from '../../content/es-419-travel-3.json';
import fourth from '../../content/es-419-travel-4.json';
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
import { initialPackIds, selectedPracticeCards } from './packs';
import { createQuestions, validateBank } from './session';

const spanish = learningLanguages.find(language => language.id === 'es-419')!;
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('Spanish travel levels', () => {
  it('keeps separate pack membership and restores existing device choices', () => {
    expect(spanish.pool.items).toHaveLength(159);
    expect(new Set(spanish.pool.items.map(item => item.id)).size).toBe(159);
    for (const bank of [first, second, third, fourth] as WordBank[]) {
      const cards = selectedPracticeCards(spanish.pool.items, [`${bank.id}-pictures`], spanish.packs);
      expect(cards.map(card => card.item.id)).toEqual(bank.items.map(item => item.id));
      expect(cards.every(card => card.exercise === 'audio-picture')).toBe(true);
      for (const item of bank.items) expect(spanish.pool.items.find(word => word.id === item.id)).toMatchObject({
        ...item, pictureDistractorExclusions: expect.arrayContaining(item.pictureDistractorExclusions ?? []),
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
    expect(new Set(fourthPictureReview.inspectedAssets.map(asset => asset.id)).size).toBe(spanish.pool.items.length);
    for (const asset of fourthPictureReview.inspectedAssets) {
      expect(digest('public/' + byId.get(asset.id)!.image.src)).toBe(asset.sha256);
    }
    for (const pair of fourthPictureReview.addedSymmetricPairs) expect(exclusions.pairs).toContainEqual(pair);
    for (const pair of exclusions.pairs) {
      const [left, right] = pair.ids;
      expect(byId.get(left!)?.pictureDistractorExclusions).toContain(right);
      expect(byId.get(right!)?.pictureDistractorExclusions).toContain(left);
    }
  });

  const scopes = Array.from({ length: (1 << spanish.packs.length) - 1 }, (_, index) => ({
    packIds: spanish.packs.filter((_, bit) => (index + 1) & (1 << bit)).map(pack => pack.id),
  }));
  it.each(scopes)('keeps ambiguous pictures out of choices for $packIds', ({ packIds }) => {
      const cards = selectedPracticeCards(spanish.pool.items, packIds, spanish.packs);
      const pool = cards.map(card => card.item);
      for (let seed = 1; seed <= 3; seed++) {
        let state = seed;
        const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
        const questions = createQuestions(cards, pool, random);
        expect(questions).toHaveLength(cards.length);
        for (const question of questions) {
          expect(question.choices).toHaveLength(4);
          expect(question.choices.map(choice => choice.id)).toContain(question.target.id);
          expect(question.choices.every(choice => pool.some(item => item.id === choice.id))).toBe(true);
          for (const other of question.choices.filter(choice => choice.id !== question.target.id)) {
            expect(question.target.pictureDistractorExclusions ?? []).not.toContain(other.id);
            expect(other.pictureDistractorExclusions ?? []).not.toContain(question.target.id);
          }
        }
      }
  });
});
