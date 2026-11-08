import { describe, expect, it } from 'vitest';
import type { ContextualBank, ContextualItem, ContextualPrompt, ContextualQuestion } from '../content/contextual-types';
import type { ContextualStage, PracticeAttempt, WordItem } from '../types';
import { cardKey } from './cards';
import { cardMastery, masteryIndex } from './mastery';
import { advanceSchedule, schedulerVersion } from './scheduler';
import { correctChoiceId, requeueMissedQuestion, type Question } from './session';
import { createContextualDemo, createContextualDemoSession } from './contextual-demo';

const prompt = (text: string): ContextualPrompt => ({ text, reading: text, meaning: text, grammarTags: [], supportingVocabularyIds: [] });
const vocabulary: WordItem[] = ['water', 'coffee', 'teacher', 'student'].map(id => ({
  id, text: id, label: id, language: 'ja-JP', theme: 'test', audio: [],
  image: { src: `images/${id}.png`, alt: id, source: 'generated' },
}));

function context(stage: ContextualStage, variant = 'first'): ContextualItem {
  const questions: ContextualQuestion[] = (['target', 'detail'] as const).map(kind => ({
    id: `${stage}-${variant}-${kind}`, revision: 2, kind, prompt: prompt('Question'), formats: ['picture', 'text'],
    options: (kind === 'target' ? ['water', 'coffee'] : ['teacher', 'student']).map(id => ({
      ...prompt(id), id: 'answer-' + id, vocabularyItemId: id, imageItemId: id,
    })), correctOptionId: kind === 'target' ? 'answer-water' : 'answer-teacher', explanation: 'Explanation',
  }));
  return { id: `${stage}-${variant}`, revision: 3, stage, targetItemId: 'water',
    targetOccurrence: { surface: 'water', reading: 'water' }, sentence: prompt('The teacher drinks water.'), questions,
    recordings: ['otani', 'morioki'].map(voice => ({ id: voice, voice,
      sentenceSrc: `audio/${stage}-${variant}/${voice}/sentence.mp3`,
      questionSrcs: Object.fromEntries(questions.map(question => [question.id, `audio/${stage}-${variant}/${voice}/${question.id}.mp3`])),
    })), review: { text: 'approved', audio: 'approved' }, reviewNotes: 'Fixture.',
  };
}
function bank(contexts = [context('simple'), context('contrastive')]): ContextualBank {
  return { schemaVersion: 1, id: 'demo-bank', language: 'ja-JP', grammarProfile: 'genki-1', grammarReference: '',
    grammarPoints: [], supportingVocabulary: [], contexts };
}
function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}

