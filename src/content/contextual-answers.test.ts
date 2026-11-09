import { describe, expect, it } from 'vitest';
import type { ContextualBank, ContextualOption } from './contextual-types';
import { withAnswerAmendments, withAnswerVocabulary, type ContextualAnswerAmendments } from './contextual-answers';

const option = (id: string): ContextualOption => ({ id, text: id, reading: id, meaning: id, grammarTags: [], supportingVocabularyIds: [] });
function fixture() {
  const bank: ContextualBank = {
    schemaVersion: 1, id: 'sample', language: 'ja-JP', grammarProfile: 'genki-1', grammarReference: 'reference', grammarPoints: [], supportingVocabulary: [],
    contexts: [{ id: 'water', revision: 1, targetItemId: 'water', targetOccurrence: { surface: '水', reading: 'みず' },
      sentence: option('水'), review: { text: 'approved', audio: 'approved' }, reviewNotes: 'Accepted.',
      recordings: [{ id: 'voice', voice: 'otani', sentenceSrc: 'audio/sentence.mp3', questionSrcs: { drink: 'audio/question.mp3' } }],
      questions: [{ id: 'drink', revision: 1, kind: 'target', prompt: option('何'), formats: ['text'],
        options: ['water', 'coffee', 'beer'].map(option), correctOptionId: 'water', explanation: 'Water.' }] }],
  };
  const changes: ContextualAnswerAmendments = { schemaVersion: 1, language: 'ja-JP', issue: 163,
    supportingVocabulary: [{ id: 'tea', text: 'お茶', reading: 'おちゃ', meaning: 'tea' }],
    amendments: [{ questionId: 'drink', sourceRevision: 1, revision: 2, addedOption: { ...option('tea'), supportingVocabularyIds: ['tea'] } }],
  };
  return { bank, changes };
}

describe('answer-only contextual amendments', () => {
  it('adds a versioned fourth choice without changing the prompt, audio, original choices or source bank', () => {
    const { bank, changes } = fixture();
    const before = structuredClone({ bank, changes });
    const revised = withAnswerAmendments([bank], changes)[0]!;
    const source = bank.contexts[0]!, context = revised.contexts[0]!;
    expect(context.questions[0]).toEqual({ ...source.questions[0], revision: 2, options: [...source.questions[0]!.options, changes.amendments[0]!.addedOption] });
    expect(context.recordings).toEqual(source.recordings);
    expect(context.sentence).toEqual(source.sentence);
    expect(context.revision).toBe(source.revision);
    expect(revised.supportingVocabulary).toEqual(changes.supportingVocabulary);
    expect({ bank, changes }).toEqual(before);
  });

  it('leaves four-choice questions at their existing revision and rejects incomplete coverage', () => {
    const { bank, changes } = fixture();
    expect(() => withAnswerAmendments([bank], { ...changes, amendments: [] })).toThrow(/exactly four/);
    bank.contexts[0]!.questions[0]!.options.push(option('tea'));
    expect(withAnswerAmendments([bank], { ...changes, amendments: [] })).toEqual([bank]);
    expect(() => withAnswerAmendments([bank], changes)).toThrow(/incompatible/);
  });

  it('rejects unknown, duplicate, stale or wrong-language amendments', () => {
    for (const mutate of [
      (value: ContextualAnswerAmendments) => { value.amendments[0]!.questionId = 'missing'; },
      (value: ContextualAnswerAmendments) => { value.amendments.push(structuredClone(value.amendments[0]!)); },
      (value: ContextualAnswerAmendments) => { value.amendments[0]!.sourceRevision = 2; },
      (value: ContextualAnswerAmendments) => { value.amendments[0]!.revision = 3; },
      (value: ContextualAnswerAmendments) => { value.language = 'es-419'; },
    ]) {
      const { bank, changes } = fixture(); mutate(changes);
      expect(() => withAnswerAmendments([bank], changes)).toThrow(/amendment/);
    }
  });

  it.each(['id', 'text', 'reading', 'meaning'] as const)('rejects a repeated choice %s including normalized readings', field => {
    const { bank, changes } = fixture();
    changes.amendments[0]!.addedOption[field] = field === 'id' ? 'water' : ' WATER ';
    expect(() => withAnswerAmendments([bank], changes)).toThrow(/Duplicate/);
    if (field === 'reading') {
      bank.contexts[0]!.questions[0]!.options[0]!.reading = 'ほん';
      changes.amendments[0]!.addedOption.reading = 'ホン';
      expect(() => withAnswerAmendments([bank], changes)).toThrow(/Duplicate/);
    }
  });

  it('merges only referenced support words and rejects missing or conflicting definitions', () => {
    const { bank, changes } = fixture();
    changes.supportingVocabulary = [];
    expect(() => withAnswerAmendments([bank], changes)).toThrow(/Missing/);
    bank.supportingVocabulary = [{ id: 'tea', text: 'お茶', reading: 'おちゃ', meaning: 'tea' }];
    expect(withAnswerAmendments([bank], changes)[0]!.supportingVocabulary).toEqual(bank.supportingVocabulary);
    changes.supportingVocabulary = [{ ...bank.supportingVocabulary[0]!, meaning: 'coffee' }];
    expect(() => withAnswerAmendments([bank], changes)).toThrow(/Conflicting/);
  });

  it('keeps contextual answer vocabulary separate and rejects identity collisions', () => {
    const source = [{ id: 'water' }], additions = [{ id: 'tea' }];
    expect(withAnswerVocabulary(source, additions)).toEqual([{ id: 'water' }, { id: 'tea' }]);
    expect(source).toEqual([{ id: 'water' }]);
    expect(() => withAnswerVocabulary(source, [{ id: 'water' }])).toThrow(/Duplicate/);
  });
});
