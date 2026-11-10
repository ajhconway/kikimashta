import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import bank from '../../content/es-419-travel-5.json';
import activation from '../../content/spanish-travel-5/activation.json';
import acceptance from '../../content/spanish-travel-5/acceptance.json';
import pictureReview from '../../content/spanish-travel-5/picture-choice-review.json';
import exclusions from '../../content/spanish-picture-exclusions.json';
import { learningLanguages } from './languages';
import { selectedPracticeCards } from './packs';
import { cardKey } from './cards';
import { validateBank } from './session';
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const language = learningLanguages.find(l => l.id === 'es-419')!;
const pack = 'es-419-travel-5-pictures';

describe('Travel level 5 activation (#243)', () => {
  it('ships all accepted pictures and eight-voice deliveries without changing their bytes', () => {
    validateBank(language.pool);
    expect(bank.items).toHaveLength(36);
    expect(activation.images).toHaveLength(36);
    expect(activation.recordings).toHaveLength(288);
    expect(digest('content/spanish-travel-5/acceptance.json')).toBe(activation.acceptanceSha256);
    expect(digest(acceptance.mediaManifest)).toBe(acceptance.mediaManifestSha256);
    for (const asset of [...activation.images, ...activation.recordings]) expect(digest('public/' + asset.src)).toBe(asset.sha256);
    for (const item of bank.items) {
      expect(item.audio.map(clip => clip.voice)).toEqual(activation.voices.map(voice => voice.voice));
      expect(item.audio.every(clip => clip.src.startsWith('audio/es-419-travel-5/'))).toBe(true);
    }
    expect(activation.images.find(image => image.id === 'es-419-travel-draw')?.version).toBe(3);
    expect(activation.recordings.filter(clip => clip.targetLimited).map(clip => [clip.id, clip.voice])).toEqual([['es-419-travel-record', 'carlos-figueroa']]);
  });
  it('selects 36 new picture cards with distinct progress keys', () => {
    const cards = selectedPracticeCards(language.pool.items, [pack], language.packs);
    expect(cards.map(card => card.item.id)).toEqual(bank.items.map(item => item.id));
    expect(cards.every(card => card.exercise === 'audio-picture')).toBe(true);
    const together = selectedPracticeCards(language.pool.items, [pack, 'es-419-travel-1-pictures'], language.packs);
    expect(together).toHaveLength(72);
    expect(new Set(together.map(cardKey)).size).toBe(72);
    expect(language.packs).toHaveLength(8);
    expect(language.pool.items).toHaveLength(238);
  });
  it('keeps the full picture-choice audit bound to current images and symmetric exclusions', () => {
    expect(pictureReview.inspectedAssets).toHaveLength(238);
    expect(new Set(pictureReview.inspectedAssets.map(asset => asset.id)).size).toBe(238);
    for (const asset of pictureReview.inspectedAssets) {
      const word = language.pool.items.find(item => item.id === asset.id)!;
      expect(asset.path).toBe('public/' + word.image.src);
      expect(digest(asset.path)).toBe(asset.sha256);
    }
    for (const pair of pictureReview.addedSymmetricPairs) {
      expect(exclusions.pairs).toContainEqual(pair);
      const [left, right] = pair.ids;
      expect(language.pool.items.find(item => item.id === left)?.pictureDistractorExclusions).toContain(right);
      expect(language.pool.items.find(item => item.id === right)?.pictureDistractorExclusions).toContain(left);
    }
  });

});
