import type { WordBank, WordItem } from '../types';

export interface Question { target: WordItem; choices: WordItem[] }

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
