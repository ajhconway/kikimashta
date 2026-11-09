import { describe, expect, it } from 'vitest';
import type { PracticeCard, WordItem } from '../types';
import { japaneseWordNeighbors, selectWordChoices, type WordNeighborRelations } from './distractors';
import { cardKey } from './cards';
import { masteryLevels } from './mastery';
import { createMasterySample } from './mastery-demo';
import { practicePool } from './practice';
import { createQuestions, requeueMissedQuestion } from './session';
import { cardPacks, selectedPracticeCards } from './packs';

const word = (id: string): WordItem => ({ id, language: 'ja-JP', theme: 'test', text: id, label: id,
  image: { src: `${id}.png`, source: 'generated', alt: id }, audio: [{ src: `${id}.mp3`, source: 'synthesized' }] });
const target = word('target');
const fixture = [target, ...['s', 'p', 'b'].flatMap(prefix => Array.from({ length: 6 }, (_, i) => word(`${prefix}${i}`)))];
const fixed = () => .999;
function relations(pairs: string[][] = []): WordNeighborRelations {
  return { language: 'ja-JP', semanticIds: id => id === 'target' ? fixture.filter(w => w.id.startsWith('s')).map(w => w.id) : undefined,
    pronunciationIds: () => fixture.filter(w => w.id.startsWith('p')).map(w => w.id),
    pictureExcluded: (a, b) => pairs.some(pair => pair.includes(a) && pair.includes(b)),
  };
}
const card = (exercise: PracticeCard['exercise'] = 'audio-picture'): PracticeCard => ({ item: target, exercise });

