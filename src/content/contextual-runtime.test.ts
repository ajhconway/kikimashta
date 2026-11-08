import { describe, expect, it } from 'vitest';
import { cardKey } from '../core/cards';
import { approvedContextualQuestions } from './contextual';
import { contextualBanks, contextualVocabulary, readyContextualCards, withAcceptedMedia } from './contextual-runtime';

describe('contextual runtime content', () => {
  it('covers all eighty questions while admitting only accepted media to practice', () => {
    const contexts = contextualBanks.flatMap(bank => bank.contexts);
    expect(contexts).toHaveLength(40);
    expect(contexts.flatMap(context => context.questions)).toHaveLength(80);
    expect(new Set(contexts.map(context => context.id)).size).toBe(40);
    expect(new Set(contexts.flatMap(context => context.questions.map(question => question.id))).size).toBe(80);
    const targets = new Set(contexts.map(context => context.targetItemId));
    expect(targets.size).toBe(10);
    for (const target of targets) for (const stage of ['simple', 'contrastive']) {
      expect(contexts.filter(context => context.targetItemId === target && (context.stage ?? 'contrastive') === stage)).toHaveLength(2);
    }
    expect(contexts.filter(context => context.review.text === 'pending')).toHaveLength(17);
    expect(contextualBanks.flatMap(bank => approvedContextualQuestions(bank, 'text'))).toHaveLength(12);
    expect(contextualBanks.flatMap(bank => approvedContextualQuestions(bank, 'picture'))).toHaveLength(6);
    const cards = readyContextualCards(contextualBanks, contextualVocabulary);
    expect(cards).toHaveLength(10);
    expect(new Set(cards.map(cardKey)).size).toBe(cards.length);
  });

  it('does not activate audio when the accepted text or revisions differ', () => {
    const banks = structuredClone(contextualBanks);
    banks[0]!.contexts[0]!.sentence.text += '変更';
    expect(() => withAcceptedMedia(banks)).toThrow(/differs/);
    const changed = structuredClone(contextualBanks);
    changed[0]!.contexts[0]!.questions[0]!.revision++;
    expect(() => withAcceptedMedia(changed)).toThrow(/differs/);
  });
});
