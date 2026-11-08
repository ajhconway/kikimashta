import { approvedContextualQuestions, contextualMediaPath } from '../content/contextual';
import type { ContextualBank, ContextualRecording } from '../content/contextual-types';
import type { WordItem } from '../types';
import { contextualQuestion } from './contextual-questions';
import type { Question } from './session';

const samples = [
  { stage: 'simple', format: 'picture', kind: 'target' },
  { stage: 'simple', format: 'text', kind: 'detail' },
  { stage: 'contrastive', format: 'picture', kind: 'target' },
  { stage: 'contrastive', format: 'text', kind: 'detail' },
] as const;

function paired(recording: ContextualRecording, questionId: string): boolean {
  try {
    const sentence = contextualMediaPath(recording.sentenceSrc, 'audio');
    const question = contextualMediaPath(recording.questionSrcs[questionId], 'audio');
    return sentence !== question;
  } catch { return false; }
}

/** Four approved samples for the ordinary quiz path; no history or unlock state. (#145) */
export function createContextualDemo(
  banks: readonly ContextualBank[], vocabulary: readonly WordItem[], random: () => number, voiceIds?: readonly string[],
): Question[] {
  const byId = new Map(vocabulary.map(item => [item.id, item]));
  return samples.flatMap(({ stage, format, kind }) => {
    const candidates = banks.flatMap(bank => approvedContextualQuestions(bank, format)
      .filter(({ context, question }) => (context.stage ?? 'contrastive') === stage && question.kind === kind &&
        byId.get(context.targetItemId)?.language === bank.language &&
        (format !== 'picture' || question.options.every(option => option.imageItemId && byId.get(option.imageItemId)?.image.src)))
      .map(({ context, question }) => ({ question, context: { ...context,
        recordings: context.recordings.filter(recording => paired(recording, question.id)) } }))
      .filter(({ context }) => context.recordings.length > 0));
    if (!candidates.length) return [];
    const { context, question } = candidates[Math.floor(random() * candidates.length)]!;
    return [contextualQuestion(context, question, format, vocabulary, random, voiceIds)];
  });
}
