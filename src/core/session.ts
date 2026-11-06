import type { WordBank, WordItem } from '../types';

export interface Question { target: WordItem; choices: WordItem[]; retryOf?: string }

export function validateBank(bank: WordBank): void {
  if (!bank.id || !bank.language || !Array.isArray(bank.items) || bank.items.length < 2) throw new Error('A bank needs at least two words.');
  const ids = new Set<string>();
  for (const item of bank.items) {
    if (!item.id || ids.has(item.id)) throw new Error('Word IDs must be present and unique.');
    ids.add(item.id);
    if (item.language !== bank.language || !item.theme || !item.text || !item.image?.src || !Array.isArray(item.audio) || !item.audio.length || item.audio.some(recording => !recording.src)) throw new Error('Incomplete word: ' + item.id);
    for (const path of [item.image.src, ...item.audio.map(recording => recording.src)]) {
      if (path.startsWith('/') || path.includes('..') || /^[a-z]+:/i.test(path)) throw new Error('Media paths must be relative to the app.');
    }
  }
}

function shuffled<T>(values: T[], random: () => number): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function createSession(bank: WordBank, count = 6, choiceCount = 4, random = Math.random): Question[] {
  validateBank(bank);
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(choiceCount) || choiceCount < 2 || choiceCount > bank.items.length) throw new Error('Invalid session size or picture count.');
  return shuffled(bank.items, random).slice(0, count).map(target => ({
    target,
    choices: shuffled([target, ...shuffled(bank.items.filter(item => item.id !== target.id), random).slice(0, choiceCount - 1)], random),
  }));
}

/** Build questions for a fixed target snapshot; unrelated due items cannot enter it. */
export function createQuestions(targets: WordItem[], pool: WordItem[], random = Math.random): Question[] {
  if (!targets.length) return [];
  if (new Set(targets.map(item => item.id)).size !== targets.length) throw new Error('Targets must be unique.');
  return shuffled(targets, random).map(target => {
    const seen = new Set([target.image.src]);
    const candidates = shuffled(pool.filter(item => item.id !== target.id && item.language === target.language), random).filter(item => {
      if (seen.has(item.image.src) || (item.reading ?? item.text) === (target.reading ?? target.text)) return false;
      seen.add(item.image.src);
      return true;
    });
    if (candidates.length < 3) throw new Error('Four distinct pictures are required.');
    return { target, choices: shuffled([target, ...candidates.slice(0, 3)], random) };
  });
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
  const insertion = firstPosition + Math.min(positions - 1, Math.max(0, Math.floor(random() * positions)));
  const retry: Question = { ...current, retryOf, choices: shuffled(current.choices, random) };
  result.splice(insertion, 0, retry);
  return result;
}
