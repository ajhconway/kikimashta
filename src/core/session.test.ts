import { describe, expect, it } from 'vitest';
import type { WordBank } from '../types';
import { createSession, validateBank } from './session';

function bank(): WordBank {
  return {
    id: 'starter', language: 'ja-JP', title: 'Starter words',
    items: ['cat', 'dog', 'apple', 'banana', 'umbrella', 'cup'].map(id => ({
      id, language: 'ja-JP', theme: 'everyday', label: id, text: id,
      image: { src: `images/${id}.webp`, source: 'generated', alt: id },
      audio: [{ src: `audio/${id}.mp3`, source: 'synthesized' }],
    })),
  };
}

describe('practice sessions', () => {
  it('offers unique pictures with exactly one correct choice and no repeated targets', () => {
    const words = bank();
    const original = structuredClone(words);
    const values = [0, 0.1, 0.25, 0.55, 0.9, 0.999];
    let call = 0;
    const session = createSession(words, 6, 4, () => values[call++ % values.length]!);

    expect(session).toHaveLength(6);
    expect(new Set(session.map(question => question.target.id)).size).toBe(6);
    for (const question of session) {
      const ids = question.choices.map(choice => choice.id);
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
      expect(ids.filter(id => id === question.target.id)).toHaveLength(1);
      expect(ids.every(id => words.items.some(item => item.id === id))).toBe(true);
    }
    expect(words).toEqual(original);
  });

  it('honors a shorter session and bounds a longer session to available words', () => {
    expect(createSession(bank(), 2, 3, () => 0.5)).toHaveLength(2);
    expect(createSession(bank(), 20, 4, () => 0.5)).toHaveLength(6);
  });

  it.each([[0, 4], [1.5, 4], [6, 1], [6, 7], [6, 2.5]])(
    'rejects an invalid session size %s or choice count %s', (count, choices) => {
      expect(() => createSession(bank(), count, choices)).toThrow();
    },
  );
});

describe('word bank validation', () => {
  it('accepts a complete language bank with relative media paths', () => {
    expect(() => validateBank(bank())).not.toThrow();
  });

  it('rejects duplicate IDs and mixed languages', () => {
    const duplicate = bank();
    duplicate.items[1]!.id = duplicate.items[0]!.id;
    expect(() => validateBank(duplicate)).toThrow(/unique/i);
    const mixed = bank();
    mixed.items[0]!.language = 'es-ES';
    expect(() => validateBank(mixed)).toThrow(/incomplete/i);
  });

  it.each(['', '/images/cat.webp', '../cat.webp', 'https://example.com/cat.webp'])(
    'rejects a missing or unsafe image reference %s', path => {
      const words = bank();
      words.items[0]!.image.src = path;
      expect(() => validateBank(words)).toThrow();
    },
  );

  it('rejects a bank without enough words or a required audio asset', () => {
    const tooSmall = bank();
    tooSmall.items = tooSmall.items.slice(0, 1);
    expect(() => validateBank(tooSmall)).toThrow(/at least two/i);
    const missingAudio = bank();
    missingAudio.items[0]!.audio[0]!.src = '';
    expect(() => validateBank(missingAudio)).toThrow(/incomplete/i);
  });

  it('validates every voice variant and requires at least one recording', () => {
    const words = bank();
    words.items[0]!.audio.push({ src: 'audio/other-cat.mp3', source: 'recorded' });
    expect(() => validateBank(words)).not.toThrow();
    words.items[0]!.audio[1]!.src = '../other-cat.mp3';
    expect(() => validateBank(words)).toThrow(/relative/i);
    words.items[0]!.audio = [];
    expect(() => validateBank(words)).toThrow(/incomplete/i);
  });
});
