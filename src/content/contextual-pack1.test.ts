import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ContextualBank, ContextualItem, ContextualPrompt } from './contextual-types';
import { approvedContextualQuestions } from './contextual';
import { loadPack1Content, replacePack1Pilot, type Pack1Acceptance, type Pack1GeneratedMedia, type Pack1TextApproval } from './contextual-pack1';

const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const hash = (value: unknown) => digest(JSON.stringify(value));
const prompt = (text: string): ContextualPrompt => ({ text, reading: text, meaning: text, grammarTags: [], supportingVocabularyIds: [] });
function fixture() {
  const context: ContextualItem = { id: 'new-context', revision: 2, stage: 'simple', targetItemId: 'water',
    targetOccurrence: { surface: 'みず', reading: 'みず' }, sentence: prompt('みずがあります。'),
    questions: [{ id: 'new-question', revision: 2, kind: 'detail', prompt: prompt('なにがありますか。'), formats: ['text'],
      options: ['water', 'tea', 'milk', 'coffee'].map(id => ({ id, ...prompt(id) })), correctOptionId: 'water', explanation: 'Water is present.' }],
    recordings: [], review: { text: 'pending', audio: 'not-generated' }, reviewNotes: 'Small boundary fixture.' };
  const bank: ContextualBank = { schemaVersion: 1, id: 'new-bank', language: 'ja-JP', grammarProfile: 'genki-1', grammarReference: '',
    grammarPoints: [], supportingVocabulary: [], contexts: [context] };
  const source = hash(bank);
  const approval: Pack1TextApproval = { schemaVersion: 1, bankId: bank.id, language: bank.language, sourceFileSha256: source, textSha256: hash('text') };
  const textApproval = hash(approval);
  const generated: Pack1GeneratedMedia = { schemaVersion: 1, bankId: bank.id, language: bank.language, sourceFileSha256: source,
    textApprovalSha256: textApproval, generationIdentity: 'generation-one', audioReview: 'pending', contexts: [{
      contextId: context.id, contextRevision: 2, targetItemId: context.targetItemId, stage: 'simple', sentenceText: context.sentence.text,
      questions: { 'new-question': context.questions[0]!.prompt.text }, questionRevisions: { 'new-question': 2 },
      textApprovalSha256: textApproval, generationIdentity: 'generation-one', recordings: ['otani', 'morioki'].map(voice => {
        const sentenceSrc = `audio/${voice}/sentence.mp3`; const questionSrc = `audio/${voice}/question.mp3`;
        return { id: voice, voice, sentenceSrc, questionSrcs: { 'new-question': questionSrc }, hashes: { [sentenceSrc]: hash('sentence'), [questionSrc]: hash('question') } };
      }),
    }] };
  const generatedMedia = hash(generated);
  const acceptance: Pack1Acceptance = { schemaVersion: 1, bankId: bank.id, textApprovalSha256: textApproval, generatedMediaSha256: generatedMedia,
    evidenceUrl: 'https://github.com/example/issues/197', recordedAt: '2026-11-09T00:00:00.000Z' };
  return { bank, approval, generated, acceptance, digests: { source, textApproval, generatedMedia } };
}

