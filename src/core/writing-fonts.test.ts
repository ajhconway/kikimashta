import { describe, expect, it, vi } from 'vitest';
import { createWritingFontRotation } from './writing-fonts';

const item = { id: 'cat', language: 'ja-JP' };
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
describe('writing font presentations', () => {
  it('uses standard print for lessons without reading or advancing review preferences', () => {
    const preferences = { getItem: vi.fn(() => null), setItem: vi.fn() };
    const next = createWritingFontRotation(preferences);
    expect(next(item, () => 0, 'lesson')).toBe('noto-sans');
    expect(next(item, () => .99, 'lesson')).toBe('noto-sans');
    expect(preferences.getItem).not.toHaveBeenCalled();
    expect(preferences.setItem).not.toHaveBeenCalled();
    expect(next(item, () => 0, 'review')).toBe('noto-serif');
    expect(next(item, () => 0, 'lesson')).toBe('noto-sans');
    expect(next(item, () => 0, 'review')).toBe('zen-maru');
  });
  it('visits all three fonts before repeating, including across visits', () => {
    const preferences = storage();
    const next = createWritingFontRotation(preferences);
    expect(next(item, () => 0)).toBe('noto-serif');
    expect(next(item, () => 0)).toBe('zen-maru');
    expect(createWritingFontRotation(preferences)(item, () => 0)).toBe('klee');
    expect(createWritingFontRotation(preferences)(item, () => 0)).toBe('noto-serif');
  });
  it('keeps words and languages independent and allows different starting fonts', () => {
    const next = createWritingFontRotation(storage());
    expect(next(item, () => .5)).toBe('zen-maru');
    expect(next({ ...item, id: 'dog' }, () => 0)).toBe('noto-serif');
    expect(next({ ...item, language: 'fr-FR' }, () => 0)).toBe('noto-serif');
    expect(next(item, () => 0)).toBe('klee');
  });
  it('keeps rotating in memory if preferences cannot be read or written', () => {
    const fail = () => { throw new Error('Storage blocked'); };
    const next = createWritingFontRotation({ getItem: fail, setItem: fail });
    expect([next(item, () => 0), next(item, () => 0), next(item, () => 0)]).toEqual(['noto-serif', 'zen-maru', 'klee']);
  });
  it('replaces unknown preferences without changing the vocabulary', () => {
    const preferences = { getItem: () => 'old-font', setItem: vi.fn() };
    const original = { ...item };
    expect(createWritingFontRotation(preferences)(item, () => 0)).toBe('noto-serif');
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
      expect(load).toHaveBeenCalledTimes(4);
      check.mockReturnValue(true);
      expect(availableWritingFont('klee')).toBe('klee');
      expect(availableWritingFont('zen-maru', ['犬', '～'])).toBe('noto-sans');
      expect(availableWritingFont('zen-maru', ['犬', '猫'])).toBe('zen-maru');
    } finally { vi.unstubAllGlobals(); }
  });
});
