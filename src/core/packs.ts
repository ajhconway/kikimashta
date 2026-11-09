import catalogue from '../../content/catalog/ja.json';
import overrides from '../../content/catalog/review-overrides.json';
import { exercises } from './cards';
import type { Exercise, PracticeCard, WordItem } from '../types';

export interface CardPack {
  id: string;
  title: string;
  sourceLevel?: number;
  language: string;
  exercise: Exercise;
  itemIds: string[];
}

/** Pack membership shares vocabulary identity; format keeps learning independent. (#108) */
export const cardPacks: CardPack[] = [1, 2, 3, 4, 5].flatMap(sourceLevel =>
  (['pictures', 'writing'] as const).map(format => ({
    id: `ja-wanikani-${sourceLevel}-${format}`,
    title: `WaniKani level ${sourceLevel} · ${format === 'pictures' ? 'Pictures' : 'Writing'}`,
    sourceLevel,
    language: 'ja-JP',
    exercise: format === 'pictures' ? 'audio-picture' as const : 'audio-text' as const,
    itemIds: catalogue.items.filter(item => item.sourceLevel === sourceLevel &&
      !('removalReason' in (overrides[item.id as keyof typeof overrides] ?? {}))).map(item => item.id),
  })),
);
export const packPreferenceKey = 'kikimashta-card-packs-v1';

export function initialPackIds(packs: readonly CardPack[] = cardPacks, preferenceKey = packPreferenceKey): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(preferenceKey) ?? 'null');
    if (Array.isArray(saved) && saved.every(id => typeof id === 'string')) {
      return packs.filter(pack => saved.includes(pack.id)).map(pack => pack.id);
    }
  } catch { /* Preferences are optional. */ }
  return packs.map(pack => pack.id);
}

/** Only already approved practice items enter lessons; packs don't bypass content approval. */
export function selectedPracticeCards(items: readonly WordItem[], packIds: readonly string[], packs: readonly CardPack[] = cardPacks): PracticeCard[] {
  const memberships = packs.filter(pack => packIds.includes(pack.id)).map(pack => ({
    language: pack.language, exercise: pack.exercise, ids: new Set(pack.itemIds),
  }));
  return items.flatMap(item => exercises.filter(exercise => (!item.wordExercises || item.wordExercises.includes(exercise)) && memberships.some(pack =>
    pack.language === item.language && pack.exercise === exercise && pack.ids.has(item.id))).map(exercise => ({ item, exercise })));
}