describe('pack 1 exact text and listening acceptance', () => {
  it('keeps generated recordings inspectable and unplayable in ordinary practice until separately accepted', () => {
    const data = fixture(); const snapshot = structuredClone(data.bank);
    const missing = loadPack1Content({ ...data, generated: undefined, acceptance: undefined });
    expect(missing.contexts[0]!.review).toEqual({ text: 'approved', audio: 'not-generated' });
    const pending = loadPack1Content({ ...data, acceptance: undefined });
    expect(pending.contexts[0]!.recordings).toHaveLength(2);
    expect(pending.contexts[0]!.review).toEqual({ text: 'approved', audio: 'pending' });
    expect(approvedContextualQuestions(pending, 'text')).toEqual([]);
    expect(approvedContextualQuestions(loadPack1Content(data), 'text')).toHaveLength(1);
    expect(data.bank).toEqual(snapshot);
  });

  it.each(['reading', 'choices'])('rejects a changed frozen %s even when spoken text and old media are unchanged', field => {
    const data = fixture();
    if (field === 'reading') data.bank.contexts[0]!.sentence.reading += 'へんこう';
    else data.bank.contexts[0]!.questions[0]!.options[0]!.meaning += ' changed';
    data.digests.source = hash(data.bank);
    expect(() => loadPack1Content(data)).toThrow(/approved text differs/);
  });

  it('rejects acceptance for another manifest, approval or delivery hash', () => {
    for (const changed of ['manifest', 'approval', 'delivery'] as const) {
      const data = fixture();
      if (changed === 'manifest') data.acceptance.generatedMediaSha256 = hash('other manifest');
      if (changed === 'approval') data.acceptance.textApprovalSha256 = hash('other approval');
      if (changed === 'delivery') {
        const recording = data.generated.contexts[0]!.recordings[0]!;
        recording.hashes[recording.sentenceSrc] = hash('new bytes');
        data.digests.generatedMedia = hash(data.generated);
      }
      expect(() => loadPack1Content(data)).toThrow(/acceptance differs/);
    }
  });

  it.each(['duplicate-context', 'missing-context', 'missing-question', 'duplicate-voice', 'wrong-voice', 'missing-voice', 'wrong-revision', 'wrong-generation', 'unsafe-path'])('rejects %s media', change => {
    const data = fixture(); const entry = data.generated.contexts[0]!;
    if (change === 'duplicate-context') data.generated.contexts.push(structuredClone(entry));
    if (change === 'missing-context') data.generated.contexts = [];
    if (change === 'missing-question') delete entry.recordings[0]!.questionSrcs['new-question'];
    if (change === 'duplicate-voice') entry.recordings[1]!.voice = 'otani';
    if (change === 'wrong-voice') entry.recordings[1]!.voice = 'unreviewed';
    if (change === 'missing-voice') entry.recordings.pop();
    if (change === 'wrong-revision') entry.questionRevisions['new-question'] = 1;
    if (change === 'wrong-generation') entry.generationIdentity = 'other-generation';
    if (change === 'unsafe-path') entry.recordings[0]!.sentenceSrc = 'audio/../private.mp3';
    // The acceptance binds this exact defective fixture, so failures must come
    // from the structural/content contract rather than a stale outer hash.
    data.digests.generatedMedia = hash(data.generated); data.acceptance.generatedMediaSha256 = data.digests.generatedMedia;
    expect(() => loadPack1Content(data)).toThrow();
  });

  it('replaces exactly the old level 1 variants without rewriting other words, languages or history', () => {
    const replacement = loadPack1Content(fixture());
    const old = { ...replacement, id: 'old-bank', contexts: Array.from({ length: 10 }, (_, index) => ({ ...replacement.contexts[0]!,
      id: 'old-' + index, targetItemId: 'target-' + index })) };
    const anotherLanguage = { ...old, id: 'other-language', language: 'es-419' };
    const snapshot = structuredClone([old, anotherLanguage]);
    const merged = replacePack1Pilot([old, anotherLanguage], replacement, ['target-0', 'target-1', 'target-2']);
    expect(merged[0]!.contexts.map(context => context.id)).toEqual(Array.from({ length: 7 }, (_, index) => 'old-' + (index + 3)));
    expect(merged[1]).toEqual(anotherLanguage);
    expect(merged[2]).toBe(replacement);
    expect([old, anotherLanguage]).toEqual(snapshot);
  });
});

const root = new URL('../../', import.meta.url);
const file = (path: string) => readFileSync(new URL(path, root));
const read = (path: string) => JSON.parse(file(path).toString());
const manifestPath = 'content/contextual/pack-1/generated-media.json';
it('binds the real immutable bank and approval to the build-derived source hashes', () => {
  const approval = read('content/contextual/pack-1/text-approval.json');
  expect(digest(file('content/contextual/ja-wanikani-1-draft.json'))).toBe(approval.sourceFileSha256);
});
it.skipIf(!existsSync(new URL(manifestPath, root)))('verifies every real staged delivery and optional listening acceptance against exact bytes', () => {
  const generated = read(manifestPath);
  expect(generated.textApprovalSha256).toBe(digest(file('content/contextual/pack-1/text-approval.json')));
  expect(generated.sourceFileSha256).toBe(digest(file('content/contextual/ja-wanikani-1-draft.json')));
  for (const entry of generated.contexts) for (const recording of entry.recordings) for (const [path, expected] of Object.entries(recording.hashes)) {
    expect(digest(file('public/' + path)), path).toBe(expected);
  }
  const path = 'content/contextual/pack-1/acceptance.json';
  if (existsSync(new URL(path, root))) expect(read(path).generatedMediaSha256).toBe(digest(file(manifestPath)));
});
