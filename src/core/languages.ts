import spanishBasic from '../../content/es-419-basic-1.json';
import { spanishFoundationCards } from '../content/spanish-basic';
import { spanishBanks, spanishVocabulary } from '../content/spanish-vocabulary';
import spanishExclusions from '../../content/spanish-picture-exclusions.json';
import type { PracticeCard, WordBank } from '../types';
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
  foundationCards?: readonly PracticeCard[];
}

const spanishPool: WordBank = { id: 'es-419-adaptive', language: 'es-419', title: 'Spanish listening',
  items: spanishVocabulary.map(item => ({ ...item,
    pictureDistractorExclusions: [...new Set([
      ...(item.pictureDistractorExclusions ?? []),
      ...spanishExclusions.pairs.filter(pair => pair.ids.includes(item.id)).flatMap(pair => pair.ids.filter(id => id !== item.id)),
    ])],
  })),
};
validateBank(spanishPool);

export const learningLanguages: readonly LearningLanguage[] = [
  { id: 'ja-JP', title: 'Japanese', pool: practicePool, packs: cardPacks,
    packPreferenceKey, writing: 'japanese', libraryPath: 'vocabulary/' },
  { id: 'es-419', title: 'Latin American Spanish', pool: spanishPool,
    foundationCards: spanishFoundationCards,
    packs: spanishBanks.map(bank => ({ badgeFamily: 'suitcase' as const, id: `${bank.id}-pictures`, language: bank.language,
      title: `${bank.title} · ${bank.id === spanishBasic.id ? 'Pictures + contexts' : 'Pictures'}`, exercise: 'audio-picture' as const, itemIds: [...bank.items.map(item => item.id), ...(bank.id === spanishBasic.id ? spanishFoundationCards.map(card => card.item.id) : [])],
    })), packPreferenceKey: 'kikimashta-card-packs-v1:es-419', writing: 'system', libraryPath: 'vocabulary/?language=es-419&pack=es-419-travel-1-pictures' },
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
