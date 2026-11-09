import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { spanishBasicContexts, spanishFoundationCards, spanishContextualVocabulary } from './spanish-basic';
import { contextualQuestion } from '../core/contextual-questions';
import { learningLanguages } from '../core/languages';
import { selectedPracticeCards } from '../core/packs';
import draft from '../../content/spanish-basic-1/draft.json';

describe('Basic Spanish foundation runtime', () => {
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
