import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { verifyPack1Build } from '../../scripts/content/contextual-pack1-build';
import type { ContextualBank } from './contextual-types';
import type { Pack1GeneratedMedia } from './contextual-pack1';

const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
it.each([false, true])('build checks actual public bytes when listening acceptance is %s', accepted => {
  const root = mkdtempSync(resolve(tmpdir(), 'pack1-build-'));
  const write = (path: string, bytes: string) => {
    const target = resolve(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
  };
  const put = (path: string, value: unknown) => { const bytes = JSON.stringify(value); write(path, bytes); return hash(bytes); };
  try {
    const bank = JSON.parse(readFileSync(new URL('../../content/contextual/ja-wanikani-1-draft.json', import.meta.url), 'utf8')) as ContextualBank;
    bank.contexts = bank.contexts.slice(0, 1);
    const context = bank.contexts[0]!;
    const source = put('content/contextual/ja-wanikani-1-draft.json', bank);
    const textApproval = put('content/contextual/pack-1/text-approval.json', { schemaVersion: 1, bankId: bank.id,
      language: bank.language, sourceFileSha256: source, textSha256: hash('approved text') });
    const content = 'synthetic delivery bytes';
    const recordings = ['otani', 'morioki'].map(voice => {
      const sentenceSrc = `audio/fixture/${voice}/sentence.mp3`;
      const questionSrcs = Object.fromEntries(context.questions.map((question, index) => [question.id, `audio/fixture/${voice}/question-${index}.mp3`]));
      const paths = [sentenceSrc, ...Object.values(questionSrcs)];
      paths.forEach(path => write('public/' + path, content));
      return { id: voice, voice, sentenceSrc, questionSrcs, hashes: Object.fromEntries(paths.map(path => [path, hash(content)])) };
    });
    const manifest: Pack1GeneratedMedia = { schemaVersion: 1, bankId: bank.id, language: bank.language,
      sourceFileSha256: source, textApprovalSha256: textApproval, generationIdentity: 'fixture', audioReview: 'pending', contexts: [{
        contextId: context.id, contextRevision: context.revision, targetItemId: context.targetItemId, stage: 'simple',
        sentenceText: context.sentence.text, questions: Object.fromEntries(context.questions.map(question => [question.id, question.prompt.text])),
        questionRevisions: Object.fromEntries(context.questions.map(question => [question.id, question.revision])),
        textApprovalSha256: textApproval, generationIdentity: 'fixture', recordings,
      }] };
    const generatedMedia = put('content/contextual/pack-1/generated-media.json', manifest);
    const acceptance = { schemaVersion: 1, bankId: bank.id, textApprovalSha256: textApproval, generatedMediaSha256: generatedMedia,
      evidenceUrl: 'https://github.com/example/issues/197', recordedAt: '2026-11-09T00:00:00Z' };
    if (accepted) put('content/contextual/pack-1/acceptance.json', acceptance);
    const verify = () => verifyPack1Build(pathToFileURL(root + '/'));
    expect(verify()).toEqual({ source, textApproval, generatedMedia });
    const delivery = 'public/' + recordings[0]!.sentenceSrc;
    write(delivery, 'changed after review');
    expect(verify).toThrow(/delivery differs/);
    rmSync(resolve(root, delivery));
    expect(verify).toThrow(/ENOENT/);
    write(delivery, content);
    if (accepted) {
      put('content/contextual/pack-1/acceptance.json', { ...acceptance, generatedMediaSha256: hash('another manifest') });
      expect(verify).toThrow(/acceptance differs/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
