import { describe, expect, it } from 'vitest';
import { learningLanguages } from './languages';
import { spanishNeighborBank } from '../../scripts/content/spanish-neighbor-utils.mjs';

describe('Spanish evaluation bank preparation (#222)', () => {
  it('matches actual ordinary app words, pack membership and effective picture exclusions', () => {
    const language = learningLanguages.find(language => language.id === 'es-419')!;
    const prepared = spanishNeighborBank(process.cwd());
    expect(prepared.map(item => item.id).sort()).toEqual(language.pool.items.map(item => item.id).sort());
    for (const item of prepared) {
      const actual = language.pool.items.find(word => word.id === item.id)!;
      expect(item).toMatchObject({ text: actual.text, label: actual.label, language: actual.language, image: actual.image, audio: actual.audio });
      expect(item.pictureDistractorExclusions?.slice().sort()).toEqual(actual.pictureDistractorExclusions?.slice().sort());
      expect(language.packs.find(pack => pack.id === item.packId)?.itemIds).toContain(item.id);
      expect(item.packIds).toEqual(language.packs.filter(pack => pack.itemIds.includes(item.id)).map(pack => pack.id).sort());
    }
    const ids = new Set(prepared.map(item => item.id));
    expect(language.foundationCards?.every(card => !ids.has(card.item.id))).toBe(true);
    expect(prepared).toHaveLength(language.pool.items.length);
    expect(prepared.find(item => item.text === 'arroz')?.packIds).toContain('es-419-food-1-pictures');
    expect(prepared.find(item => item.text === 'vaso')?.packIds).toEqual(['es-419-food-2-pictures', 'es-419-travel-2-pictures']);
    expect(prepared.filter(item => item.packIds.includes('es-419-food-2-pictures'))).toHaveLength(36);
  });
});
