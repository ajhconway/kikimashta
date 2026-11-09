import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import catalogue from '../../content/catalog/ja.json';
import selection from '../../content/practice-pool.json';
import starter from '../../content/ja.json';
import policy from '../../content/contextual/pack-1/practice-policy.json';
import { contextualVocabulary } from '../content/contextual-runtime';
import type { PracticeCard } from '../types';
import { practicePool } from './practice';
import { cardPacks, selectedPracticeCards } from './packs';
import { cardKey } from './cards';
import { selectedContextualCards } from './contextual-progression';
import { createQuestions } from './session';

const picturePack = 'ja-wanikani-1-pictures';
const writingPack = 'ja-wanikani-1-writing';
const directTargets = policy.contextualOnlyItemIds.map(itemId => ({ itemId, language: policy.language }));

describe('pack 1 word prerequisites and contextual-only scope', () => {
  it('adds exactly twelve writing prerequisites without admitting any additional word pictures', () => {
    const oldIds = new Set([...selection.itemIds, ...starter.items.filter(item => catalogue.items.some(word => word.id === item.id)).map(item => item.id)]);
    const allPacks = cardPacks.map(pack => pack.id);
    const cards = selectedPracticeCards(practicePool.items, allPacks);
    expect(new Set(cards.filter(card => card.exercise === 'audio-picture').map(card => card.item.id))).toEqual(oldIds);
    const added = cards.filter(card => !oldIds.has(card.item.id));
    expect(added.map(card => card.item.id).sort()).toEqual([...policy.writingOnlyItemIds].sort());
    expect(added.every(card => card.exercise === 'audio-text')).toBe(true);
    for (const { item } of added) {
      expect(item.audio).toHaveLength(8);
      expect(item.audio.every(recording => existsSync(new URL('../../public/' + recording.src, import.meta.url)))).toBe(true);
    }
    expect(selectedPracticeCards(practicePool.items, [picturePack]).some(card => policy.writingOnlyItemIds.includes(card.item.id))).toBe(false);
    expect(selectedPracticeCards(practicePool.items, [writingPack]).filter(card => policy.writingOnlyItemIds.includes(card.item.id))).toHaveLength(12);
    expect(practicePool.items.some(item => policy.contextualOnlyItemIds.includes(item.id))).toBe(false);
  });

  it('keeps both homophones as writing targets and excludes them from each other’s choices', () => {
    const cards = selectedPracticeCards(practicePool.items, [writingPack]);
    const targets = cards.filter(card => ['人工', '人口'].includes(card.item.text));
    expect(targets).toHaveLength(2);
    for (const question of createQuestions(targets, cards.map(card => card.item), () => 0.5)) {
      expect(question.choices).toHaveLength(4);
      expect(question.choices.filter(item => ['人工', '人口'].includes(item.text))).toEqual([question.target]);
    }
  });

  it('directly admits only ready simple cards for the three contextual-only targets, within the chosen format/language', () => {
    const item = contextualVocabulary.find(word => word.id === policy.contextualOnlyItemIds[0])!;
    const ready: PracticeCard[] = [ { item, exercise: 'context-simple-text' }, { item, exercise: 'context-contrastive-text' } ];
    const writingScope = selectedPracticeCards(contextualVocabulary, [writingPack]);
    expect(selectedContextualCards(writingScope, ready, new Set(), directTargets)).toEqual([ready[0]]);
    expect(selectedContextualCards(selectedPracticeCards(contextualVocabulary, [picturePack]), ready, new Set(), directTargets)).toEqual([]);
    expect(selectedContextualCards([], ready, new Set(), directTargets)).toEqual([]);
    expect(selectedContextualCards(writingScope, [], new Set(), directTargets)).toEqual([]);
    expect(selectedContextualCards(writingScope, ready, new Set(), [{ itemId: item.id, language: 'es-419' }])).toEqual([]);
    expect(selectedContextualCards(writingScope, ready, new Set([cardKey(ready[1]!)]), directTargets)).toEqual(ready);
  });

  it('retains the word-earned gate for new writing-only words rather than treating admission as mastery', () => {
    const item = contextualVocabulary.find(word => word.id === policy.writingOnlyItemIds[0])!;
    const ready: PracticeCard[] = [{ item, exercise: 'context-simple-text' }];
    const scope = selectedPracticeCards(contextualVocabulary, [writingPack]);
    expect(selectedContextualCards(scope, ready, new Set(), directTargets)).toEqual([]);
    expect(selectedContextualCards(scope, ready, new Set([cardKey(ready[0]!)]), directTargets)).toEqual(ready);
  });
});
