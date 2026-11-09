import { describe, expect, it } from 'vitest';
import { cardKey } from '../core/cards';
import { approvedContextualQuestions } from './contextual';
import { withAnswerAmendments, type ContextualAnswerAmendments } from './contextual-answers';
import answerAmendments from '../../content/contextual/answer-amendments.json';
import pack1Source from '../../content/contextual/ja-wanikani-1-draft.json';
import pack1Policy from '../../content/contextual/pack-1/practice-policy.json';
import { spanishBasicContexts } from './spanish-basic';
import { contextualBanks, contextualVocabulary, pack1ContextualBank, readyContextualCards, recordedContextualBanks, withAcceptedMedia } from './contextual-runtime';

const historicalBanks = withAnswerAmendments(recordedContextualBanks, answerAmendments as ContextualAnswerAmendments);

describe('contextual runtime content', () => {
  it('preserves all eighty accepted pilot questions and their historical practice identities', () => {
    const japanese = historicalBanks;
    const contexts = japanese.flatMap(bank => bank.contexts);
    expect(contexts).toHaveLength(40);
    expect(contexts.flatMap(context => context.questions)).toHaveLength(80);
    expect(contexts.flatMap(context => context.questions).every(question => question.options.length === 4)).toBe(true);
    expect(new Set(contexts.map(context => context.id)).size).toBe(40);
    expect(new Set(contexts.flatMap(context => context.questions.map(question => question.id))).size).toBe(80);
    const targets = new Set(contexts.map(context => context.targetItemId));
    expect(targets.size).toBe(10);
    for (const target of targets) for (const stage of ['simple', 'contrastive']) {
      expect(contexts.filter(context => context.targetItemId === target && (context.stage ?? 'contrastive') === stage)).toHaveLength(2);
    }
    expect(contexts.filter(context => context.review.text === 'pending')).toHaveLength(0);
    expect(contexts.filter(context => context.review.audio === 'pending')).toHaveLength(0);
    expect(contexts.filter(context => context.review.audio === 'approved')).toHaveLength(40);
    expect(contexts.filter(context => context.recordings.length === 2)).toHaveLength(40);
    expect(japanese.flatMap(bank => approvedContextualQuestions(bank, 'text'))).toHaveLength(80);
    expect(japanese.flatMap(bank => approvedContextualQuestions(bank, 'picture'))).toHaveLength(32);
    const cards = readyContextualCards(japanese, contextualVocabulary);
    expect(cards).toHaveLength(34);
    expect(new Set(cards.map(cardKey)).size).toBe(cards.length);
  });

  it('switches only the three replaced pilot targets after complete listening acceptance and retains Spanish contexts', () => {
    const accepted = pack1ContextualBank.contexts.every(context => context.review.audio === 'approved');
    const legacy = historicalBanks.flatMap(bank => bank.contexts);
    const superseded = new Set(pack1Policy.supersededPilotItemIds);
    const expectedIds = accepted
      ? [...legacy.filter(context => !superseded.has(context.targetItemId)), ...pack1Source.contexts].map(context => context.id)
      : legacy.map(context => context.id);
    const actual = contextualBanks.filter(bank => bank.language === 'ja-JP').flatMap(bank => bank.contexts);
    expect(actual.map(context => context.id).sort()).toEqual(expectedIds.sort());
    expect(actual).toHaveLength(accepted ? 144 : 40);
    expect(actual.flatMap(context => context.questions)).toHaveLength(accepted ? 288 : 80);
    expect(new Set(actual.map(context => context.targetItemId)).size).toBe(accepted ? 36 : 10);
    expect(actual.every(context => context.review.text === 'approved' && context.review.audio === 'approved')).toBe(true);
    expect(contextualBanks.find(bank => bank.id === spanishBasicContexts.id)).toEqual(spanishBasicContexts);
  });

  it('does not activate audio when the accepted text or revisions differ', () => {
    const banks = structuredClone(recordedContextualBanks);
    banks[0]!.contexts[0]!.sentence.text += '変更';
    expect(() => withAcceptedMedia(banks)).toThrow(/differs/);
    const changed = structuredClone(recordedContextualBanks);
    changed[0]!.contexts[0]!.questions[0]!.revision++;
    expect(() => withAcceptedMedia(changed)).toThrow(/differs/);
  });

  it('preserves explicit text or audio rejection despite an older acceptance manifest', () => {
    for (const rejected of ['text', 'audio'] as const) {
      const banks = structuredClone(recordedContextualBanks);
      const context = banks[0]!.contexts[0]!;
      context.review = { text: 'approved', audio: 'pending', [rejected]: 'rejected' };
      context.recordings = [];
      const result = withAcceptedMedia(banks);
      expect(result[0]!.contexts[0]!.review[rejected]).toBe('rejected');
      expect(result[0]!.contexts[0]!.recordings).toEqual([]);
      expect(approvedContextualQuestions(result[0]!, 'text').some(entry => entry.context.id === context.id)).toBe(false);
    }
  });
});
