import type { Exercise, PracticeCard, WordItem } from '../types';
import type { ContextualAnswerFormat, ContextualBank, ContextualItem, ContextualQuestion } from '../content/contextual-types';
import { approvedContextualQuestions } from '../content/contextual';
import { cardKey, isContextualExercise } from './cards';
import { contextualQuestion } from './contextual-questions';
import { createMasterySample } from './mastery-demo';
import { masteryLevels } from './mastery';
import type { ScheduledWord } from './scheduler';
import { createQuestions, shuffled, type Question } from './session';

export interface DevReviewOptions {
  exercises: Exercise[];
  masteryLevels: number[];
  count: number;
  timerMode: 'mastery' | 'random' | 'untimed';
}
export interface DevReviewType {
  exercise: Exercise;
  label: string;
  count: number;
}
export const devReviewTypes: readonly Omit<DevReviewType, 'count'>[] = [
  { exercise: 'audio-picture', label: 'Words · Pictures' },
  { exercise: 'audio-text', label: 'Words · Writing' },
  { exercise: 'context-simple-picture', label: 'Simple contexts · Pictures' },
  { exercise: 'context-simple-text', label: 'Simple contexts · Writing' },
  { exercise: 'context-contrastive-picture', label: 'Contrastive contexts · Pictures' },
  { exercise: 'context-contrastive-text', label: 'Contrastive contexts · Writing' },
];
export const defaultDevReviewOptions: DevReviewOptions = {
  exercises: ['audio-picture', 'audio-text'], masteryLevels: [0, 1, 2, 3, 4, 5, 6, 7], count: 8, timerMode: 'mastery',
};

export interface DevReviewEntry {
  card: PracticeCard;
  contextual?: { context: ContextualItem; question: ContextualQuestion; format: ContextualAnswerFormat };
}

/** Ready content only; sample mastery bypasses real unlocks, never pack/language boundaries. */
export function devReviewEntries(cards: readonly PracticeCard[], banks: readonly ContextualBank[], vocabulary: readonly WordItem[]): DevReviewEntry[] {
  const entries: DevReviewEntry[] = cards.filter(card => !isContextualExercise(card.exercise)).map(card => ({ card }));
  const selected = new Set(cards.map(cardKey));
  for (const bank of banks) for (const format of ['picture', 'text'] as const) {
    for (const { context, question } of approvedContextualQuestions(bank, format)) {
      const target = vocabulary.find(item => item.id === context.targetItemId && item.language === bank.language);
      if (!target || (!selected.has(cardKey({ item: target, exercise: format === 'picture' ? 'audio-picture' : 'audio-text' })) &&
          !selected.has(cardKey({ item: target, exercise: `context-${context.stage ?? 'contrastive'}-${format}` })))) continue;
      if (!context.recordings.some(recording => recording.sentenceSrc && recording.questionSrcs[question.id])) continue;
      entries.push({ card: { item: target, exercise: `context-${context.stage ?? 'contrastive'}-${format}` },
        contextual: { context, question, format } });
    }
  }
  return entries;
}

export function availableDevReviewTypes(entries: readonly DevReviewEntry[]): DevReviewType[] {
  return devReviewTypes.map(type => ({ ...type, count: entries.filter(entry => entry.card.exercise === type.exercise).length }))
    .filter(type => type.count > 0);
}

export function createDevReview(entries: readonly DevReviewEntry[], options: DevReviewOptions, at: number, random = Math.random, voiceIds?: readonly string[], vocabulary: readonly WordItem[] = []) {
  const levels = [...new Set(options.masteryLevels)].sort((a, b) => a - b);
  if (!levels.length || levels.some(level => !Number.isInteger(level) || level < 0 || level >= masteryLevels.length)) throw new Error('Choose at least one valid mastery level.');
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 48) throw new Error('Choose between 1 and 48 questions.');
  if (!['mastery', 'random', 'untimed'].includes(options.timerMode)) throw new Error('Choose a timer behavior.');
  const types = shuffled(availableDevReviewTypes(entries).filter(type => options.exercises.includes(type.exercise)), random);
  if (!types.length) throw new Error('No review types match your selected packs.');
  const pools = new Map(types.map(type => [type.exercise, shuffled(entries.filter(entry => entry.card.exercise === type.exercise), random)]));
  // Cover every selected type/level pair before repeating, while shorter sessions
  // still sample all levels/types as evenly as their question count permits.
  const combinations = levels.length >= types.length
    ? types.flatMap((_, round) => levels.map((level, index) => ({ level, exercise: types[(index + round) % types.length]!.exercise })))
    : levels.flatMap((_, round) => types.map((type, index) => ({ level: levels[(index + round) % levels.length]!, exercise: type.exercise })));
  const visits = new Map<Exercise, number>();
  const schedules = new Map<string, ScheduledWord | undefined>();
  const questions: Question[] = Array.from({ length: options.count }, (_, index) => {
    const { exercise, level } = combinations[index % combinations.length]!;
    const pool = pools.get(exercise)!;
    const visit = visits.get(exercise) ?? 0;
    const entry = pool[visit % pool.length]!;
    visits.set(exercise, visit + 1);
    const authored = entry.contextual;
    const question = authored
      ? contextualQuestion(authored.context, authored.question, authored.format, vocabulary, random, voiceIds)
      : createQuestions([entry.card], pool.map(candidate => candidate.card.item), random)[0]!;
    const demoId = `dev-review-${index}`;
    schedules.set(demoId, createMasterySample(entry.card, level, at));
    return { ...question, demoId };
  });
  const ordered: Question[] = [];
  for (let offset = 0; offset < questions.length; offset += combinations.length) {
    ordered.push(...shuffled(questions.slice(offset, offset + combinations.length), random));
  }
  return { questions: ordered, schedules };
}
