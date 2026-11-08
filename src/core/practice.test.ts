import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import starter from '../../content/ja.json';
import catalogue from '../../content/catalog/ja.json';
import selections from '../../content/practice-sets.json';
import library from '../../public/vocabulary/library-data.json';
import { buildPracticeBanks, practiceBanks, practicePool } from './practice';
import type { WordItem } from '../types';
import { createSession } from './session';

const items = catalogue.items as (Omit<WordItem, 'theme' | 'label'> & { meaning: string })[];

describe('playable practice banks', () => {
  it('preserves the starter bank and resolves new words without changing identity or media', () => {
    expect(practiceBanks[0]).toEqual(starter);
    expect(practiceBanks).toHaveLength(4);
    const starterIds = new Set(starter.items.map(item => item.id));
    for (const bank of practiceBanks.slice(1)) {
      expect(bank.items).toHaveLength(6);
      expect(createSession(bank, 6, 4, () => 0.5)).toHaveLength(6);
      for (const item of bank.items) {
        const original = catalogue.items.find(entry => entry.id === item.id)!;
        expect(starterIds.has(item.id)).toBe(false);
        expect(item).toMatchObject({ id: original.id, text: original.text, reading: original.reading, image: original.image, audio: original.audio });
        expect(item.label).toBe(original.meaning);
      }
    }
  });

  it('uses available media and distinct, unflagged visual concepts in each new set', () => {
    for (const bank of practiceBanks) {
      for (const item of bank.items) {
        for (const src of [item.image.src, ...item.audio.map(clip => clip.src)]) {
          expect(existsSync(resolve('public', src)), src).toBe(true);
        }
      }
    }
    for (const bank of practiceBanks.slice(1)) {
      const cards = bank.items.map(item => library.cards.find(card => card.id === item.id)!);
      expect(cards.every(card => card && !card.reviewRequired)).toBe(true);
      expect(new Set(cards.map(card => card.visualGroup)).size).toBe(6);
      expect(new Set(cards.map(card => card.concept)).size).toBe(6);
    }
  });

  it('keeps an eligible adaptive pool with original starter IDs, no flagged cards or duplicate cues', () => {
    expect(practicePool.items.slice(0, starter.items.length)).toEqual(starter.items);
    expect(practicePool.items.length).toBeGreaterThan(30);
    expect(new Set(practicePool.items.map(item => item.id)).size).toBe(practicePool.items.length);
    expect(new Set(practicePool.items.map(item => item.image.src)).size).toBe(practicePool.items.length);
    expect(new Set(practicePool.items.map(item => item.reading ?? item.text)).size).toBe(practicePool.items.length);
    for (const item of practicePool.items.slice(starter.items.length)) {
      expect(library.cards.find(card => card.id === item.id)?.reviewRequired).toBe(false);
      for (const src of [item.image.src, ...item.audio.map(clip => clip.src)]) expect(existsSync(resolve('public', src))).toBe(true);
    }
  });

  it('retains removed source identity and media while excluding it from playable selections', () => {
    const removedId = 'ja-v-4fd3d09440c1';
    const archived = items.find(item => item.id === removedId);
    expect(archived).toMatchObject({ text: '～形', reading: 'けい', meaning: 'Form' });
    for (const clip of archived!.audio) expect(existsSync(resolve('public', clip.src))).toBe(true);
    expect(library.cards.some(card => card.id === removedId)).toBe(false);
    expect(practicePool.items.some(item => item.id === removedId)).toBe(false);
    expect(practiceBanks.flatMap(bank => bank.items).some(item => item.id === removedId)).toBe(false);
    const removedSelection = structuredClone(selections);
    removedSelection[0]!.itemIds[0] = removedId;
    expect(() => buildPracticeBanks(items, removedSelection)).toThrow(/removed vocabulary item/i);
  });

  it('rejects unknown, duplicated and incomplete set memberships', () => {
    const unknown = structuredClone(selections);
    unknown[0]!.itemIds[0] = 'missing';
    expect(() => buildPracticeBanks(items, unknown)).toThrow(/unknown/i);
    const duplicate = structuredClone(selections);
    duplicate[0]!.itemIds[0] = duplicate[0]!.itemIds[1]!;
    expect(() => buildPracticeBanks(items, duplicate)).toThrow(/unique/i);
    const short = structuredClone(selections);
    short[0]!.itemIds.pop();
    expect(() => buildPracticeBanks(items, short)).toThrow(/six/i);
    expect(() => buildPracticeBanks(items, [selections[0]!, selections[0]!])).toThrow(/duplicate practice/i);
  });

  it('rejects repeated meanings or pictures and unsafe media before a round can start', () => {
    const selected = selections[0]!;
    const first = selected.itemIds[0]!;
    const second = selected.itemIds[1]!;
    const words = structuredClone(items);
    words.find(item => item.id === second)!.meaning = words.find(item => item.id === first)!.meaning;
    expect(() => buildPracticeBanks(words, selections)).toThrow(/distinct/i);
    const sameImage = structuredClone(items);
    sameImage.find(item => item.id === second)!.image.src = sameImage.find(item => item.id === first)!.image.src;
    expect(() => buildPracticeBanks(sameImage, selections)).toThrow(/distinct/i);
    const unsafe = structuredClone(items);
    unsafe.find(item => item.id === first)!.audio[0]!.src = '../missing.mp3';
    expect(() => buildPracticeBanks(unsafe, selections)).toThrow(/relative/i);
  });
});
