import type { LearningLanguage } from '../core/languages';
import { selectedPracticeCards } from '../core/packs';
import { approvedContextualQuestions } from '../content/contextual';
import { contextualBanks, contextualVocabulary } from '../content/contextual-runtime';

/** Include every possible recording, future unlock and authored answer in this scope. */
export function offlineMedia(language: LearningLanguage, packIds: readonly string[]): string[] {
  const urls = new Set<string>();
  const add = (src: string | undefined) => { if (src) urls.add(src); };
  const cards = selectedPracticeCards(language.pool.items, packIds, language.packs);
  const targetIds = new Set(language.packs.filter(pack => packIds.includes(pack.id)).flatMap(pack => pack.itemIds));
  for (const { item } of [...cards, ...(language.foundationCards ?? []).filter(card => targetIds.has(card.item.id))]) {
    add(item.image.src);
    item.audio.forEach(recording => add(recording.src));
  }
  for (const bank of contextualBanks.filter(bank => bank.language === language.id)) {
    for (const format of ['picture', 'text'] as const) {
      for (const { context, question } of approvedContextualQuestions(bank, format)) {
        if (!targetIds.has(context.targetItemId)) continue;
        for (const recording of context.recordings) {
          add(recording.sentenceSrc);
          add(recording.questionSrcs[question.id]);
        }
        const target = contextualVocabulary.find(item => item.language === language.id && item.id === context.targetItemId);
        target?.audio.forEach(recording => add(recording.src));
        for (const option of question.options) {
          if (format === 'picture') add(contextualVocabulary.find(item => item.language === language.id && item.id === option.imageItemId)?.image.src);
        }
      }
    }
  }
  return [...urls].sort();
}
