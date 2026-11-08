import type { ContextualBank, ContextualOption } from './contextual-types';

export interface ContextualAnswerAmendments {
  schemaVersion: 1;
  language: string;
  issue: number;
  supportingVocabulary: ContextualBank['supportingVocabulary'];
  amendments: {
    questionId: string;
    sourceRevision: number;
    revision: number;
    addedOption: ContextualOption;
  }[];
}

export function withAnswerVocabulary<T extends { id: string }>(vocabulary: readonly T[], additions: readonly T[]): T[] {
  const result = [...vocabulary, ...additions];
  if (new Set(result.map(word => word.id)).size !== result.length) throw new Error('Duplicate contextual answer vocabulary.');
  return result;
}

/** Answer-only revisions leave approved speech inputs and their provenance intact. (#163) */
export function withAnswerAmendments(banks: readonly ContextualBank[], changes: ContextualAnswerAmendments): ContextualBank[] {
  if (changes.schemaVersion !== 1) throw new Error('Unsupported contextual answer amendment schema.');
  const byQuestion = new Map(changes.amendments.map(change => [change.questionId, change]));
  if (byQuestion.size !== changes.amendments.length) throw new Error('Duplicate contextual answer amendment.');
  const support = new Map(changes.supportingVocabulary.map(word => [word.id, word]));
  if (support.size !== changes.supportingVocabulary.length) throw new Error('Duplicate amended supporting vocabulary.');
  const seen = new Set<string>();
  const result = banks.map(bank => {
    const needed = new Set<string>();
    const contexts = bank.contexts.map(context => ({ ...context, questions: context.questions.map(question => {
      const change = byQuestion.get(question.id);
      if (!change) return question;
      if (seen.has(question.id) || bank.language !== changes.language || question.revision !== change.sourceRevision ||
          !Number.isSafeInteger(change.revision) || change.revision !== change.sourceRevision + 1 || question.options.length !== 3) {
        throw new Error('Stale or incompatible contextual answer amendment: ' + question.id);
      }
      if (question.options.some(option => option.id === change.addedOption.id)) throw new Error('Duplicate amended choice: ' + question.id);
      seen.add(question.id);
      for (const id of change.addedOption.supportingVocabularyIds) needed.add(id);
      return { ...question, revision: change.revision, options: [...question.options, change.addedOption] };
    }) }));
    const existing = new Map(bank.supportingVocabulary.map(word => [word.id, word]));
    const added: ContextualBank['supportingVocabulary'] = [];
    for (const id of needed) {
      const original = existing.get(id), amendment = support.get(id);
      if (original && amendment && (original.text !== amendment.text || original.reading !== amendment.reading || original.meaning !== amendment.meaning)) {
        throw new Error('Conflicting amended supporting vocabulary: ' + id);
      }
      if (!original) {
        if (!amendment) throw new Error('Missing amended supporting vocabulary: ' + id);
        added.push(amendment);
      }
    }
    return { ...bank, contexts, supportingVocabulary: [...bank.supportingVocabulary, ...added] };
  });
  if (seen.size !== byQuestion.size) throw new Error('Unknown contextual answer amendment question.');
  for (const bank of result) for (const context of bank.contexts) for (const question of context.questions) {
    if (question.options.length !== 4) throw new Error('Contextual questions require exactly four choices: ' + question.id);
    for (const field of ['id', 'text', 'reading', 'meaning'] as const) {
      const values = question.options.map(option => {
        const value = option[field];
        if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid contextual choice ' + field + ': ' + question.id);
        const normalized = value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
        return field === 'reading' ? normalized.replace(/[ァ-ヶ]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0x60)) : normalized;
      });
      if (new Set(values).size !== values.length) throw new Error('Duplicate contextual choice ' + field + ': ' + question.id);
    }
  }
  return result;
}
