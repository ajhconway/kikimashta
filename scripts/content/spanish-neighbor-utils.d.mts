import type { WordItem } from '../../src/types';

export const spanishBankFiles: readonly string[];
export function spanishNeighborBank(root: string): (WordItem & { packId: string })[];
export function spanishPictureCompatible(a: WordItem, b: WordItem): boolean;
export function firstSpanishTrio<T extends WordItem>(candidates: T[]): T[] | undefined;
export function normalizedEditDistance(a: readonly string[], b: readonly string[]): number;
