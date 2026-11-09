import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import starter from '../../content/ja.json';
import catalogue from '../../content/catalog/ja.json';
import library from '../../public/vocabulary/library-data.json';
import { practicePool } from './practice';
import type { WordItem } from '../types';

const items = catalogue.items as (Omit<WordItem, 'theme' | 'label'> & { meaning: string })[];

describe('active practice pool', () => {
  it('keeps shared WaniKani IDs and excludes retired starter words from the adaptive pool', () => {
    const shared = starter.items.filter(item => catalogue.items.some(entry => entry.id === item.id));
    expect(practicePool.items.slice(0, shared.length)).toEqual(shared);
    for (const item of practicePool.items.slice(shared.length)) {
      const source = catalogue.items.find(entry => entry.id === item.id)!;
      expect(item).toMatchObject({ id: source.id, text: source.text, reading: source.reading,
        label: source.meaning, image: source.image, audio: source.audio });
    }
    expect(practicePool.items.every(item => catalogue.items.some(entry => entry.id === item.id))).toBe(true);
    expect(practicePool.items.length).toBeGreaterThan(30);
    expect(new Set(practicePool.items.map(item => item.id)).size).toBe(practicePool.items.length);
    expect(new Set(practicePool.items.map(item => item.image.src)).size).toBe(practicePool.items.length);
    expect(new Set(practicePool.items.map(item => item.reading ?? item.text)).size).toBe(practicePool.items.length);
    for (const item of practicePool.items) {
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
  });
});
