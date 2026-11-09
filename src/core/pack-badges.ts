import type { PracticeCard, WordItem } from '../types';
import { answerFormat, cardKey } from './cards';
import { masteryLevels, packMastery, type MasteryLevel } from './mastery';
import { selectedPracticeCards, type CardPack } from './packs';
import type { ScheduledWord } from './scheduler';

export interface PackBadge {
  pack: CardPack;
  level: MasteryLevel;
  cardCount: number;
}

/** Current pack minimum, including unseen cards; practice selection never changes an award (#181). */
export function packBadges(items: readonly WordItem[], packs: readonly CardPack[], schedules: readonly ScheduledWord[], foundationCards: readonly PracticeCard[] = []): PackBadge[] {
  const byCard = new Map(schedules.map(word => [cardKey(word), word]));
  return packs.flatMap(pack => {
    const cards = [...selectedPracticeCards(items, [pack.id], [pack]), ...foundationCards.filter(card =>
      card.item.language === pack.language && pack.itemIds.includes(card.item.id) && answerFormat(card.exercise) === answerFormat(pack.exercise))];
    if (!cards.length) return [];
    const level = packMastery(cards, byCard).lowest;
    return level.minimumMs >= masteryLevels[2].minimumMs ? [{ pack, level, cardCount: cards.length }] : [];
  });
}
