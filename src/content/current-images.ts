import food2 from '../../content/es-419-food-2.json';
import type { ImageAsset } from '../types';

const glass = food2.items.find(item => item.id === 'es-419-travel-drinking-glass')!;

/** Current accepted media changes presentation without rewriting historical banks or item eligibility. */
export function withCurrentImage<T extends { id: string; language: string; image: ImageAsset }>(item: T): T {
  const sharedGlass = item.language === 'es-419' && item.id === glass.id || item.language === 'ja-JP' && item.id === 'ja-cup';
  if (!sharedGlass || item.image.src === glass.image.src) return item;
  return { ...item, image: { ...item.image, src: glass.image.src } };
}
