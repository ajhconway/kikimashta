import type { ContextualBank, ContextualRecording } from './contextual-types';
import { contextualMediaPath } from './contextual';

export interface Pack1TextApproval {
  schemaVersion: number; bankId: string; language: string; sourceFileSha256: string; textSha256: string;
}
export interface Pack1MediaEntry {
  contextId: string; contextRevision: number; targetItemId: string; stage: 'simple' | 'contrastive';
  sentenceText: string; questions: Record<string, string>; questionRevisions: Record<string, number>;
  recordings: (ContextualRecording & { hashes: Record<string, string> })[];
}
export interface Pack1GeneratedMedia {
  schemaVersion: number; bankId: string; language: string; sourceFileSha256: string;
  textApprovalSha256: string; generationIdentity: string; audioReview: string; contexts: Pack1MediaEntry[];
}
export interface Pack1Acceptance {
  schemaVersion: number; bankId: string; textApprovalSha256: string; generatedMediaSha256: string;
  evidenceUrl: string; recordedAt: string;
}
export interface Pack1Digests { source: string; textApproval: string; generatedMedia: string }

function requireIdentity(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('Pack 1 contextual content: ' + message);
}
const sha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Build-derived digests bind immutable text and reviewed bytes; generation never implies listening approval. */
export function loadPack1Content({ bank, approval, generated, acceptance, digests }: {
  bank: ContextualBank; approval: Pack1TextApproval; generated?: Pack1GeneratedMedia; acceptance?: Pack1Acceptance; digests: Pack1Digests;
}): ContextualBank {
  requireIdentity(approval.schemaVersion === 1 && approval.bankId === bank.id && approval.language === bank.language &&
    sha256(approval.textSha256) && sha256(digests.textApproval) && sha256(digests.source) && approval.sourceFileSha256 === digests.source,
  'approved text differs from the frozen source');
  let audioApproved = false;
  if (generated) {
    requireIdentity(generated.schemaVersion === 1 && generated.bankId === bank.id && generated.language === bank.language &&
      generated.sourceFileSha256 === digests.source && generated.textApprovalSha256 === digests.textApproval &&
      typeof generated.generationIdentity === 'string' && !!generated.generationIdentity && generated.audioReview === 'pending' &&
      sha256(digests.generatedMedia), 'generated media differs from text approval');
  }
  if (acceptance) {
    requireIdentity(generated && acceptance.schemaVersion === 1 && acceptance.bankId === bank.id &&
      acceptance.textApprovalSha256 === digests.textApproval && acceptance.generatedMediaSha256 === digests.generatedMedia &&
      /^https:\/\//.test(acceptance.evidenceUrl) && Number.isFinite(Date.parse(acceptance.recordedAt)), 'listening acceptance differs from generated media');
    requireIdentity(generated.contexts.length === bank.contexts.length, 'listening acceptance requires the complete bank');
    audioApproved = true;
  }
  const entries = new Map((generated?.contexts ?? []).map(entry => [entry.contextId, entry]));
  requireIdentity(entries.size === (generated?.contexts.length ?? 0), 'duplicate media contexts');
  requireIdentity([...entries.keys()].every(id => bank.contexts.some(context => context.id === id)), 'unknown media context');
  return { ...bank, contexts: bank.contexts.map(context => {
    const media = entries.get(context.id);
    if (!media) {
      requireIdentity(!audioApproved, 'accepted context is missing');
      return { ...context, review: { text: 'approved' as const, audio: 'not-generated' as const }, recordings: [] };
    }
    requireIdentity(media.contextRevision === context.revision && media.targetItemId === context.targetItemId &&
      media.stage === context.stage && media.sentenceText === context.sentence.text &&
      Object.keys(media.questions).length === context.questions.length && Object.keys(media.questionRevisions).length === context.questions.length &&
      context.questions.every(question => media.questions[question.id] === question.prompt.text && media.questionRevisions[question.id] === question.revision),
    'recording text/revisions differ: ' + context.id);
    const voices = new Set<string>();
    requireIdentity(media.recordings.length > 0, 'recording set is empty: ' + context.id);
    for (const recording of media.recordings) {
      requireIdentity(!voices.has(recording.voice), 'duplicate recorded voice');
      voices.add(recording.voice);
      const paths = [contextualMediaPath(recording.sentenceSrc, 'audio'), ...context.questions.map(question =>
        contextualMediaPath(recording.questionSrcs[question.id], 'audio'))];
      requireIdentity(Object.keys(recording.questionSrcs).length === context.questions.length && new Set(paths).size === paths.length &&
        Object.keys(recording.hashes).length === paths.length && paths.every(path => sha256(recording.hashes[path])), 'incomplete recording delivery hashes');
    }
    if (audioApproved) requireIdentity(voices.size === 2 && voices.has('otani') && voices.has('morioki'), 'accepted contexts need both reviewed voices');
    return { ...context, review: { text: 'approved' as const, audio: audioApproved ? 'approved' as const : 'pending' as const }, recordings: media.recordings };
  }) };
}

/** Remove replaced variants only after the whole new bank has listening acceptance. History is untouched. */
export function replacePack1Pilot(banks: readonly ContextualBank[], replacement: ContextualBank, targetIds: readonly string[]): ContextualBank[] {
  const replaced = new Set(targetIds);
  return [...banks.map(bank => ({ ...bank, contexts: bank.contexts.filter(context =>
    bank.language !== replacement.language || !replaced.has(context.targetItemId)) })).filter(bank => bank.contexts.length), replacement];
}
