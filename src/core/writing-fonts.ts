import type { WordItem } from '../types';

export const writingFonts = [
  { id: 'noto-sans', family: 'Kikimashta Noto Sans JP' },
  { id: 'noto-serif', family: 'Kikimashta Noto Serif JP' },
  { id: 'klee', family: 'Kikimashta Klee One' },
] as const;
export type WritingFontId = typeof writingFonts[number]['id'];
export type WritingFont = WritingFontId | 'system';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** This is a cosmetic device preference, separate from learning/account history. */
export function createWritingFontRotation(storage?: PreferenceStorage) {
  const last = new Map<string, WritingFontId>();
  return (item: Pick<WordItem, 'id' | 'language'>, random = Math.random): WritingFontId => {
    const key = 'kikimashta-writing-font:v1:' + JSON.stringify([item.language, item.id]);
    let previous: string | undefined = last.get(key);
    try { previous ??= (storage ?? localStorage).getItem(key) ?? undefined; } catch { /* Memory rotation remains available. */ }
    const index = writingFonts.findIndex(font => font.id === previous);
    const next = writingFonts[index < 0 ? Math.min(writingFonts.length - 1, Math.max(0, Math.floor(random() * writingFonts.length))) : (index + 1) % writingFonts.length]!.id;
    last.set(key, next);
    try { (storage ?? localStorage).setItem(key, next); } catch { /* Appearance must never block practice. */ }
    return next;
  };
}

export function preloadWritingFonts(): void {
  if (!document.fonts) return;
  for (const font of writingFonts) void document.fonts.load(`600 24px "${font.family}"`, '犬りんご').catch(() => {});
}

/** Freeze the fallback for this presentation if its font has not loaded yet. */
export function availableWritingFont(id: WritingFontId): WritingFont {
  const font = writingFonts.find(font => font.id === id)!;
  return document.fonts && !document.fonts.check(`600 24px "${font.family}"`, '犬りんご') ? 'system' : id;
}
