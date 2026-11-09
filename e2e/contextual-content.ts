import { readFileSync } from 'node:fs';
import type { ContextualBank } from '../src/content/contextual-types';
import spanish from '../content/spanish-basic-1/draft.json' with { type: 'json' };

const banks = ['ja-pilot.json', 'ja-simple-pilot.json', 'ja-simple-expansion.json', 'ja-wanikani-1-draft.json'].map(file =>
  JSON.parse(readFileSync(new URL('../content/contextual/' + file, import.meta.url), 'utf8')) as ContextualBank);
const questions = [...banks.flatMap(bank => bank.contexts.flatMap(context => context.questions)),
  ...spanish.contexts.map(context => ({ id: context.id + '-question', prompt: context.question, correctOptionId: context.correctOptionId,
    options: context.options.map(option => ({ ...option, imageItemId: option.vocabularyItemId })) }))];

export function authoredContextualQuestion(id: string | null) {
  const question = questions.find(question => question.id === id);
  if (!question) throw new Error('Unknown authored contextual question: ' + id);
  return question;
}
