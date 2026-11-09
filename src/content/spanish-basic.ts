import draft from '../../content/spanish-basic-1/draft.json';
import basic from '../../content/es-419-basic-1.json';
import travel from '../../content/es-419.json';
import type { ContextualBank } from './contextual-types';
import type { PracticeCard, WordItem } from '../types';

/** Abstract targets are contextual metadata, never isolated word-picture cards. */
export const spanishFoundationVocabulary: WordItem[] = basic.foundationVocabulary.map(word => ({
  ...word, language: 'es-419', theme: 'basic', label: word.meaning,
  image: { src: '', alt: '', source: 'generated' }, audio: word.audio.map(clip => ({ ...clip, source: 'synthesized' })),
}));
export const spanishContextualVocabulary: WordItem[] = [...travel.items, ...basic.items, ...spanishFoundationVocabulary] as WordItem[];
const prompt = (value: { text: string; meaning: string }) => ({ ...value, reading: value.text, grammarTags: [], supportingVocabularyIds: [] });
export const spanishBasicContexts: ContextualBank = {
  schemaVersion: 1, id: 'es-419-basic-1-contexts', language: 'es-419', grammarProfile: 'basic-spanish-1',
  grammarReference: 'content/spanish-basic-1/draft.json', grammarPoints: [], supportingVocabulary: [],
  contexts: draft.contexts.map(context => {
    const target = spanishFoundationVocabulary.find(word => word.id === context.targetItemId);
    if (!target) throw new Error('Unknown Spanish foundation target.');
    const questionId = context.id + '-question';
    const authoredTarget = draft.items.find(item => item.id === target.id)!;
    const canonicalSurface = 'spokenExampleForm' in authoredTarget ? authoredTarget.spokenExampleForm! : target.text;
    const match = context.sentence.text.match(new RegExp(canonicalSurface, 'iu'));
    if (!match) throw new Error('Missing Spanish foundation target occurrence.');
    const surface = match[0];
    return { id: context.id, revision: context.revision, stage: 'simple', targetItemId: target.id,
      introduction: { text: target.text, meaning: target.label },
      targetOccurrence: { surface, reading: surface }, sentence: prompt(context.sentence),
      questions: [{ id: questionId, revision: 1, kind: 'detail', prompt: prompt(context.question),
        formats: ['picture', 'text'], options: context.options.map(option => ({ ...prompt(option), id: option.id,
          vocabularyItemId: option.vocabularyItemId, imageItemId: option.vocabularyItemId })),
        correctOptionId: context.correctOptionId, explanation: context.explanation }],
      recordings: draft.voices.map(voice => ({ id: context.id + '-' + voice.voice, voice: voice.voice,
        sentenceSrc: `audio/es-419-basic-1/${voice.voice}/${context.id}-sentence.mp3`,
        questionSrcs: { [questionId]: `audio/es-419-basic-1/${voice.voice}/${context.id}-question.mp3` } })),
      review: { text: 'approved', audio: 'approved' }, reviewNotes: '',
    };
  }),
};
export const spanishFoundationCards: PracticeCard[] = spanishFoundationVocabulary.map(item => ({ item, exercise: 'context-simple-picture' }));
