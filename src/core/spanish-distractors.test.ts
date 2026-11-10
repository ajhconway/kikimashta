import { describe, expect, it } from 'vitest';
import type { WordItem } from '../types';
import { neighborRelations, selectWordChoices, type WordNeighborRelations } from './distractors';
import { learningLanguages } from './languages';
import { masteryLevels } from './mastery';
import { createQuestions, requeueMissedQuestion } from './session';
import { cardKey } from './cards';
import { createMasterySample } from './mastery-demo';

const language = learningLanguages.find(language => language.id === 'es-419')!;
const fixed = () => .999;
const word = (id: string): WordItem => ({ id, language: 'es-419', theme: 'test', text: id, label: id,
  image: { src: `${id}.png`, source: 'generated', alt: id }, audio: [{ src: `${id}.mp3`, source: 'synthesized' }] });
const target = word('target');
const fixture = [target, ...['s', 'p', 'b'].flatMap(prefix => Array.from({ length: 8 }, (_, index) => word(`${prefix}${index}`)))];
const prepared: WordNeighborRelations = {
  language: 'es-419',
  semanticIds: id => id === target.id ? fixture.filter(item => item.id.startsWith('s')).map(item => item.id) : undefined,
  pronunciationIds: () => fixture.filter(item => item.id.startsWith('p')).map(item => item.id),
  pronunciationKey: id => ['target', 's0', 'p0', 'b0'].includes(id) ? 'same-pronunciation' : id,
  pictureExcluded: (a, b) => [a, b].includes('s1') || [a, b].includes('p1'),
};

describe('selected Spanish word neighbors (#222)', () => {
  // The shared selector suite owns the complete mastery mixture table.
  it('applies the shared Strong mixture to prepared Spanish relations', () => {
    const level = masteryLevels[5];
    const result = selectWordChoices({ item: target, exercise: 'audio-picture' }, fixture, level, fixed, prepared);
    expect(result.choicePolicy).toMatchObject({ mastery: level.label,
      requested: level.distractors, actual: { ...level.distractors, broad: 3 - level.distractors.semantic - level.distractors.pronunciation } });
    expect(result.choices).toHaveLength(4);
    expect(result.choices.some(item => ['s0', 'p0', 'b0', 's1', 'p1'].includes(item.id))).toBe(false);
    expect(result.writingChoicePolicy).toBeUndefined();
  });

  it('filters scope, target homophones and picture collisions before sampling ranked candidates', () => {
    // First two ranks are excluded; rank seven remains in the first six valid words.
    const pool = fixture.filter(item => item.id !== 's2' && item.id !== 'p2');
    for (const level of [masteryLevels[4], masteryLevels[7]]) {
      const result = selectWordChoices({ item: target, exercise: 'audio-picture' }, pool, level, fixed, prepared);
      const selected = result.choices.filter(item => item.id !== target.id);
      expect(selected.map(item => item.id)).toEqual(level === masteryLevels[4] ? ['s3', 's4', 's5'] : ['p3', 'p4', 'p5']);
      expect(selected.every(item => pool.includes(item))).toBe(true);
    }
  });

  it('uses canonical keys for same-pronunciation exclusion at low mastery too, without stripping stress accents', () => {
    const ids = ['target', 'homophone', 'stress-contrast', 'other', 'last'];
    const words = ids.map(word);
    words[0]!.text = 'papa'; words[1]!.text = 'papa-alias'; words[2]!.text = 'papá';
    const relations = neighborRelations({ schemaVersion: 1, language: 'es-419', ids,
      semantic: ids.map(id => ids.map((_, index) => index).filter(index => ids[index] !== id)), pronunciation: ids.map(() => []),
      pronunciationKeys: ['ˈpa-pa', 'ˈpa-pa', 'pa-ˈpa', 'otro', 'final'], pictureExclusionPairs: [] });
    for (const level of masteryLevels) {
      const result = selectWordChoices({ item: words[0]!, exercise: 'audio-picture' }, words, level, fixed, relations);
      expect(result.choices.map(item => item.id).sort()).toEqual(['last', 'other', 'stress-contrast', 'target']);
    }
  });

  it('chooses Spanish relations by language and snapshots exact kinds and choices through retries', () => {
    const item = language.pool.items.find(item => item.text === 'café')!;
    const card = { item, exercise: 'audio-picture' as const };
    const schedules = new Map([[cardKey(card), createMasterySample(card, 5, Date.UTC(2026, 10, 9))]]);
    const original = createQuestions([card], language.pool.items, fixed, schedules)[0]!;
    expect(original.choicePolicy).toMatchObject({ mastery: 'Strong', actual: { semantic: 2, pronunciation: 1, broad: 0 } });
    expect(original.choices.every(choice => choice.language === 'es-419')).toBe(true);
    schedules.set(cardKey(card), createMasterySample(card, 0, Date.UTC(2026, 10, 9)));
    const retry = requeueMissedQuestion([original], 0, 'spanish-miss', fixed).find(question => question.retryOf)!;
    expect(retry.choicePolicy).toBe(original.choicePolicy);
    expect(retry.choiceKinds).toBe(original.choiceKinds);
    expect(retry.choices.map(choice => choice.id).sort()).toEqual(original.choices.map(choice => choice.id).sort());
    expect(createQuestions([card], language.pool.items, fixed, schedules)[0]!.choicePolicy?.mastery).toBe('New');
  });

  it('keeps unprepared languages on their ordinary selection path', () => {
    const pool = fixture.map(item => ({ ...item, language: 'fr-FR' }));
    const result = selectWordChoices({ item: pool[0]!, exercise: 'audio-picture' }, pool, masteryLevels[7], fixed);
    expect(result.choicePolicy).toBeUndefined();
    expect(result.choices).toHaveLength(4);
    expect(Object.values(result.choiceKinds).filter(kind => kind !== 'correct')).toEqual(['broad', 'broad', 'broad']);
  });
});