describe('contextual practice demo samples', () => {
  it.each([['morioki', 'morioki'], ['unavailable', 'otani']])('respects preferred voice %s with the ordinary availability fallback', (preferred, expected) => {
    const questions = createContextualDemo([bank()], vocabulary, () => 0, [preferred]);
    expect(questions).toHaveLength(4);
    expect(questions.every(question => question.contextual?.recording?.voice === expected)).toBe(true);
  });

  it('offers one bounded tour through both stages, formats and question kinds with authored answers', () => {
    const questions = createContextualDemo([bank()], vocabulary, () => 0);
    expect(questions.map(question => question.exercise)).toEqual([
      'context-simple-picture', 'context-simple-text', 'context-contrastive-picture', 'context-contrastive-text',
    ]);
    expect(questions.map(question => question.contextual!.question.kind)).toEqual(['target', 'detail', 'target', 'detail']);
    expect(questions.every(question => question.target.id === 'water' && question.demoId === undefined)).toBe(true);
    expect(questions.map(correctChoiceId)).toEqual(['answer-water', 'answer-teacher', 'answer-water', 'answer-teacher']);
    for (const question of questions) {
      expect(question.choices.map(choice => choice.id)).toContain(correctChoiceId(question));
      expect(question.contextual!.context.revision).toBe(3);
      expect(question.contextual!.question.revision).toBe(2);
      expect(question.contextual!.recording!.questionSrcs[question.contextual!.question.id]).toMatch(/\.mp3$/);
    }
  });

  it('uses injected randomness for matching variants and paired voices without changing input', () => {
    const banks = frozen([bank([context('simple'), context('simple', 'second'), context('contrastive'), context('contrastive', 'second')])]);
    const words = frozen(structuredClone(vocabulary));
    const snapshot = structuredClone(banks);
    const first = createContextualDemo(banks, words, () => 0);
    const last = createContextualDemo(banks, words, () => .99);
    expect(first.map(question => question.contextual!.context.id)).toEqual(['simple-first', 'simple-first', 'contrastive-first', 'contrastive-first']);
    expect(last.map(question => question.contextual!.context.id)).toEqual(['simple-second', 'simple-second', 'contrastive-second', 'contrastive-second']);
    expect(first.every(question => question.contextual!.recording!.voice === 'otani')).toBe(true);
    expect(last.every(question => question.contextual!.recording!.voice === 'morioki')).toBe(true);
    expect(banks).toEqual(snapshot);
    expect(words).toEqual(vocabulary);
  });

  it.each([
    ['pending', 'approved'], ['rejected', 'approved'], ['approved', 'pending'], ['approved', 'rejected'], ['approved', 'not-generated'],
  ] as const)('excludes text=%s/audio=%s from practice samples', (text, audio) => {
    const content = bank();
    content.contexts.forEach(item => { item.review = { text, audio }; });
    expect(createContextualDemo([content], vocabulary, () => 0)).toEqual([]);
  });

  it.each(['missing', 'missing-sentence', 'same-segment', 'external', 'traversal'] as const)('omits contexts with %s paired audio', failure => {
    const content = bank();
    for (const item of content.contexts) for (const recording of item.recordings) {
      if (failure === 'missing') recording.questionSrcs = {};
      else if (failure === 'missing-sentence') recording.sentenceSrc = '';
      else for (const question of item.questions) recording.questionSrcs[question.id] = failure === 'same-segment'
        ? recording.sentenceSrc : failure === 'external' ? 'https://example.invalid/question.mp3' : 'audio/../question.mp3';
    }
    expect(createContextualDemo([content], vocabulary, () => 0)).toEqual([]);
  });

  it('selects only complete voice pairs and retains the same authored identity and voice through a retry', () => {
    const content = bank();
    content.contexts.forEach(item => { item.recordings[0]!.questionSrcs = {}; });
    const questions = createContextualDemo([content], vocabulary, () => 0);
    expect(questions).toHaveLength(4);
    expect(questions.every(question => question.contextual!.recording!.voice === 'morioki')).toBe(true);
    const withRetry = requeueMissedQuestion(questions, 1, 'original-miss', () => 0);
    const retry = withRetry.find(question => question.retryOf === 'original-miss')!;
    expect(retry.contextual).toEqual(questions[1]!.contextual);
    expect(retry.exercise).toBe('context-simple-text');
    expect(correctChoiceId(retry)).toBe('answer-teacher');
  });

  it('omits unsupported categories and safely handles empty content or unknown vocabulary', () => {
    const content = bank();
    content.contexts.forEach(item => { item.questions.forEach(question => { question.formats = ['text']; }); });
    expect(createContextualDemo([content], vocabulary, () => 0).map(question => question.exercise))
      .toEqual(['context-simple-text', 'context-contrastive-text']);
    expect(createContextualDemo([], vocabulary, () => 0)).toEqual([]);
    expect(createContextualDemo([bank([])], vocabulary, () => 0)).toEqual([]);
    expect(createContextualDemo([bank()], [], () => 0)).toEqual([]);
  });

  it('supports older contrastive contexts without a stage and excludes approved contexts without recordings', () => {
    const content = bank();
    delete content.contexts[1]!.stage;
    expect(createContextualDemo([content], vocabulary, () => 0).map(question => question.exercise))
      .toEqual(['context-simple-picture', 'context-simple-text', 'context-contrastive-picture', 'context-contrastive-text']);
    content.contexts.forEach(item => { item.recordings = []; });
    expect(createContextualDemo([content], vocabulary, () => 0)).toEqual([]);
  });
});

