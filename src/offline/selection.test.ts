import { describe, expect, it } from 'vitest';
import { learningLanguages } from '../core/languages';
import { contextualBanks, contextualVocabulary } from '../content/contextual-runtime';
import { approvedContextualQuestions } from '../content/contextual';
import { offlineMedia } from './selection';

describe('offline pack dependencies', () => {
  it('keeps empty selection empty and isolates language and pack membership', () => {
    for (const language of learningLanguages) expect(offlineMedia(language, [])).toEqual([]);
    const spanish = learningLanguages[1]!;
    const selected = spanish.packs[0]!;
    const urls = offlineMedia(spanish, [selected.id]);
    for (const item of spanish.pool.items.filter(item => selected.itemIds.includes(item.id))) {
      expect(urls).toContain(item.image.src);
      for (const recording of item.audio) expect(urls).toContain(recording.src);
    }
    expect(urls).not.toContain(learningLanguages[0]!.pool.items[0]!.audio[0]!.src);
    expect(new Set(urls).size).toBe(urls.length);
  });
  it('covers future contextual unlocks, every voice and out-of-pack answer pictures', () => {
    const language = learningLanguages[0]!;
    const pack = language.packs[0]!;
    const urls = offlineMedia(language, [pack.id]);
    let questions = 0;
    for (const bank of contextualBanks.filter(bank => bank.language === language.id)) {
      for (const { context, question } of approvedContextualQuestions(bank, 'picture')) {
        if (!pack.itemIds.includes(context.targetItemId)) continue;
        questions++;
        for (const recording of context.recordings) {
          expect(urls).toContain(recording.sentenceSrc);
          expect(urls).toContain(recording.questionSrcs[question.id]);
        }
        for (const option of question.options) {
          const item = contextualVocabulary.find(item => item.id === option.imageItemId && item.language === language.id)!;
          expect(urls).toContain(item.image.src);
        }
      }
    }
    expect(questions).toBeGreaterThan(0);
  });
});
