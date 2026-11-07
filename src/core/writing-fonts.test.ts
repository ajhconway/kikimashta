import { describe, expect, it, vi } from 'vitest';
import { createWritingFontRotation } from './writing-fonts';

const item = { id: 'cat', language: 'ja-JP' };
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
describe('writing font presentations', () => {
  it('visits all three fonts before repeating, including across visits', () => {
    const preferences = storage();
    const next = createWritingFontRotation(preferences);
    expect(next(item, () => 0)).toBe('noto-sans');
    expect(next(item, () => 0)).toBe('noto-serif');
    expect(createWritingFontRotation(preferences)(item, () => 0)).toBe('klee');
    expect(createWritingFontRotation(preferences)(item, () => 0)).toBe('noto-sans');
  });
  it('keeps words and languages independent and allows different starting fonts', () => {
    const next = createWritingFontRotation(storage());
    expect(next(item, () => .5)).toBe('noto-serif');
    expect(next({ ...item, id: 'dog' }, () => 0)).toBe('noto-sans');
    expect(next({ ...item, language: 'fr-FR' }, () => 0)).toBe('noto-sans');
    expect(next(item, () => 0)).toBe('klee');
  });
  it('keeps rotating in memory if preferences cannot be read or written', () => {
    const fail = () => { throw new Error('Storage blocked'); };
    const next = createWritingFontRotation({ getItem: fail, setItem: fail });
    expect([next(item, () => 0), next(item, () => 0), next(item, () => 0)]).toEqual(['noto-sans', 'noto-serif', 'klee']);
  });
  it('replaces unknown preferences without changing the vocabulary', () => {
    const preferences = { getItem: () => 'old-font', setItem: vi.fn() };
    const original = { ...item };
    expect(createWritingFontRotation(preferences)(item, () => 0)).toBe('noto-sans');
    expect(item).toEqual(original);
    expect(preferences.setItem).toHaveBeenCalledTimes(1);
  });
});

describe('font availability', () => {
  it('uses a stable system fallback until a face is loaded and contains loading failures', async () => {
    const { availableWritingFont, preloadWritingFonts } = await import('./writing-fonts');
    const check = vi.fn().mockReturnValue(false);
    const load = vi.fn().mockRejectedValue(new Error('Font unavailable'));
    vi.stubGlobal('document', { fonts: { check, load } });
    try {
      expect(availableWritingFont('klee')).toBe('system');
      preloadWritingFonts();
      await Promise.resolve();
      expect(load).toHaveBeenCalledTimes(3);
      check.mockReturnValue(true);
      expect(availableWritingFont('klee')).toBe('klee');
    } finally { vi.unstubAllGlobals(); }
  });
});
