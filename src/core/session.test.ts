import { describe, expect, it } from 'vitest';
import type { PracticeCard, WordBank } from '../types';
import { cardKey, practiceCards } from './cards';
import { createSession, createQuestions, requeueMissedQuestion, validateBank } from './session';

function bank(): WordBank {
  return {
    id: 'starter', language: 'ja-JP', title: 'Starter words',
    items: ['cat', 'dog', 'apple', 'banana', 'umbrella', 'cup'].map(id => ({
      id, language: 'ja-JP', theme: 'everyday', label: id, text: id,
      image: { src: `images/${id}.webp`, source: 'generated', alt: id },
      audio: [{ src: `audio/${id}.mp3`, source: 'synthesized' }],
    })),
  };
}

describe('practice sessions', () => {
  it.each([[0, 3], [0.5, 5], [0.999, 6]])('inserts a shuffled retry inside the remaining queue with random=%s', (random, expectedPosition) => {
    const questions = createSession(bank(), 6, 4, () => 0.5);
    const original = structuredClone(questions);
    const result = requeueMissedQuestion(questions, 1, 'original-miss', () => random);
    const retry = result[expectedPosition]!;
    expect(result).toHaveLength(7);
    expect(retry.target).toBe(questions[1]!.target);
    expect(retry.retryOf).toBe('original-miss');
    expect(retry).not.toBe(questions[1]);
    expect(retry.choices).not.toBe(questions[1]!.choices);
    expect(retry.choices.map(item => item.id).sort()).toEqual(questions[1]!.choices.map(item => item.id).sort());
    const retained = result.filter((_, position) => position !== expectedPosition);
    expect(retained).toEqual(questions);
    retained.forEach((question, position) => expect(question).toBe(questions[position]));
    expect(questions).toEqual(original);
    if (random === 0) expect(retry.choices).not.toEqual(questions[1]!.choices);
  });

  it('retries a final miss next, while keeping the completed prefix intact', () => {
    const questions = createSession(bank(), 2, 4, () => 0.5);
    const result = requeueMissedQuestion(questions, 1, 'last-miss', () => 0);
    expect(result.slice(0, 2)).toEqual(questions);
    expect(result[2]).toMatchObject({ target: questions[1]!.target, retryOf: 'last-miss' });
  });

  it('keeps one pending retry across repeated transitions and repeated misses', () => {
    const questions = createSession(bank(), 4, 4, () => 0.5);
    const first = requeueMissedQuestion(questions, 0, 'original-miss', () => 0);
    expect(first[2]!.retryOf).toBe('original-miss');
    const duplicatedTransition = requeueMissedQuestion(first, 0, 'original-miss', () => 0.999);
    expect(duplicatedTransition).toEqual(first);
    const again = requeueMissedQuestion(first, 2, 'retry-miss', () => 0);
    expect(again.slice(0, 3)).toEqual(first.slice(0, 3));
    const pending = again.slice(3).filter(question => question.retryOf === 'original-miss');
    expect(pending).toHaveLength(1);
    expect(pending[0]!.target.id).toBe(first[2]!.target.id);
    expect(again.some(question => question.retryOf === 'retry-miss')).toBe(false);
  });

  it('rejects a retry without a current question or original miss identity', () => {
    const questions = createSession(bank());
    for (const index of [-1, 0.5, questions.length]) expect(() => requeueMissedQuestion(questions, index, 'miss')).toThrow(/retry/i);
    expect(() => requeueMissedQuestion(questions, 0, '')).toThrow(/retry/i);
  });

  it('offers four choices with exactly one correct answer and no repeated exercise cards', () => {
    const words = bank();
    const original = structuredClone(words);
    const values = [0, 0.1, 0.25, 0.55, 0.9, 0.999];
    let call = 0;
    const session = createSession(words, 6, 4, () => values[call++ % values.length]!);

    expect(session).toHaveLength(6);
    expect(new Set(session.map(question => cardKey({ item: question.target, exercise: question.exercise }))).size).toBe(6);
    for (const question of session) {
      const ids = question.choices.map(choice => choice.id);
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
      expect(ids.filter(id => id === question.target.id)).toHaveLength(1);
      expect(ids.every(id => words.items.some(item => item.id === id))).toBe(true);
    }
    expect(words).toEqual(original);
  });

  it('quizzes only the frozen targets and excludes repeated images and homophones', () => {
    const pool = bank().items;
    const copy = structuredClone(pool);
    const targets: PracticeCard[] = pool.slice(0, 2).map(item => ({ item, exercise: 'audio-picture' }));
    const questions = createQuestions(targets, [...pool, { ...pool[2]!, id: 'alias' }], () => 0.5);
    expect(questions.map(question => question.target.id).sort()).toEqual(targets.map(card => card.item.id).sort());
    for (const question of questions) {
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices.map(item => item.image.src)).size).toBe(4);
      expect(question.choices.filter(item => item.id === question.target.id)).toHaveLength(1);
    }
    expect(pool).toEqual(copy);
    expect(createQuestions([], pool)).toEqual([]);
    expect(() => createQuestions([targets[0]!, targets[0]!], pool)).toThrow(/unique/i);
    expect(() => createQuestions(targets, pool.slice(0, 2))).toThrow(/distinct/i);
  });

  it('shuffles both card types together while retaining the exact target snapshot', () => {
    const pool = bank().items;
    const cards = practiceCards(pool.slice(0, 3));
    const questions = createQuestions(cards, pool, () => 0.5);
    expect(questions.map(question => cardKey({ item: question.target, exercise: question.exercise })).sort()).toEqual(cards.map(cardKey).sort());
    const formats = questions.map(question => question.exercise);
    expect(formats.filter((format, index) => index > 0 && format !== formats[index - 1]).length).toBeGreaterThan(1);
    expect(questions.map(question => cardKey({ item: question.target, exercise: question.exercise }))).not.toEqual(cards.map(cardKey));
    for (const exercise of ['audio-picture', 'audio-text'] as const) {
      const index = questions.findIndex(question => question.exercise === exercise);
      const retry = requeueMissedQuestion(questions, index, 'miss-' + exercise, () => 0).find(question => question.retryOf);
      expect(retry).toMatchObject({ target: questions[index]!.target, exercise });
    }
  });

  it('uses distinct written options, excludes a target homophone, and allows shared artwork', () => {
    const pool = bank().items;
    const target = { ...pool[0]!, text: '猫', reading: 'ねこ' };
    const sameWriting = { ...pool[1]!, id: 'same-writing', text: '猫', reading: 'other' };
    const homophone = { ...pool[1]!, id: 'homophone', text: 'ネコ', reading: 'ねこ' };
    const sameImage = { ...pool[1]!, image: target.image };
    const [question] = createQuestions([{ item: target, exercise: 'audio-text' }], [target, sameWriting, homophone, sameImage, ...pool.slice(2)], () => 0.999);
    expect(question!.exercise).toBe('audio-text');
    expect(question!.choices.map(item => item.id)).toContain(sameImage.id);
    expect(question!.choices.map(item => item.id)).not.toContain('same-writing');
    expect(question!.choices.map(item => item.id)).not.toContain('homophone');
    expect(new Set(question!.choices.map(item => item.text)).size).toBe(4);
    const duplicatedLabels = pool.map(item => ({ ...item, text: 'duplicate' }));
    expect(() => createQuestions([{ item: target, exercise: 'audio-text' }], duplicatedLabels)).toThrow(/distinct/i);
  });

  it('keeps overlapping picture meanings apart in both directions without restricting written choices', () => {
    const pool = bank().items;
    const car = { ...pool[0]!, id: 'car', text: 'carro', pictureDistractorExclusions: ['taxi'] };
    const taxi = { ...pool[1]!, id: 'taxi', text: 'taxi' };
    const words = [car, taxi, ...pool.slice(2)];
    for (const target of [car, taxi]) {
      const other = target.id === 'car' ? taxi : car;
      const [picture] = createQuestions([{ item: target, exercise: 'audio-picture' }], words, () => 0.999);
      expect(picture!.choices.map(item => item.id)).not.toContain(other.id);
      expect(picture!.choices).toHaveLength(4);
      const [writing] = createQuestions([{ item: target, exercise: 'audio-text' }], words, () => 0.999);
      expect(writing!.choices.map(item => item.id)).toContain(other.id);
    }
  });

  it('honors a shorter session and bounds a longer session to available words', () => {
    expect(createSession(bank(), 2, 3, () => 0.5)).toHaveLength(2);
    expect(createSession(bank(), 20, 4, () => 0.5)).toHaveLength(12);
  });

  it.each([[0, 4], [1.5, 4], [6, 1], [6, 7], [6, 2.5]])(
    'rejects an invalid session size %s or choice count %s', (count, choices) => {
      expect(() => createSession(bank(), count, choices)).toThrow();
    },
  );
});