describe('mastery-based word distractors (#200)', () => {
  it.each([
    [0, 0, 0, 3], [1, 0, 0, 3], [2, 1, 0, 2], [3, 2, 0, 1],
    [4, 3, 0, 0], [5, 2, 1, 0], [6, 1, 2, 0], [7, 0, 3, 0],
  ])('uses existing mastery level %s for its semantic/pronunciation mixture', (level, semantic, pronunciation, broad) => {
    const result = selectWordChoices(card(), fixture, masteryLevels[level]!, fixed, relations());
    const alternatives = result.choices.filter(item => item.id !== target.id);
    expect(result.choices).toHaveLength(4);
    expect(alternatives.filter(item => item.id.startsWith('s'))).toHaveLength(semantic);
    expect(alternatives.filter(item => item.id.startsWith('p'))).toHaveLength(pronunciation);
    expect(alternatives.filter(item => item.id.startsWith('b'))).toHaveLength(broad);
    expect(result.choicePolicy?.actual).toEqual({ semantic, pronunciation, broad });
    expect(result.choiceKinds[target.id]).toBe('correct');
    for (const item of alternatives) expect(result.choiceKinds[item.id]).toBe(item.id.startsWith('s') ? 'semantic' : item.id.startsWith('p') ? 'pronunciation' : 'broad');
  });

  it('filters pack scope before finding neighbors and substitutes easier valid choices when needed', () => {
    const pool = fixture.filter(item => ['target', 's5', 'b0', 'b1'].includes(item.id));
    const before = structuredClone(pool);
    const result = selectWordChoices(card(), pool, masteryLevels[7], fixed, relations());
    expect(result.choices.map(item => item.id).sort()).toEqual(pool.map(item => item.id).sort());
    expect(result.choicePolicy).toMatchObject({ mastery: 'Mastered', actual: { semantic: 1, pronunciation: 0, broad: 2 } });
    expect(result.choiceKinds).toEqual({ target: 'correct', s5: 'semantic', b0: 'broad', b1: 'broad' });
    expect(pool).toEqual(before);
  });

  it('applies exclusions among alternatives and backtracks rather than rejecting an available valid combination', () => {
    const pool = fixture.filter(item => ['target', 's0', 's1', 's2', 's3'].includes(item.id));
    const result = selectWordChoices(card(), pool, masteryLevels[4], fixed,
      relations([['s0', 's1'], ['s0', 's2'], ['s0', 's3']]));
    expect(result.choices.map(item => item.id).sort()).toEqual(['s1', 's2', 's3', 'target']);
    expect(result.choicePolicy?.actual.semantic).toBe(3);
  });

  it.each([
    ['s', 4, { semantic: 2, pronunciation: 0, broad: 1 }],
    ['p', 7, { semantic: 0, pronunciation: 2, broad: 1 }],
  ] as const)('retains the most available %s neighbors before adding broad fallback choices', (prefix, level, actual) => {
    const pool = fixture.filter(item => ['target', `${prefix}0`, `${prefix}1`, `${prefix}2`, 'b0', 'b1'].includes(item.id));
    const result = selectWordChoices(card(), pool, masteryLevels[level], fixed,
      relations([[`${prefix}0`, `${prefix}1`], [`${prefix}0`, `${prefix}2`]]));
    expect(result.choicePolicy?.actual).toEqual(actual);
    expect(result.choices.map(item => item.id)).toEqual(expect.arrayContaining([`${prefix}1`, `${prefix}2`]));
    expect(result.choices.map(item => item.id)).not.toContain(`${prefix}0`);
  });

  it('keeps picture-only collisions out of pictures while allowing distinct written answers', () => {
    const excluded = relations([['target', 's0']]);
    const picture = selectWordChoices(card(), fixture, masteryLevels[4], fixed, excluded);
    const writing = selectWordChoices(card('audio-text'), fixture, masteryLevels[4], fixed, excluded);
    expect(picture.choices.map(item => item.id)).not.toContain('s0');
    expect(writing.choices.map(item => item.id)).toContain('s0');
  });

  it('excludes cross-language choices, normalized homophones and duplicate visible options', () => {
    const heard = { ...target, reading: 'たーげっと' };
    const alias = { ...word('alias'), reading: 'ターゲット' };
    const duplicate = { ...word('duplicate'), image: target.image };
    const foreign = { ...word('foreign'), language: 'es-419' };
    const result = selectWordChoices({ item: heard, exercise: 'audio-picture' },
      [...fixture.slice(1), heard, alias, duplicate, foreign], masteryLevels[4], fixed, relations());
    expect(result.choices.map(item => item.id)).not.toEqual(expect.arrayContaining(['alias']));
    expect(result.choices.some(item => ['alias', 'duplicate', 'foreign'].includes(item.id))).toBe(false);
    expect(new Set(result.choices.map(item => item.image.src)).size).toBe(4);
  });

  it('preserves current selection for unprepared languages without a mastery policy snapshot', () => {
    const pool = fixture.map(item => ({ ...item, language: 'es-419' }));
    const result = selectWordChoices({ item: pool[0]!, exercise: 'audio-picture' }, pool, masteryLevels[7], fixed, relations());
    expect(result.choices).toHaveLength(4);
    expect(result.choicePolicy).toBeUndefined();
    expect(result.choices.every(item => item.language === 'es-419')).toBe(true);
  });

  it('keeps picture and writing mastery independent and preserves the original policy through corrective retries', () => {
    const item = practicePool.items.find(item => item.text === '本')!;
    const picture: PracticeCard = { item, exercise: 'audio-picture' };
    const writing: PracticeCard = { item, exercise: 'audio-text' };
    const schedules = new Map([[cardKey(writing), createMasterySample(writing, 4, Date.UTC(2026, 10, 9))]]);
    const questions = createQuestions([picture, writing], practicePool.items, fixed, schedules);
    const first = questions.find(question => question.exercise === 'audio-picture')!;
    const second = questions.find(question => question.exercise === 'audio-text')!;
    expect(first.choicePolicy?.mastery).toBe('New');
    expect(second.choicePolicy?.mastery).toBe('Steady');
    const index = questions.indexOf(second);
    schedules.set(cardKey(writing), createMasterySample(writing, 1, Date.UTC(2026, 10, 9)));
    const retry = requeueMissedQuestion(questions, index, 'miss', fixed).find(question => question.retryOf)!;
    expect(retry.choicePolicy).toBe(second.choicePolicy);
    expect(retry.choiceKinds).toBe(second.choiceKinds);
    expect(retry.choices.map(item => item.id).sort()).toEqual(second.choices.map(item => item.id).sort());
    expect(createQuestions([writing], practicePool.items, fixed, schedules)[0]!.choicePolicy?.mastery).toBe('Learning');
  });

  it('adapts newly approved writing-only words while keeping their homophones out of the choices', () => {
    const pool = selectedPracticeCards(practicePool.items, cardPacks.filter(pack => pack.exercise === 'audio-text').map(pack => pack.id)).map(card => card.item);
    const artificial = pool.find(item => item.text === '人工')!;
    const population = pool.find(item => item.text === '人口')!;
    for (const [target, homophone] of [[artificial, population], [population, artificial]]) {
      const result = selectWordChoices({ item: target!, exercise: 'audio-text' }, pool, masteryLevels[7], fixed);
      expect(result.choicePolicy?.mastery).toBe('Mastered');
      expect(result.choices.map(item => item.id)).not.toContain(homophone!.id);
    }
  });

  it('builds safe scoped choices across every Japanese pack and the combined bank at low and high mastery', () => {
    const scopes = [...[1, 2, 3, 4, 5].map(level => cardPacks.filter(pack => pack.sourceLevel === level)), cardPacks];
    for (const packs of scopes) {
      const cards = selectedPracticeCards(practicePool.items, packs.map(pack => pack.id));
      for (const target of cards) for (const level of [0, 4, 7]) {
        const pool = cards.filter(card => card.exercise === target.exercise).map(card => card.item);
        const { choices } = selectWordChoices(target, pool, masteryLevels[level]!, fixed);
        expect(choices).toHaveLength(4);
        expect(new Set(choices.map(item => item.id)).size).toBe(4);
        expect(choices.every(item => pool.some(candidate => candidate.id === item.id))).toBe(true);
        if (target.exercise === 'audio-picture') {
          for (const first of choices) for (const second of choices) {
            expect(japaneseWordNeighbors.pictureExcluded(first.id, second.id)).toBe(false);
          }
        }
      }
    }
  });
});
