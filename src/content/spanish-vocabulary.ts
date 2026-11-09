import travel from '../../content/es-419.json';
import travel2 from '../../content/es-419-travel-2.json';
import travel3 from '../../content/es-419-travel-3.json';
import travel4 from '../../content/es-419-travel-4.json';
import basic from '../../content/es-419-basic-1.json';
import food from '../../content/es-419-food-1.json';
import type { WordBank } from '../types';

export const spanishBanks = [travel, travel2, travel3, travel4, basic, food] as WordBank[];

/** Shared IDs retain one identity; the accepted Food rice picture is current across Spanish surfaces. */
export const spanishVocabulary = [...new Map(spanishBanks.flatMap(bank => bank.items).map(item => [item.id, item] as const)).values()];
