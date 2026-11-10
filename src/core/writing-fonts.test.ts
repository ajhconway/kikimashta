import { describe, expect, it, vi } from 'vitest';
import { createWritingFontRotation } from './writing-fonts';

const item = { id: 'cat', language: 'ja-JP' };
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
});

describe('font availability', () => {
  it('uses a stable system fallback until a face is loaded and contains loading failures', async () => {
    const { availableWritingFont, preloadWritingFonts } = await import('./writing-fonts');
    const faces = [
      { family: 'Kikimashta Klee One', weight: '600', status: 'unloaded' },
      { family: 'Kikimashta Noto Sans JP', weight: '600', status: 'unloaded' },
      { family: 'Kikimashta Zen Maru Gothic', weight: '500', status: 'unloaded' },
    ];
    const load = vi.fn().mockRejectedValue(new Error('Font unavailable'));
    vi.stubGlobal('document', { fonts: Object.assign(faces, { load }) });
    try {
      expect(availableWritingFont('klee')).toBe('system');
      preloadWritingFonts();
      await Promise.resolve();
      expect(load).toHaveBeenCalledTimes(4);
      faces.forEach(face => { face.status = 'loaded'; });
      expect(availableWritingFont('klee')).toBe('klee');
      expect(availableWritingFont('zen-maru', ['犬', '～'])).toBe('noto-sans');
      expect(availableWritingFont('zen-maru', ['犬', '猫'])).toBe('zen-maru');
    } finally { vi.unstubAllGlobals(); }
  });
});