describe('word bank validation', () => {
  it('accepts a complete language bank with relative media paths', () => {
    expect(() => validateBank(bank())).not.toThrow();
  });

  it('rejects duplicate IDs and mixed languages', () => {
    const duplicate = bank();
    duplicate.items[1]!.id = duplicate.items[0]!.id;
    expect(() => validateBank(duplicate)).toThrow(/unique/i);
    const mixed = bank();
    mixed.items[0]!.language = 'es-ES';
    expect(() => validateBank(mixed)).toThrow(/incomplete/i);
  });

  it.each(['', '/images/cat.webp', '../cat.webp', 'https://example.com/cat.webp'])(
    'rejects a missing or unsafe image reference %s', path => {
      const words = bank();
      words.items[0]!.image.src = path;
      expect(() => validateBank(words)).toThrow();
    },
  );

  it('rejects a bank without enough words or a required audio asset', () => {
    const tooSmall = bank();
    tooSmall.items = tooSmall.items.slice(0, 1);
    expect(() => validateBank(tooSmall)).toThrow(/at least two/i);
    const missingAudio = bank();
    missingAudio.items[0]!.audio[0]!.src = '';
    expect(() => validateBank(missingAudio)).toThrow(/incomplete/i);
  });

  it('validates every voice variant and requires at least one recording', () => {
    const words = bank();
    words.items[0]!.audio.push({ src: 'audio/other-cat.mp3', source: 'recorded' });
    expect(() => validateBank(words)).not.toThrow();
    words.items[0]!.audio[1]!.src = '../other-cat.mp3';
    expect(() => validateBank(words)).toThrow(/relative/i);
    words.items[0]!.audio = [];
    expect(() => validateBank(words)).toThrow(/incomplete/i);
  });

  it('rejects unknown or self-referencing picture distractor exclusions', () => {
    for (const excluded of ['unknown', 'cat']) {
      const words = bank();
      words.items[0]!.pictureDistractorExclusions = [excluded];
      expect(() => validateBank(words)).toThrow(/picture distractor/);
    }
  });
});
