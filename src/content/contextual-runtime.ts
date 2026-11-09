import { withCurrentImage } from './current-images';
import { spanishBasicContexts, spanishContextualVocabulary } from './spanish-basic';
import contrastive from '../../content/contextual/ja-pilot.json';
import simple from '../../content/contextual/ja-simple-pilot.json';
import expansion from '../../content/contextual/ja-simple-expansion.json';
import accepted from '../../content/contextual/accepted-media.json';
import generated from '../../content/contextual/generated-media.json';
import answerAmendments from '../../content/contextual/answer-amendments.json';
import answerVocabulary from '../../content/contextual/answer-vocabulary.json';
import { withAnswerAmendments, withAnswerVocabulary, type ContextualAnswerAmendments } from './contextual-answers';
import catalogue from '../../content/catalog/ja.json';
import overrides from '../../content/catalog/review-overrides.json';
import pack1Source from '../../content/contextual/ja-wanikani-1-draft.json';
import pack1Approval from '../../content/contextual/pack-1/text-approval.json';
import pack1Policy from '../../content/contextual/pack-1/practice-policy.json';
import { loadPack1Content, replacePack1Pilot, type Pack1Acceptance, type Pack1GeneratedMedia } from './contextual-pack1';
import type { ContextualBank, ContextualRecording } from './contextual-types';
import type { PracticeCard, WordItem } from '../types';
import { contextualExercise } from '../core/cards';
import { approvedContextualQuestions } from './contextual';

export const contextualVocabulary: WordItem[] = [...spanishContextualVocabulary, ...withAnswerVocabulary(catalogue.items.flatMap(item => {
  const override = overrides[item.id as keyof typeof overrides] ?? {};
  if ('removalReason' in override) return [];
  return [{ ...item, ...override, label: item.meaning, theme: 'vocabulary' } as WordItem];
}), answerVocabulary.items.map(item => ({ ...item, label: item.meaning, theme: 'contextual' }) as WordItem))].map(withCurrentImage);

interface MediaEntry {
  contextId: string; contextRevision: number; targetItemId: string; stage: 'simple' | 'contrastive';
  sentenceText: string; questions: Record<string, string | undefined>; questionRevisions: Record<string, number | undefined>;
  recordings: ContextualRecording[];
}

/** Generation and listening acceptance stay separate from authored text approval. */
function withMedia(banks: readonly ContextualBank[], entries: readonly MediaEntry[], state: 'pending' | 'approved'): ContextualBank[] {
  return banks.map(bank => ({ ...bank, contexts: bank.contexts.map(context => {
    if (context.review.text === 'rejected' || context.review.audio === 'rejected') return context;
    const media = entries.find(entry => entry.contextId === context.id);
    if (!media) return context;
    if (context.review.text !== 'approved' || context.revision !== media.contextRevision || context.targetItemId !== media.targetItemId || context.sentence.text !== media.sentenceText ||
        context.questions.length !== Object.keys(media.questions).length || context.questions.some(question =>
          (media.questions as Record<string, string | undefined>)[question.id] !== question.prompt.text ||
          (media.questionRevisions as Record<string, number | undefined>)[question.id] !== question.revision)) {
      throw new Error('Accepted contextual media differs from authored text: ' + context.id);
    }
    return { ...context, stage: media.stage as 'simple' | 'contrastive',
      review: { text: 'approved' as const, audio: state }, recordings: media.recordings };
  }) }));
}

export function withAcceptedMedia(banks: readonly ContextualBank[]): ContextualBank[] {
  return withMedia(banks, accepted.contexts as unknown as MediaEntry[], 'approved');
}

export const recordedContextualBanks = withAcceptedMedia(withMedia([contrastive, simple, expansion] as unknown as ContextualBank[],
  generated.contexts as unknown as MediaEntry[], 'pending'));

declare const __PACK1_SOURCE_SHA256__: string;
declare const __PACK1_TEXT_APPROVAL_SHA256__: string;
declare const __PACK1_GENERATED_MEDIA_SHA256__: string;
const pack1Manifests = import.meta.glob('../../content/contextual/pack-1/{generated-media,acceptance}.json', { eager: true, import: 'default' });
export const pack1ContextualBank = loadPack1Content({ bank: pack1Source as unknown as ContextualBank, approval: pack1Approval,
  generated: pack1Manifests['../../content/contextual/pack-1/generated-media.json'] as Pack1GeneratedMedia | undefined,
  acceptance: pack1Manifests['../../content/contextual/pack-1/acceptance.json'] as Pack1Acceptance | undefined,
  digests: { source: __PACK1_SOURCE_SHA256__, textApproval: __PACK1_TEXT_APPROVAL_SHA256__, generatedMedia: __PACK1_GENERATED_MEDIA_SHA256__ },
});
// The frozen bank keeps its approved bytes. Semantic focus is display-only metadata,
// while kind and answer vocabulary IDs continue to record the literal answer concept.
pack1ContextualBank.contexts = pack1ContextualBank.contexts.map(context => ({ ...context, questions: context.questions.map(question => ({
  ...question, focus: question.id.endsWith('-target') ? 'target' as const : 'detail' as const,
})) }));
const pilotBanks = [...withAnswerAmendments(recordedContextualBanks, answerAmendments as ContextualAnswerAmendments), spanishBasicContexts];
export const contextualBanks = pack1ContextualBank.contexts.every(context => context.review.audio === 'approved')
  ? replacePack1Pilot(pilotBanks, pack1ContextualBank, pack1Policy.supersededPilotItemIds) : pilotBanks;
/** Library inspection may audition pending recordings; ordinary practice never does. */
export const contextualInspectionBanks = [...pilotBanks, pack1ContextualBank];

export function readyContextualCards(banks: readonly ContextualBank[], vocabulary: readonly WordItem[]): PracticeCard[] {
  const result = new Map<string, PracticeCard>();
  for (const bank of banks) for (const format of ['picture', 'text'] as const) {
    for (const { context } of approvedContextualQuestions(bank, format)) {
      const item = vocabulary.find(word => word.id === context.targetItemId && word.language === bank.language);
      if (!item) throw new Error('Missing contextual target: ' + context.targetItemId);
      const exercise = contextualExercise(context.stage ?? 'contrastive', format);
      result.set(JSON.stringify([bank.language, item.id, exercise]), { item, exercise });
    }
  }
  return [...result.values()];
}
