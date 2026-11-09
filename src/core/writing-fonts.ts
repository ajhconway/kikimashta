import { deviceStorage } from './device-storage';
import type { WordItem } from '../types';

export const writingFonts = [
  { id: 'noto-sans', family: 'Kikimashta Noto Sans JP', weight: 600 },
  { id: 'noto-serif', family: 'Kikimashta Noto Serif JP', weight: 600 },
  { id: 'zen-maru', family: 'Kikimashta Zen Maru Gothic', weight: 500 },
  { id: 'klee', family: 'Kikimashta Klee One', weight: 600 },
] as const;
export type WritingFontId = typeof writingFonts[number]['id'];
export type WritingFont = WritingFontId | 'system';
const reviewFonts = writingFonts.filter(font => font.id !== 'noto-sans');
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** This is a cosmetic device preference, separate from learning/account history. */
export function createWritingFontRotation(storage?: PreferenceStorage) {
  const last = new Map<string, WritingFontId>();
  return (item: Pick<WordItem, 'id' | 'language'>, random = Math.random, phase: 'lesson' | 'review' = 'review'): WritingFontId => {
    if (phase === 'lesson') return 'noto-sans';
    const key = 'kikimashta-writing-font:v1:' + JSON.stringify([item.language, item.id]);
    let previous: string | undefined = last.get(key);
    try { previous ??= (storage ?? deviceStorage).getItem(key) ?? undefined; } catch { /* Memory rotation remains available. */ }
    const index = reviewFonts.findIndex(font => font.id === previous);
    const next = reviewFonts[index < 0 ? Math.min(reviewFonts.length - 1, Math.max(0, Math.floor(random() * reviewFonts.length))) : (index + 1) % reviewFonts.length]!.id;
    last.set(key, next);
    try { (storage ?? deviceStorage).setItem(key, next); } catch { /* Appearance must never block practice. */ }
    return next;
  };
}

export function preloadWritingFonts(): void {
  if (!document.fonts) return;
  for (const font of writingFonts) void document.fonts.load(`${font.weight} 24px "${font.family}"`, '犬りんご').catch(() => {});
}

/** Freeze the fallback for this presentation if its font has not loaded yet. */
export function availableWritingFont(id: WritingFontId, texts: readonly string[] = []): WritingFont {
  // Zen does not contain U+FF5E. Keep the entire question in standard print.
  if (id === 'zen-maru' && texts.some(text => text.includes('～'))) id = 'noto-sans';
  const font = writingFonts.find(font => font.id === id)!;
  if (!document.fonts) return id;
  const loaded = Array.from(document.fonts).some(face => face.status === 'loaded' &&
    face.family.replace(/["']/g, '') === font.family && face.weight === String(font.weight));
  return loaded ? id : 'system';
}
