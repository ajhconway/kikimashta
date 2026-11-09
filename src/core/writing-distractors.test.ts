import { describe, expect, it } from 'vitest';
import type { WordItem } from '../types';
import { selectWordChoices, type WordNeighborRelations } from './distractors';
import { masteryLevels } from './mastery';
import { createQuestions, requeueMissedQuestion } from './session';
import { createMasterySample } from './mastery-demo';
import { cardKey } from './cards';

const fixed = () => .999;
const word = (id: string, text: string, reading: string): WordItem => ({ id, text, reading, language: 'ja-JP', theme: 'test', label: text,
  image: { src: `${id}.png`, alt: text, source: 'generated' }, audio: [{ src: `${id}.mp3`, source: 'synthesized' }] });
const target = word('target', '上げる', 'あげる');
const matches = [word('a', '下げる', 'さげる'), word('b', '広げる', 'ひろげる'), word('c', '投げる', 'なげる')];
const others = [word('n1', '出かける', 'でかける'), word('n2', '上がる', 'あがる'), word('n3', '立てる', 'たてる'),
  word('n4', '見る', 'みる'), word('n5', '食べる', 'たべる'), word('n6', '止める', 'とめる')];
const pool = [target, ...others, ...matches];
const relations = (semantic = [...others, ...matches], pronunciation: WordItem[] = []): WordNeighborRelations => ({
  language: 'ja-JP', semanticIds: () => semantic.map(item => item.id), pronunciationIds: () => pronunciation.map(item => item.id), pictureExcluded: () => false,
});

describe('mastery-based writing plausibility (#221)', () => {
  it('starts at Familiar, preserves mixtures, and finds matching forms beyond the original six', () => {
    const card = { item: target, exercise: 'audio-text' as const };
    const before = selectWordChoices(card, pool, masteryLevels[2], fixed, relations());
    expect(before.writingChoicePolicy).toBeUndefined();
    expect(before.choiceKinds.n1).toBe('semantic');
    const familiar = selectWordChoices(card, pool, masteryLevels[3], fixed, relations());
    expect(familiar.choicePolicy?.actual).toEqual({ semantic: 2, pronunciation: 0, broad: 1 });
    expect(familiar.writingChoicePolicy).toEqual({ version: 'trailing-kana-v1', ending: 'げる', matching: 2, fallback: 1 });
    const steady = selectWordChoices(card, pool, masteryLevels[4], fixed, relations());
    expect(steady.choices.map(item => item.id).sort()).toEqual(['a', 'b', 'c', 'target']);
    expect(steady.writingChoicePolicy).toMatchObject({ matching: 3, fallback: 0 });
  });

  it('maximizes matching endings across overlapping sources within the requested mixture', () => {
    const result = selectWordChoices({ item: target, exercise: 'audio-text' }, pool, masteryLevels[5], fixed,
      relations([matches[0]!, matches[1]!, ...others], [matches[0]!, matches[2]!, ...others]));
    expect(result.choicePolicy?.actual).toEqual({ semantic: 2, pronunciation: 1, broad: 0 });
    expect(result.writingChoicePolicy).toMatchObject({ matching: 3, fallback: 0 });
    expect(result.choiceKinds.c).toBe('pronunciation');
  });

  it.each([0, .2, .6, .999])('retains matching candidates and their ranked six-window with random %s', value => {
    const extra = [word('d', '曲げる', 'まげる'), word('e', '逃げる', 'にげる'), word('f', '焦げる', 'こげる'), word('g', '遂げる', 'とげる')];
    const scoped = [...pool, ...extra];
    const result = selectWordChoices({ item: target, exercise: 'audio-text' }, scoped, masteryLevels[4], () => value,
      relations([...others, ...matches, ...extra]));
    const alternatives = result.choices.filter(item => item.id !== target.id);
    expect(alternatives).toHaveLength(3);
    expect(alternatives.every(item => ['a', 'b', 'c', 'd', 'e', 'f'].includes(item.id))).toBe(true);
    expect(result.writingChoicePolicy).toMatchObject({ matching: 3, fallback: 0 });
  });

  it.each([6, 7])('retains ending preference in pronunciation-heavy mastery level %s', level => {
    const result = selectWordChoices({ item: target, exercise: 'audio-text' }, pool, masteryLevels[level]!, fixed,
      relations([...others, ...matches], [...others, ...matches]));
    expect(result.writingChoicePolicy).toMatchObject({ matching: 3, fallback: 0 });
    expect(result.choicePolicy?.actual).toEqual({ ...masteryLevels[level]!.distractors, broad: 0 });
  });

  it('uses normal scoped fallbacks without altering displayed words or admitting homophones', () => {
    const alias = word('homophone', '揚げる', 'あげる');
    const scoped = [target, alias, matches[0]!, ...others];
    const original = structuredClone(scoped);
    const result = selectWordChoices({ item: target, exercise: 'audio-text' }, scoped, masteryLevels[4], fixed, relations());
    expect(result.choices).toHaveLength(4);
    expect(result.choices.map(item => item.id)).not.toContain('homophone');
    expect(result.choices.every(item => scoped.includes(item))).toBe(true);
    expect(result.writingChoicePolicy).toMatchObject({ matching: 1, fallback: 2 });
    expect(scoped).toEqual(original);
  });

  it('keeps pictures, early levels, other languages and words without a kana ending outside the policy', () => {
    expect(selectWordChoices({ item: target, exercise: 'audio-picture' }, pool, masteryLevels[4], fixed, relations()).writingChoicePolicy).toBeUndefined();
    for (const level of masteryLevels.slice(0, 3)) expect(selectWordChoices({ item: target, exercise: 'audio-text' }, pool, level, fixed, relations()).writingChoicePolicy).toBeUndefined();
    const foreign = pool.map(item => ({ ...item, language: 'es-419' }));
    expect(selectWordChoices({ item: foreign[0]!, exercise: 'audio-text' }, foreign, masteryLevels[4], fixed, relations()).writingChoicePolicy).toBeUndefined();
    const bare = word('bare', '犬', 'いぬ');
    expect(selectWordChoices({ item: bare, exercise: 'audio-text' }, [bare, ...pool], masteryLevels[4], fixed, relations()).writingChoicePolicy).toBeUndefined();
  });

  it('retains exact diagnostics and canonical choices on corrective retry', () => {
    const card = { item: target, exercise: 'audio-text' as const };
    const schedules = new Map([[cardKey(card), createMasterySample(card, 4, Date.UTC(2026, 10, 9))]]);
    const original = createQuestions([card], pool, fixed, schedules);
    const retry = requeueMissedQuestion(original, 0, 'miss', fixed).find(question => question.retryOf)!;
    expect(retry.writingChoicePolicy).toBe(original[0]!.writingChoicePolicy);
    expect(retry.choices.map(item => item.id).sort()).toEqual(original[0]!.choices.map(item => item.id).sort());
  });
});