const at = Date.parse('2026-11-08T12:00:00Z');
function answer(question: Question, correct: boolean): PracticeAttempt {
  const { context, question: authored, recording } = question.contextual!;
  return {
    id: `answer-${question.demoId}-${correct}`, sessionId: 'contextual-demo', itemId: question.target.id, language: question.target.language,
    choiceIds: question.choices.map(choice => choice.id), correct, outcome: correct ? 'success' : 'failure',
    selectedId: correct ? correctChoiceId(question) : question.choices.find(choice => choice.id !== correctChoiceId(question))!.id,
    startedAt: at - 1000, answeredAt: at, responseMs: 1000,
    context: { phase: 'review', exercise: question.exercise, recordingSrc: recording!.sentenceSrc, replays: 0, schedulerVersion,
      contextual: { stage: context.stage ?? 'contrastive', contextId: context.id, contextRevision: context.revision,
        questionId: authored.id, questionRevision: authored.revision, kind: authored.kind, correctOptionId: authored.correctOptionId,
        sentenceSrc: recording!.sentenceSrc, questionSrc: recording!.questionSrcs[authored.id]! } },
  };
}

describe('contextual mastery demo sessions', () => {
  it('adds four unique independent samples while preserving authored questions, options and preferred voice', () => {
    const banks = frozen([bank()]);
    const snapshot = structuredClone(banks);
    const { questions, schedules } = createContextualDemoSession(banks, vocabulary, at, () => 0, ['morioki']);
    expect(questions.map(question => question.demoId)).toEqual(['contextual-demo-0', 'contextual-demo-1', 'contextual-demo-2', 'contextual-demo-3']);
    expect(schedules.size).toBe(4);
    expect(questions.map(question => cardMastery(schedules.get(question.demoId!)).label))
      .toEqual(['Familiar', 'Steady', 'Strong', 'Confident']);
    expect(questions.map(question => schedules.get(question.demoId!)!.card.scheduledDays)).toEqual([3, 14, 60, 180]);
    expect(questions.map(question => {
      const authored = { ...question };
      delete authored.demoId;
      return authored;
    })).toEqual(createContextualDemo(banks, vocabulary, () => 0, ['morioki']));
    for (const question of questions) {
      const schedule = schedules.get(question.demoId!)!;
      expect(schedule.dueAt).toBe(at);
      expect(cardKey(schedule)).toBe(cardKey({ item: question.target, exercise: question.exercise }));
    }
    expect(banks).toEqual(snapshot);
  });

  it('uses real Good and Again grades without changing any sample until its caller replaces it', async () => {
    const { questions, schedules } = createContextualDemoSession([bank()], vocabulary, at, () => 0);
    const original = structuredClone({ questions, schedules });
    const detail = questions[1]!;
    expect(answer(detail, true).selectedId).not.toBe(detail.target.id);
    const before = schedules.get(detail.demoId!)!;
    const good = await advanceSchedule(before, answer(detail, true));
    const again = await advanceSchedule(before, answer(detail, false));
    expect(masteryIndex(good)).toBeGreaterThan(masteryIndex(before));
    expect(masteryIndex(again)).toBeLessThan(masteryIndex(before));
    expect(cardMastery(again).label).toBe('Learning');
    expect({ questions, schedules }).toEqual(original);
    schedules.set(detail.demoId!, again);
    for (const question of questions.filter(question => question !== detail)) {
      expect(schedules.get(question.demoId!)).toEqual(original.schedules.get(question.demoId!));
    }
    expect(createContextualDemoSession([bank()], vocabulary, at, () => 0)).toEqual(original);
  });

  it('keeps corrective retries linked to their original sample and exact audio without duplicating pending retries', () => {
    const { questions, schedules } = createContextualDemoSession([bank()], vocabulary, at, () => 0);
    const original = structuredClone({ questions, schedules });
    const requeued = requeueMissedQuestion(questions, 0, 'first-miss', () => 0);
    const retry = requeued.at(-1)!;
    expect(requeued.slice(0, 4)).toEqual(questions);
    expect(retry).toMatchObject({ demoId: questions[0]!.demoId, retryOf: 'first-miss', contextual: questions[0]!.contextual });
    expect(correctChoiceId(retry)).toBe(correctChoiceId(questions[0]!));
    const duplicate = requeueMissedQuestion(requeued, 0, 'first-miss', () => .99);
    expect(duplicate.filter(question => question.retryOf === 'first-miss')).toHaveLength(1);
    expect({ questions, schedules }).toEqual(original);
    expect(createContextualDemoSession([], vocabulary, at, () => 0)).toEqual({ questions: [], schedules: new Map() });
  });
});
