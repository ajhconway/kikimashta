import { describe, expect, it } from 'vitest';
import type { Exercise, PracticeAttempt, PracticeCard, WordItem } from '../types';
import { cardKey } from './cards';
import { cardMastery, masteryIndex } from './mastery';
import { createMasteryDemo } from './mastery-demo';
import { quizTimeLimit } from './quiz-timer';
import { advanceSchedule, schedulerVersion } from './scheduler';
import { requeueMissedQuestion, type Question } from './session';

const at = Date.parse('2026-11-08T12:00:00Z');
function pool(exercise: Exercise = 'audio-picture'): PracticeCard[] {
  return ['cat', 'dog', 'apple', 'cup'].map(id => ({
    exercise,
    item: {
      id, language: 'ja-JP', theme: 'everyday', label: id, text: id,
      image: { src: `images/${id}.webp`, source: 'generated', alt: id },
      audio: [{ src: `audio/${id}.mp3`, source: 'synthesized' }],
    } satisfies WordItem,
  }));
}
function answer(question: Question, correct: boolean): PracticeAttempt {
  return {
    id: 'answer-' + question.demoId, sessionId: 'demo',
    itemId: question.target.id, language: question.target.language,
    choiceIds: question.choices.map(item => item.id),
    selectedId: correct ? question.target.id : question.choices.find(item => item.id !== question.target.id)!.id,
    correct, outcome: correct ? 'success' : 'failure',
    startedAt: at - 1000, answeredAt: at, responseMs: 1000,
    context: { phase: 'review', exercise: question.exercise, recordingSrc: question.target.audio[0]!.src,
      replays: 0, schedulerVersion },
  };
}

describe('mastery demo fixtures (#140)', () => {
  it('presents all eight levels in order with their real timer policy', () => {
    const { questions, schedules } = createMasteryDemo(pool(), at, () => .999);
    expect(questions).toHaveLength(8);
    expect(schedules.size).toBe(8);
    expect(questions.map(question => cardMastery(schedules.get(question.demoId!)).label)).toEqual([
      'New', 'Learning', 'Improving', 'Familiar', 'Steady', 'Strong', 'Confident', 'Mastered',
    ]);
    expect(questions.map(question => quizTimeLimit(schedules.get(question.demoId!)))).toEqual([
      null, null, 10000, 10000, 5000, 3000, 1500, 1500,
    ]);
    for (const question of questions.slice(1)) {
      const schedule = schedules.get(question.demoId!)!;
      expect(schedule.dueAt).toBe(at);
      expect(schedule.card.dueAt).toBe(at);
      expect(schedule.lastReviewedAt).toBe(schedule.card.lastReviewAt);
      expect(schedule.lastReviewedAt).toBeLessThan(at);
      expect(cardKey(schedule)).toBe(cardKey({ item: question.target, exercise: question.exercise }));
    }
  });

  it.each(['audio-picture', 'audio-text'] as const)('keeps %s targets and choices inside the selected pool without changing inputs', exercise => {
    const cards = pool(exercise);
    const before = structuredClone(cards);
    const { questions } = createMasteryDemo(cards, at, () => .25);
    for (const question of questions) {
      expect(question.exercise).toBe(exercise);
      expect(cards.some(card => cardKey(card) === cardKey({ item: question.target, exercise: question.exercise }))).toBe(true);
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices.map(item => item.id)).size).toBe(4);
      expect(question.choices.filter(item => item.id === question.target.id)).toHaveLength(1);
      expect(question.choices.every(item => cards.some(card => card.item.id === item.id))).toBe(true);
    }
    expect(cards).toEqual(before);
    expect(createMasteryDemo(cards, at, () => .25)).toEqual(createMasteryDemo(cards, at, () => .25));
  });

  it('keeps repeated real cards as independent samples when real FSRS changes their levels', async () => {
    const { questions, schedules } = createMasteryDemo(pool(), at, () => .999);
    expect(new Set(questions.map(question => question.demoId)).size).toBe(8);
    const newQuestion = questions[0]!, sibling = questions[4]!;
    expect(cardKey({ item: newQuestion.target, exercise: newQuestion.exercise }))
      .toBe(cardKey({ item: sibling.target, exercise: sibling.exercise }));
    const original = structuredClone({ questions, schedules });
    const learned = await advanceSchedule(schedules.get(newQuestion.demoId!), answer(newQuestion, true));
    expect(masteryIndex(learned)).toBeGreaterThan(masteryIndex(schedules.get(newQuestion.demoId!)));
    expect(cardMastery(learned).label).toBe('Learning');
    // FSRS returns new state; the caller can replace just this sample by demo ID.
    expect({ questions, schedules }).toEqual(original);
    schedules.set(newQuestion.demoId!, learned);
    expect(cardMastery(schedules.get(sibling.demoId!)).label).toBe('Steady');

    const improvingQuestion = questions[2]!;
    const improving = schedules.get(improvingQuestion.demoId!)!;
    const improved = await advanceSchedule(improving, answer(improvingQuestion, true));
    expect(masteryIndex(improved)).toBeGreaterThan(masteryIndex(improving));
    expect(improving).toEqual(original.schedules.get(improvingQuestion.demoId!));

    const strongQuestion = questions[5]!;
    const strong = schedules.get(strongQuestion.demoId!)!;
    const lapse = await advanceSchedule(strong, answer(strongQuestion, false));
    expect(masteryIndex(lapse)).toBeLessThan(masteryIndex(strong));
    expect(cardMastery(lapse).label).toBe('Learning');
    expect(strong).toEqual(original.schedules.get(strongQuestion.demoId!));
    schedules.set(strongQuestion.demoId!, lapse);
    expect(schedules.get(questions[1]!.demoId!)).toEqual(original.schedules.get(questions[1]!.demoId!));
  });

  it('carries the same sample identity through corrective retries without changing fixtures', () => {
    const { questions, schedules } = createMasteryDemo(pool(), at, () => .999);
    const original = structuredClone({ questions, schedules });
    const current = questions[5]!;
    const requeued = requeueMissedQuestion(questions, 5, 'first-miss', () => 0);
    const retryIndex = requeued.findIndex(question => question.retryOf === 'first-miss');
    expect(retryIndex).toBeGreaterThan(5);
    expect(requeued[retryIndex]).toMatchObject({ demoId: current.demoId, target: current.target, exercise: current.exercise });
    const repeated = requeueMissedQuestion(requeued, retryIndex, 'second-miss', () => 0);
    expect(repeated.slice(retryIndex + 1).filter(question => question.retryOf === 'first-miss'))
      .toEqual([expect.objectContaining({ demoId: current.demoId, retryOf: 'first-miss' })]);
    expect({ questions, schedules }).toEqual(original);
  });

  it('requires a selected pool', () => {
    expect(() => createMasteryDemo([], at, () => .5)).toThrow(/select a pack/i);
  });
});
