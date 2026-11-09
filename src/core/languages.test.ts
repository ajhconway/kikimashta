import { beforeEach, describe, expect, it } from 'vitest';
import { createQuestions, validateBank } from './session';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import spanish from '../../content/es-419.json';
import activation from '../../content/spanish-travel-audio/activation.json';
import { initialLanguage, languagePreferenceKey, learningLanguages } from './languages';
import { initialPackIds, packPreferenceKey, selectedPracticeCards, type CardPack } from './packs';

beforeEach(() => localStorage.clear());
describe('learning languages', () => {
  it('defaults to Japanese and safely restores a known language', () => {
    expect(initialLanguage().id).toBe('ja-JP');
    localStorage.setItem(languagePreferenceKey, 'es-419');
    expect(initialLanguage().title).toBe('Latin American Spanish');
    localStorage.setItem(languagePreferenceKey, 'unknown');
    expect(initialLanguage().id).toBe('ja-JP');
  });
  it('keeps pools and pack membership in their registered language', () => {
    for (const language of learningLanguages) {
      expect(language.pool.language).toBe(language.id);
      expect(language.pool.items.every(item => item.language === language.id)).toBe(true);
      expect(language.packs.every(pack => pack.language === language.id)).toBe(true);
    }
    expect(learningLanguages[0]!.packPreferenceKey).toBe(packPreferenceKey);
    expect(new Set(learningLanguages.map(language => language.packPreferenceKey)).size).toBe(2);
  });
  it('preserves independent empty and selected pack preferences', () => {
    const [ja, es] = learningLanguages;
    localStorage.setItem(ja!.packPreferenceKey, JSON.stringify([ja!.packs[0]!.id]));
    localStorage.setItem(es!.packPreferenceKey, '[]');
    expect(initialPackIds(ja!.packs, ja!.packPreferenceKey)).toEqual([ja!.packs[0]!.id]);
    expect(initialPackIds(es!.packs, es!.packPreferenceKey)).toEqual([]);
  });
  it('provides complete travel pictures and recorded audio with preserved provenance', () => {
    const spanishLanguage = learningLanguages[1]!;
    expect(spanish.items).toHaveLength(36);
    expect(new Set(spanish.items.map(item => item.id)).size).toBe(36);
    expect(new Set(spanish.items.map(item => item.text)).size).toBe(36);
    expect(new Set(spanish.items.map(item => item.image.src)).size).toBe(36);
    expect(spanish.items.some(item => /entrance|exit/.test(item.id))).toBe(false);
    expect(spanish.items.every(item => item.audio.length === 8 && item.audio.every(clip => clip.voice !== ('cesar' as string)))).toBe(true);
    expect(spanish.items.some(item => item.text === 'café')).toBe(true);
    for (const item of spanish.items) expect(existsSync('public/' + item.image.src)).toBe(true);
    validateBank(spanishLanguage.pool);
    expect(spanishLanguage.pool.items).toHaveLength(108);
    for (const media of activation.images) {
      expect(createHash('sha256').update(readFileSync('public/' + media.src)).digest('hex')).toBe(media.sha256);
    }
    expect(spanishLanguage.packs.map(pack => pack.exercise)).toEqual(['audio-picture', 'audio-picture', 'audio-picture']);
    const cards = selectedPracticeCards(spanishLanguage.pool.items, spanishLanguage.packs.map(pack => pack.id), spanishLanguage.packs);
    expect(cards).toHaveLength(108);
    expect(createQuestions(cards, spanishLanguage.pool.items, () => 0.5)).toHaveLength(108);
  });
  it('filters retired Spanish writing selections without reviving an empty selection', () => {
    const language = learningLanguages[1]!;
    localStorage.setItem(language.packPreferenceKey, JSON.stringify(['es-419-travel-1-pictures', 'es-419-travel-1-writing']));
    expect(initialPackIds(language.packs, language.packPreferenceKey)).toEqual(['es-419-travel-1-pictures']);
    localStorage.setItem(language.packPreferenceKey, JSON.stringify(['es-419-travel-1-writing']));
    expect(initialPackIds(language.packs, language.packPreferenceKey)).toEqual([]);
    expect(selectedPracticeCards(language.pool.items, ['es-419-travel-1-writing'], language.packs)).toEqual([]);
  });
  it('cannot admit another language through a colliding item ID', () => {
    const item = learningLanguages[0]!.pool.items[0]!;
    const pack: CardPack = { id: 'es-test', title: 'Test', language: 'es-419', exercise: 'audio-text', itemIds: [item.id] };
    expect(selectedPracticeCards([item], [pack.id], [pack])).toEqual([]);
    expect(selectedPracticeCards([{ ...item, language: 'es-419' }], [pack.id], [pack])).toHaveLength(1);
  });
});
