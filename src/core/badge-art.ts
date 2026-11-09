import type { MasteryLevel } from './mastery';

export interface BadgeArtwork {
  src: string;
  travelSrc?: string;
  face: { x: number; top: number; bottom: number; flowerBottom: number };
  travelCenter?: { x: number; y: number; width: number; height: number };
  center: { x: number; y: number; width: number; height: number };
  ribbon: { left: number; right: number; baseline: number; bow: number; iconX: number; iconY: number; iconWidth: number; iconHeight: number; labelOffset: string; fontSize: number };
}
const standard = {
  ribbon: { left: 20, right: 82, baseline: 85, bow: -10, iconX: 35, iconY: 74, iconWidth: 25, iconHeight: 19, labelOffset: '73%', fontSize: 20 },
};
/** Fit each family to the actual cream face, excluding the ribbon and WK flower. */
function faceSlots(x: number, top: number, bottom: number, flowerBottom: number) {
  const suitcaseSize = (bottom - top) * .84;
  return {
    face: { x, top, bottom, flowerBottom },
    center: { x, y: (flowerBottom + bottom) / 2, width: 43, height: 30 },
    travelCenter: { x, y: (top + bottom) / 2, width: suitcaseSize, height: suitcaseSize },
  };
}
/** Face anchors measured on the actual illustrated backgrounds, in canvas percent (#181). */
export const badgeArtwork: Record<MasteryLevel['label'], BadgeArtwork> = {
  New: { ...standard, ...faceSlots(49.3, 19.2, 59, 34.6), src: 'media/badges/new-base-v1.webp', travelSrc: 'media/badges/new-travel-base-v1.webp' },
  Learning: { ...standard, ...faceSlots(49.2, 24.3, 62, 38.5), src: 'media/badges/learning-base-v1.webp', travelSrc: 'media/badges/learning-travel-base-v1.webp', ribbon: { ...standard.ribbon, baseline: 86, iconY: 75 } },
  Improving: { ...standard, ...faceSlots(48.8, 20.9, 59.5, 35.4), src: 'media/badges/improving-base-v1.webp', travelSrc: 'media/badges/improving-travel-base-v1.webp' },
  Familiar: { ...standard, ...faceSlots(49.2, 22, 59, 36.2), src: 'media/badges/familiar-base-v1.webp', travelSrc: 'media/badges/familiar-travel-base-v1.webp', ribbon: { ...standard.ribbon, baseline: 84.5, iconY: 73.5 } },
  Steady: { ...standard, ...faceSlots(48.9, 20.8, 59.5, 34.9), src: 'media/badges/steady-base-v1.webp', travelSrc: 'media/badges/steady-travel-base-v1.webp' },
  Strong: { ...standard, ...faceSlots(48.8, 20.5, 60.5, 35.4), src: 'media/badges/strong-base-v1.webp', travelSrc: 'media/badges/strong-travel-base-v1.webp' },
  Confident: { ...standard, ...faceSlots(49.1, 19.3, 60, 34.9), src: 'media/badges/confident-base-v1.webp', travelSrc: 'media/badges/confident-travel-base-v1.webp' },
  Mastered: { ...standard, ...faceSlots(49.1, 20.8, 60, 35.3), src: 'media/badges/mastered-wk-redraw-v1.webp', travelSrc: 'media/badges/mastered-travel-redraw-v1.webp' },
};
export const suitcaseArtwork = 'media/badges/suitcase-emblem-v1.webp';

export const suitcaseViewBox = '170 180 910 900';
export const formatArtwork = {
  picture: { src: 'media/badges/picture-emblem-v2.webp', viewBox: '170 140 1107 842', width: 1448, height: 1086 },
  writing: { src: 'media/badges/writing-emblem-v2.webp', viewBox: '76 83 1157 1033', width: 1308, height: 1202 },
};
