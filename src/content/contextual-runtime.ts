import contrastive from '../../content/contextual/ja-pilot.json';
import simple from '../../content/contextual/ja-simple-pilot.json';
import expansion from '../../content/contextual/ja-simple-expansion.json';
import accepted from '../../content/contextual/accepted-media.json';
import catalogue from '../../content/catalog/ja.json';
import overrides from '../../content/catalog/review-overrides.json';
import type { ContextualBank } from './contextual-types';
import type { PracticeCard, WordItem } from '../types';
import { contextualExercise } from '../core/cards';
import { approvedContextualQuestions } from './contextual';

export const contextualVocabulary: WordItem[] = catalogue.items.flatMap(item => {
  const override = overrides[item.id as keyof typeof overrides] ?? {};
  if ('removalReason' in override) return [];
  return [{ ...item, ...override, label: item.meaning, theme: 'vocabulary' } as WordItem];
});

/** Listening acceptance is applied separately from digest-bound authored text. */
export function withAcceptedMedia(banks: readonly ContextualBank[]): ContextualBank[] {
  return banks.map(bank => ({ ...bank, contexts: bank.contexts.map(context => {
    const media = accepted.contexts.find(entry => entry.contextId === context.id);
    if (!media) return context;
    if (context.review.text !== 'approved' || context.revision !== media.contextRevision || context.targetItemId !== media.targetItemId || context.sentence.text !== media.sentenceText ||
        context.questions.length !== Object.keys(media.questions).length || context.questions.some(question =>
          (media.questions as Record<string, string | undefined>)[question.id] !== question.prompt.text ||
          (media.questionRevisions as Record<string, number | undefined>)[question.id] !== question.revision)) {
      throw new Error('Accepted contextual media differs from authored text: ' + context.id);
    }
    return { ...context, stage: media.stage as 'simple' | 'contrastive',
      review: { text: 'approved' as const, audio: 'approved' as const }, recordings: media.recordings };
  }) }));
}

export const contextualBanks = withAcceptedMedia([contrastive, simple, expansion] as unknown as ContextualBank[]);

export function readyContextualCards(banks: readonly ContextualBank[], vocabulary: readonly WordItem[]): PracticeCard[] {
  const result = new Map<string, PracticeCard>();
  for (const bank of banks) for (const format of ['picture', 'text'] as const) {
    for (const { context } of approvedContextualQuestions(bank, format)) {
      const item = vocabulary.find(word => word.id === context.targetItemId && word.language === bank.language);
      if (!item) throw new Error('Missing contextual target: ' + context.targetItemId);
      const exercise = contextualExercise(context.stage ?? 'contrastive', format);
      result.set(JSON.stringify([bank.language, item.id, exercise]), { item, exercise });
    }
  }
  return [...result.values()];
}
