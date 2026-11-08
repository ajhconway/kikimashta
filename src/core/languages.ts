import spanish from '../../content/es-419.json';
import type { WordBank } from '../types';
import { validateBank } from './session';
import { practicePool } from './practice';
import { cardPacks, packPreferenceKey, type CardPack } from './packs';

/** Content and presentation belong to a learning language, independently of UI copy. */
export interface LearningLanguage {
  id: string;
  title: string;
  pool: WordBank;
  packs: readonly CardPack[];
  packPreferenceKey: string;
  writing: 'japanese' | 'system';
  libraryPath?: string;
  unavailableMessage?: string;
}

const spanishBank = spanish as WordBank;
const spanishReady = spanishBank.items.every(item => item.audio.length > 0);
if (spanishReady) validateBank(spanishBank);

export const learningLanguages: readonly LearningLanguage[] = [
  { id: 'ja-JP', title: 'Japanese', pool: practicePool, packs: cardPacks,
    packPreferenceKey, writing: 'japanese', libraryPath: 'vocabulary/' },
  { id: 'es-419', title: 'Latin American Spanish', pool: { id: 'es-419-adaptive', language: 'es-419', title: 'Spanish listening',
      items: spanishReady ? spanishBank.items : [] },
    packs: [{ id: 'es-419-travel-1-pictures', language: 'es-419',
      title: 'Travel level 1 · Pictures', exercise: 'audio-picture',
      itemIds: spanish.items.map(item => item.id),
    }], packPreferenceKey: 'kikimashta-card-packs-v1:es-419', writing: 'system', libraryPath: 'vocabulary/?language=es-419&pack=es-419-travel-1-pictures',
    unavailableMessage: 'Travel level 1 is being prepared. Spanish recordings are needed before practice is available.' },
];
export const languagePreferenceKey = 'kikimashta-learning-language-v1';

export function initialLanguage(): LearningLanguage {
  try {
    const saved = localStorage.getItem(languagePreferenceKey);
    const language = learningLanguages.find(language => language.id === saved);
    if (language) return language;
  } catch { /* Device preferences are optional. */ }
  return learningLanguages[0]!;
}
