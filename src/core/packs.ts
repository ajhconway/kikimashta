import starter from '../../content/ja.json';
import catalogue from '../../content/catalog/ja.json';
import overrides from '../../content/catalog/review-overrides.json';
import { exercises } from './cards';
import type { Exercise, PracticeCard, WordItem } from '../types';

export interface CardPack {
  id: string;
  title: string;
  sourceLevel: number;
  exercise: Exercise;
  itemIds: string[];
}

/** Pack membership shares vocabulary identity; format keeps learning independent. (#108) */
export const cardPacks: CardPack[] = [1, 2, 3, 4, 5].flatMap(sourceLevel =>
  (['pictures', 'writing'] as const).map(format => ({
    id: `ja-wanikani-${sourceLevel}-${format}`,
    title: `WaniKani level ${sourceLevel} · ${format === 'pictures' ? 'Pictures' : 'Writing'}`,
    sourceLevel,
    exercise: format === 'pictures' ? 'audio-picture' as const : 'audio-text' as const,
    itemIds: catalogue.items.filter(item => item.sourceLevel === sourceLevel &&
      !('removalReason' in (overrides[item.id as keyof typeof overrides] ?? {}))).map(item => item.id),
  })),
);
/** Older starter words have no WaniKani level; retain their existing schedules explicitly. */
export const practicePacks: Omit<CardPack, 'sourceLevel'>[] = [...cardPacks,
  ...(['audio-picture', 'audio-text'] as const).map(exercise => ({
    id: exercise === 'audio-picture' ? 'ja-starter-pictures' : 'ja-starter-writing',
    title: `Starter words · ${exercise === 'audio-picture' ? 'Pictures' : 'Writing'}`,
    exercise,
    itemIds: starter.items.filter(item => !catalogue.items.some(entry => entry.id === item.id)).map(item => item.id),
  })),
];
export const packPreferenceKey = 'kikimashta-card-packs-v1';

export function initialPackIds(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(packPreferenceKey) ?? 'null');
    if (Array.isArray(saved) && saved.every(id => typeof id === 'string')) {
      return practicePacks.filter(pack => saved.includes(pack.id)).map(pack => pack.id);
    }
  } catch { /* Preferences are optional. */ }
  return practicePacks.map(pack => pack.id);
}

/** Only already approved practice items enter lessons; packs don't bypass content approval. */
export function selectedPracticeCards(items: readonly WordItem[], packIds: readonly string[]): PracticeCard[] {
  const memberships = practicePacks.filter(pack => packIds.includes(pack.id)).map(pack => ({
    exercise: pack.exercise, ids: new Set(pack.itemIds),
  }));
  return items.flatMap(item => exercises.filter(exercise => memberships.some(pack =>
    pack.exercise === exercise && pack.ids.has(item.id))).map(exercise => ({ item, exercise })));
}
