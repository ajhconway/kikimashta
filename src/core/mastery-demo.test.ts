import { describe, expect, it } from 'vitest';
import type { PracticeCard } from '../types';
import { cardMastery } from './mastery';
import { createMasterySample } from './mastery-demo';
import { quizTimeLimit } from './quiz-timer';

const at = Date.parse('2026-11-08T12:00:00Z');
const card: PracticeCard = { exercise: 'audio-picture', item: {
  id: 'cat', language: 'ja-JP', theme: 'everyday', label: 'cat', text: 'cat',
  image: { src: 'images/cat.webp', source: 'generated', alt: 'cat' },
  audio: [{ src: 'audio/cat.mp3', source: 'synthesized' }],
} };

describe('simulated mastery samples', () => {
  it.each([
    [0, 'New', null], [1, 'Learning', null], [2, 'Improving', 10000], [3, 'Familiar', 10000],
    [4, 'Steady', 5000], [5, 'Strong', 3000], [6, 'Confident', 1500], [7, 'Mastered', 1500],
  ] as const)('maps sample level %i to %s with its mastery timer', (level, label, timer) => {
    const sample = createMasterySample(card, level, at);
    expect(cardMastery(sample).label).toBe(label);
    expect(quizTimeLimit(sample)).toBe(timer);
  });

  it('constructs independent schedules for repeated cards and rejects unknown sample levels', () => {
    const before = structuredClone(card);
    expect(createMasterySample(card, 0, at)).toBeUndefined();
    const first = createMasterySample(card, 3, at)!;
    const second = createMasterySample(card, 3, at)!;
    expect(first).toEqual(second);
    expect(cardMastery(first).label).toBe('Familiar');
    first.card.stability = 999;
    expect(second.card.stability).toBe(3);
    expect(card).toEqual(before);
    for (const level of [-1, 8, .5, NaN]) expect(() => createMasterySample(card, level, at)).toThrow(/mastery level/i);
  });
});
