import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { spanishBasicContexts, spanishFoundationCards, spanishContextualVocabulary } from './spanish-basic';
import { contextualQuestion } from '../core/contextual-questions';
import { learningLanguages } from '../core/languages';
import { selectedPracticeCards } from '../core/packs';
import draft from '../../content/spanish-basic-1/draft.json';
import food from '../../content/es-419-food-1.json';
import { contextualVocabulary } from './contextual-runtime';

describe('Basic Spanish foundation runtime', () => {
  it('uses the accepted cooked rice in contextual choices and library data while Japanese retains raw rice', () => {
    const rice = food.items.find(item => item.id === 'es-419-travel-rice')!;
    const ordinary = learningLanguages.find(language => language.id === 'es-419')!.pool.items.find(item => item.id === rice.id)!;
    expect(ordinary.image).toEqual(rice.image);
    expect(spanishContextualVocabulary.find(item => item.id === rice.id)!.image).toEqual(rice.image);
    expect(contextualVocabulary.find(item => item.id === rice.id)!.image).toEqual(rice.image);
    const contexts = spanishBasicContexts.contexts.filter(context => context.questions.some(question => question.options.some(option => option.imageItemId === rice.id)));
    expect(contexts.length).toBeGreaterThan(0);
    for (const context of contexts) {
      const question = contextualQuestion(context, context.questions[0]!, 'picture', contextualVocabulary, () => 0, ['juan']);
      const optionId = context.questions[0]!.options.find(option => option.imageItemId === rice.id)!.id;
      expect(question.choices.find(item => item.id === optionId)!.image).toEqual(rice.image);
    }
    expect(contextualVocabulary.find(item => item.id === 'ja-v-0958f7553d9f')!.image.src).toBe('images/approved/ja-v-0958f7553d9f-304fac5b04e1.jpg');
  });
  it('admits 15 ordinary pictures and nine independent foundation contexts without abstract word cards', () => {
    const language = learningLanguages.find(language => language.id === 'es-419')!;
    const cards = selectedPracticeCards(language.pool.items, ['es-419-basic-1-pictures'], language.packs);
    expect(cards).toHaveLength(15);
    expect(spanishFoundationCards).toHaveLength(9);
    expect(cards.every(card => !spanishFoundationCards.some(foundation => foundation.item.id === card.item.id))).toBe(true);
    expect(spanishFoundationCards.every(card => card.exercise === 'context-simple-picture')).toBe(true);
  });
  it('uses approved Spanish text, four travel answer pictures and paired preferred recordings', () => {
    for (const [index, context] of spanishBasicContexts.contexts.entries()) {
      const approved = draft.contexts[index]!;
      expect(context.sentence.text).toBe(approved.sentence.text);
      expect(context.questions[0]!.prompt.text).toBe(approved.question.text);
      expect(context.introduction?.text).toBe(spanishFoundationCards.find(card => card.item.id === context.targetItemId)!.item.text);
      const question = contextualQuestion(context, context.questions[0]!, 'picture', spanishContextualVocabulary, () => 0, ['pamela']);
      expect(question.contextual!.recording!.voice).toBe('pamela');
      expect(question.choices).toHaveLength(4);
      expect(question.choices.every(choice => existsSync('public/' + choice.image.src))).toBe(true);
      for (const clip of context.recordings) {
        expect(existsSync('public/' + clip.sentenceSrc)).toBe(true);
        expect(existsSync('public/' + clip.questionSrcs[context.questions[0]!.id])).toBe(true);
      }
    }
  });
});
