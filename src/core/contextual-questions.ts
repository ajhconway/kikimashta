import type { ContextualAnswerFormat, ContextualItem, ContextualQuestion } from '../content/contextual-types';
import type { WordItem } from '../types';
import { contextualExercise } from './cards';
import { shuffled, type Question } from './session';

/** Select a paired voice once; replay and corrective retries retain this snapshot. */
export function contextualQuestion(
  context: ContextualItem,
  question: ContextualQuestion,
  format: ContextualAnswerFormat,
  vocabulary: readonly WordItem[],
  random = Math.random,
  voiceIds?: readonly string[],
): Question {
  if (!question.formats.includes(format) || !context.questions.some(candidate =>
    candidate.id === question.id && candidate.revision === question.revision)) throw new Error('Unsupported contextual question or answer format.');
  const byId = new Map(vocabulary.map(item => [item.id, item]));
  const target = byId.get(context.targetItemId);
  if (!target) throw new Error('Unknown contextual vocabulary target.');
  const choices = question.options.map(option => {
    const picture = option.imageItemId ? byId.get(option.imageItemId)?.image : undefined;
    if (format === 'picture' && !picture) throw new Error('Contextual picture choices require a known image.');
    return {
      id: option.id, language: target.language, theme: target.theme,
      text: option.text, reading: option.reading, label: option.meaning,
      image: picture ?? { src: '', alt: '', source: 'generated' as const }, audio: [],
    };
  });
  const recordings = context.recordings.filter(recording => recording.sentenceSrc && recording.questionSrcs[question.id]);
  const preferred = voiceIds ? recordings.filter(recording => voiceIds.includes(recording.voice)) : recordings;
  const available = preferred.length ? preferred : recordings;
  const recording = available.length ? available[Math.floor(random() * available.length)] : undefined;
  return { target, exercise: contextualExercise(context.stage ?? 'contrastive', format),
    choices: shuffled(choices, random), contextual: { context, question, recording } };
}
