import drafts from './questions.json';
import type { ContextualItem, ContextualPrompt, ContextualQuestion } from '@app/content/contextual-types';
import type { Question } from '@app/core/session';
import type { WordItem } from '@app/types';

const prompt = (text = '', reading = '', meaning = ''): ContextualPrompt => ({ text, reading, meaning, grammarTags: [], supportingVocabularyIds: [] });
export { drafts };

export function demoQuestion(index: number): Question {
  const draft = drafts[index];
  if (!draft) throw new Error('Unknown demo question');
  const choices: WordItem[] = draft.choices.map(choice => ({
    id: choice.id, language: 'ja-JP', theme: 'short-context-demo', text: choice.id, label: choice.label,
    image: { src: `images/${choice.id}.png`, alt: choice.label, source: 'generated' }, audio: [],
  }));
  const question: ContextualQuestion = {
    id: `short-demo-${draft.id}-question`, revision: 2, kind: 'target',
    prompt: prompt(draft.question, draft.questionKana, draft.questionEnglish),
    formats: ['picture'], correctOptionId: draft.correct,
    options: choices.map(c => ({ id: c.id, ...prompt(c.text, c.text, c.label) })),
    explanation: draft.english,
  };
  const recording = {
    id: `short-demo-${draft.id}-kyoko`, voice: 'kyoko', sentenceSrc: `audio/${draft.id}-sentence.mp3`,
    questionSrcs: draft.question ? { [question.id]: `audio/${draft.id}-question.mp3` } : {},
  };
  const context: ContextualItem = {
    id: `short-demo-${draft.id}`, revision: 2, stage: 'simple', targetItemId: draft.id,
    targetOccurrence: { surface: draft.word, reading: draft.reading },
    sentence: prompt(draft.sentence, draft.kana, draft.english), questions: [question], recordings: [recording],
    review: { text: 'pending', audio: 'pending' }, reviewNotes: 'Owner review demo only; no learning progress or production activation.',
  };
  return {
    target: { id: draft.id, language: 'ja-JP', theme: 'short-context-demo', text: draft.word, reading: draft.reading,
      label: draft.meaning, image: choices.find(c => c.id === draft.correct)!.image, audio: [] },
    choices, exercise: 'context-simple-picture', demoId: context.id,
    contextual: { context, question, recording },
  };
}
