import type { Exercise, PracticeCard, WordBank, WordItem } from '../types';
import { cardKey } from './cards';
import type { ContextualItem, ContextualQuestion, ContextualRecording } from '../content/contextual-types';

export interface Question {
  target: WordItem; exercise: Exercise; choices: WordItem[]; retryOf?: string; demoId?: string;
  /** First contextual encounter: review UI, initial-learning evidence. */
  introduction?: boolean;
  contextual?: { context: ContextualItem; question: ContextualQuestion; recording?: ContextualRecording };
}

export function correctChoiceId(question: Question): string {
  return question.contextual?.question.correctOptionId ?? question.target.id;
}

export function validateBank(bank: WordBank): void {
  if (!bank.id || !bank.language || !Array.isArray(bank.items) || bank.items.length < 2) throw new Error('A bank needs at least two words.');
  const ids = new Set<string>();
  for (const item of bank.items) {
    if (!item.id || ids.has(item.id)) throw new Error('Word IDs must be present and unique.');
    ids.add(item.id);
    if (item.wordExercises !== undefined && (!Array.isArray(item.wordExercises) || !item.wordExercises.length ||
        new Set(item.wordExercises).size !== item.wordExercises.length || item.wordExercises.some(exercise => !['audio-picture', 'audio-text'].includes(exercise)))) throw new Error('Invalid word exercise eligibility: ' + item.id);
    if (item.language !== bank.language || !item.theme || !item.text || !item.image?.src || !Array.isArray(item.audio) || !item.audio.length || item.audio.some(recording => !recording.src)) throw new Error('Incomplete word: ' + item.id);
    for (const path of [item.image.src, ...item.audio.map(recording => recording.src)]) {
      if (path.startsWith('/') || path.includes('..') || /^[a-z]+:/i.test(path)) throw new Error('Media paths must be relative to the app.');
    }
  }
  for (const item of bank.items) {
    if (item.pictureDistractorExclusions !== undefined && (!Array.isArray(item.pictureDistractorExclusions) ||
        item.pictureDistractorExclusions.some(id => typeof id !== 'string' || id === item.id || !ids.has(id)))) throw new Error('Invalid picture distractor exclusion: ' + item.id);
  }
}

export function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const normalized = (text: string) => text.normalize('NFKC').trim();

function questionFor({ item: target, exercise }: PracticeCard, pool: WordItem[], choiceCount: number, random: () => number): Question {
  const visible = (item: WordItem) => exercise === 'audio-picture' ? item.image.src : normalized(item.text);
  const seen = new Set([visible(target)]);
  const candidates = shuffled(pool.filter(item => item.id !== target.id && item.language === target.language), random).filter(item => {
    if (exercise === 'audio-picture' && (target.pictureDistractorExclusions?.includes(item.id) || item.pictureDistractorExclusions?.includes(target.id))) return false;
    if (seen.has(visible(item)) || normalized(item.reading ?? item.text) === normalized(target.reading ?? target.text)) return false;
    seen.add(visible(item));
    return true;
  });
  if (candidates.length < choiceCount - 1) throw new Error('Enough distinct, unambiguous choices are required.');
  return { target, exercise, choices: shuffled([target, ...candidates.slice(0, choiceCount - 1)], random) };
}

/** Build mixed questions for a fixed card snapshot; each question keeps one answer format. */
export function createQuestions(targets: PracticeCard[], pool: WordItem[], random = Math.random): Question[] {
  if (!targets.length) return [];
  if (new Set(targets.map(cardKey)).size !== targets.length) throw new Error('Targets must be unique cards.');
  return shuffled(targets, random).map(card => questionFor(card, pool, 4, random));
}

/** Revisit a miss within this block without admitting any new due-word targets. */
export function requeueMissedQuestion(questions: readonly Question[], index: number, attemptId: string, random = Math.random): Question[] {
  if (!Number.isInteger(index) || index < 0 || index >= questions.length || !attemptId) throw new Error('A retry needs a current question and miss ID.');
  const current = questions[index]!;
  const retryOf = current.retryOf ?? attemptId;
  const result = [...questions];
  // Repeating a transition cannot leave multiple pending copies of this miss.
  if (questions.slice(index + 1).some(question => question.retryOf === retryOf)) return result;
  const firstPosition = Math.min(index + 2, questions.length);
  const positions = questions.length - firstPosition + 1;
  // Finish the current sample set before revisiting demo mistakes.
  const insertion = current.demoId ? questions.length
    : firstPosition + Math.min(positions - 1, Math.max(0, Math.floor(random() * positions)));
  const retry: Question = { ...current, retryOf, choices: shuffled(current.choices, random) };
  result.splice(insertion, 0, retry);
  return result;
}
