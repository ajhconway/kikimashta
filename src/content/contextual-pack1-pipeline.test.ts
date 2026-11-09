import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { expect, it, onTestFinished } from 'vitest';
import { verifyPack1Build } from '../../scripts/content/contextual-pack1-build';
import { loadPack1Content, type Pack1Acceptance, type Pack1GeneratedMedia, type Pack1TextApproval } from './contextual-pack1';
import type { ContextualBank } from './contextual-types';
import { approvedContextualQuestions } from './contextual';

it('loads the actual audio stager output through runtime and build gates, preserving separate listening approval', async () => {
  // The shared fixture makes only six real tone clips at the external speech
  // boundary, then stages the complete 116-context / 696-delivery matrix.
  const fixtureModule = '../../scripts/content/contextual-pack1-media-fixtures.mjs';
  const { pack1MediaFixture } = await import(fixtureModule);
  const data: { root: string; bank: ContextualBank; put: (path: string, value: unknown) => Promise<void>; stage: () => Promise<unknown> } =
    await pack1MediaFixture({ after: onTestFinished });
  await data.stage();
  const root = pathToFileURL(data.root + '/');
  const read = <T,>(path: string): T => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
  const approval = read<Pack1TextApproval>('content/contextual/pack-1/text-approval.json');
  const generated = read<Pack1GeneratedMedia>('content/contextual/pack-1/generated-media.json');
  const digests = verifyPack1Build(root);
  expect(generated.textApprovalSha256).toBe(digests.textApproval);
  expect(generated.textApprovalSha256).not.toBe(approval.textSha256);
  const pending = loadPack1Content({ bank: data.bank, approval, generated, digests });
  expect(pending.contexts).toHaveLength(116);
  expect(pending.contexts.every(context => context.recordings.length === 2 && context.review.audio === 'pending')).toBe(true);
  expect(approvedContextualQuestions(pending, 'text')).toEqual([]);

  // Acceptance exists only inside the disposable fixture, never in production
  // content. It binds exact staged bytes as the owner's later approval will.
  const acceptance: Pack1Acceptance = { schemaVersion: 1, bankId: data.bank.id, textApprovalSha256: digests.textApproval,
    generatedMediaSha256: digests.generatedMedia, evidenceUrl: 'https://example.test/listening-acceptance', recordedAt: '2026-11-09T00:00:00.000Z' };
  await data.put('content/contextual/pack-1/acceptance.json', acceptance);
  verifyPack1Build(root);
  expect(approvedContextualQuestions(loadPack1Content({ bank: data.bank, approval, generated, acceptance, digests }), 'text')).toHaveLength(232);
  const clip = generated.contexts[0]!.recordings[0]!.sentenceSrc;
  await data.put('public/' + clip, Buffer.from('changed delivery bytes'));
  expect(() => verifyPack1Build(root)).toThrow(/differs from its reviewed hash/);
}, 40_000);
