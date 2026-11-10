import { describe, expect, it } from 'vitest';
import type { PracticeCard } from '../types';
import { contextualBanks, contextualVocabulary } from '../content/contextual-runtime';
import { cardMastery } from './mastery';
import { availableDevReviewTypes, createDevReview, defaultDevReviewOptions, devReviewEntries } from './dev-review';
import { practicePool } from './practice';

const at = Date.parse('2026-11-08T12:00:00Z');
const cards: PracticeCard[] = ['cat', 'dog', 'apple', 'cup'].flatMap(id => (['audio-picture', 'audio-text'] as const).map(exercise => ({
  exercise, item: { id, language: 'ja-JP', theme: 'test', label: id, text: id,
    image: { src: `images/${id}.png`, source: 'generated' as const, alt: id },
    audio: [{ src: `audio/${id}.mp3`, source: 'synthesized' as const }] },
})));

describe('configured simulated Dev review (#152)', () => {
  it('uses each real word sample level when constructing its distractors', () => {
    const cards: PracticeCard[] = practicePool.items.map(item => ({ item, exercise: 'audio-picture' }));
    const { questions, schedules } = createDevReview(devReviewEntries(cards, [], []),
      { ...defaultDevReviewOptions, exercises: ['audio-picture'], masteryLevels: [0, 4, 7], count: 6 }, at, () => .999);
    for (const question of questions) {
      expect(question.choicePolicy?.mastery).toBe(cardMastery(schedules.get(question.demoId!)).label);
      expect(question.choicePolicy?.version).toBe('word-neighbors-v1');
    }
  });
  it('balances selected types and levels, repeats small pools as independent samples, and is deterministic', () => {
    const entries = devReviewEntries(cards, [], []);
    const before = structuredClone(entries);
    const options = { ...defaultDevReviewOptions, masteryLevels: [0, 4, 7], count: 12 };
    const result = createDevReview(entries, options, at, () => .2);
    expect(result).toEqual(createDevReview(entries, options, at, () => .2));
    expect(result.questions).toHaveLength(12);
    expect(new Set(result.questions.map(question => question.demoId)).size).toBe(12);
    expect(result.questions.filter(question => question.exercise === 'audio-picture')).toHaveLength(6);
    const levels = result.questions.map(question => cardMastery(result.schedules.get(question.demoId!)).label);
    for (const label of ['New', 'Steady', 'Mastered']) expect(levels.filter(level => level === label)).toHaveLength(4);
    expect(entries).toEqual(before);
    for (const question of result.questions) expect(question.choices).toHaveLength(4);
    for (const cycle of [result.questions.slice(0, 6), result.questions.slice(6, 12)]) {
      expect(new Set(cycle.map(question => `${question.exercise}/${cardMastery(result.schedules.get(question.demoId!)).label}`)).size).toBe(6);
    }
  });

  it.each([
    { masteryLevels: [8] }, { count: 49 }, { exercises: [] },
  ])('rejects invalid or empty options %j', change => {
    expect(() => createDevReview(devReviewEntries(cards, [], []), { ...defaultDevReviewOptions, ...change }, at, () => .5)).toThrow();
  });

  it('limits contextual samples to ready questions and the selected target/language/format', () => {
    const bank = contextualBanks.find(bank => bank.contexts.some(context => context.questions.some(question => question.formats.includes('picture'))))!;
    const context = bank.contexts.find(context => context.questions.some(question => question.formats.includes('picture')))!;
    const target = contextualVocabulary.find(item => item.id === context.targetItemId)!;
    const selected: PracticeCard[] = [{ item: target, exercise: 'audio-picture' }];
    const subset = { ...bank, contexts: [context] };
    const entries = devReviewEntries(selected, [subset], contextualVocabulary);
    const type = `context-${context.stage ?? 'contrastive'}-picture` as const;
    expect(availableDevReviewTypes(entries).map(type => type.exercise)).toEqual(['audio-picture', type]);
    const result = createDevReview(entries, { ...defaultDevReviewOptions, exercises: [type], masteryLevels: [7], count: 2 }, at, () => .3, ['otani'], contextualVocabulary);
    for (const question of result.questions) {
      expect(question.target.id).toBe(target.id);
      expect(question.exercise).toBe(type);
      expect(question.contextual?.recording?.voice).toBe('otani');
      expect(question.contextual?.recording?.questionSrcs[question.contextual.question.id]).toBeTruthy();
      expect(cardMastery(result.schedules.get(question.demoId!)).label).toBe('Mastered');
      expect(question.choicePolicy).toBeUndefined();
    }
    expect(devReviewEntries([{ item: { ...target, language: 'es-419' }, exercise: 'audio-picture' }], [subset], contextualVocabulary)).toHaveLength(1);
    expect(devReviewEntries(selected, [{ ...subset, contexts: [{ ...context, review: { text: 'pending', audio: 'pending' } }] }], contextualVocabulary)).toHaveLength(1);
  });
});
