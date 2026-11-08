import { describe, expect, it } from 'vitest';
import type { ContextualItem, ContextualQuestion, ContextualPrompt } from '../content/contextual-types';
import type { WordItem } from '../types';
import { correctChoiceId } from './session';
import { contextualQuestion } from './contextual-questions';

const word = (id: string, text: string): WordItem => ({ id, text, language: 'ja-JP', theme: 'test', label: id,
  image: { src: `images/${id}.png`, source: 'generated', alt: id }, audio: [] });
const vocabulary = [word('water', '水'), word('teacher', '先生'), word('student', '学生')];
const prompt = (text: string): ContextualPrompt => ({ text, reading: text, meaning: text, grammarTags: [], supportingVocabularyIds: [] });
function fixture() {
  const question: ContextualQuestion = { id: 'who-drinks', revision: 2, kind: 'detail', prompt: prompt('誰が水を飲みますか。'),
    formats: ['picture', 'text'], options: [
      { id: 'answer-teacher', vocabularyItemId: 'teacher', imageItemId: 'teacher', ...prompt('先生') },
      { id: 'answer-student', vocabularyItemId: 'student', imageItemId: 'student', ...prompt('学生') },
    ], correctOptionId: 'answer-teacher', explanation: 'The teacher drinks water.' };
  const context: ContextualItem = { id: 'teacher-water', revision: 1, stage: 'simple', targetItemId: 'water',
    targetOccurrence: { surface: '水', reading: 'みず' }, sentence: prompt('先生は水を飲みます。'), questions: [question],
    recordings: ['otani', 'morioki'].map(voice => ({ id: voice, voice, sentenceSrc: `audio/${voice}-sentence.mp3`, questionSrcs: { [question.id]: `audio/${voice}-question.mp3` } })),
    review: { text: 'approved', audio: 'approved' }, reviewNotes: 'Fixture.' };
  return { context, question };
}

describe('contextual question snapshots', () => {
  it('keeps the target separate from a detail answer and uses authored option identities', () => {
    const { context, question } = fixture();
    const quiz = contextualQuestion(context, question, 'text', vocabulary, () => 0.75);
    expect(quiz.target.id).toBe('water');
    expect(quiz.exercise).toBe('context-simple-text');
    expect(correctChoiceId(quiz)).toBe('answer-teacher');
    expect(quiz.choices.map(choice => choice.id).sort()).toEqual(['answer-student', 'answer-teacher']);
    expect(quiz.contextual?.recording?.voice).toBe('morioki');
    expect(quiz.contextual?.recording?.questionSrcs[question.id]).toBe('audio/morioki-question.mp3');
  });

  it('uses authored writing instead of substituting catalogue text and resolves each picture', () => {
    const { context, question } = fixture();
    question.options[0]!.text = '先生です';
    question.options[0]!.reading = 'せんせいです';
    const quiz = contextualQuestion(context, question, 'picture', vocabulary, () => 0);
    expect(quiz.choices.find(choice => choice.id === 'answer-teacher')).toMatchObject({
      text: '先生です', reading: 'せんせいです', image: vocabulary[1]!.image,
    });
  });

  it('supports draft inspection without inventing recordings and defaults older contexts to contrastive', () => {
    const { context, question } = fixture();
    context.recordings = [];
    delete context.stage;
    const quiz = contextualQuestion(context, question, 'text', vocabulary, () => 0);
    expect(quiz.contextual?.recording).toBeUndefined();
    expect(quiz.exercise).toBe('context-contrastive-text');
  });

  it('rejects unsupported formats, unknown targets, missing images and questions from another context', () => {
    const { context, question } = fixture();
    question.formats = ['text'];
    expect(() => contextualQuestion(context, question, 'picture', vocabulary)).toThrow(/Unsupported/);
    expect(() => contextualQuestion(context, { ...question, id: 'elsewhere' }, 'text', vocabulary)).toThrow(/Unsupported/);
    expect(() => contextualQuestion(context, question, 'text', vocabulary.slice(1))).toThrow(/target/);
    question.formats = ['picture'];
    delete question.options[0]!.imageItemId;
    expect(() => contextualQuestion(context, question, 'picture', vocabulary)).toThrow(/known image/);
  });
});
