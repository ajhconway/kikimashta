import { describe, expect, it } from 'vitest';
import { spanishPhonemeUnits, spanishPronunciationKey } from './spanish-pronunciation';

describe('canonical Spanish phoneme preparation (#222)', () => {
  it('merges the pinned doubled ll allophone with consonantal y under yeísmo', () => {
    expect(spanishPronunciationKey('ˈa_j_j_a')).toBe(spanishPronunciationKey('ˈa_ʝ_a'));
    expect(spanishPronunciationKey('k_ˈa_j_j_e')).toBe(spanishPronunciationKey('k_ˈa_ʝ_e'));
  });
  it('preserves glides, stress, multi-codepoint phones and boundaries', () => {
    expect(spanishPhonemeUnits('ʝ_ˈu_β_j_a')).toEqual(['ʝ', 'ˈ', 'u', 'β', 'j', 'a']);
    expect(spanishPronunciationKey('p_j_ˈe')).not.toBe(spanishPronunciationKey('p_ˈi__e'));
    expect(spanishPronunciationKey('j_ˈe_l_o')).not.toBe(spanishPronunciationKey('ʝ_ˈe_l_o'));
    expect(spanishPhonemeUnits('j j')).toEqual(['j', '|', 'j']);
    expect(spanishPhonemeUnits('j_ˈj')).toEqual(['j', 'ˈ', 'j']);
    expect(spanishPhonemeUnits('p_ˌa_ˈaɪ_o')).toEqual(['p', 'a', 'ˈ', 'aɪ', 'o']);
  });
  it('rejects missing transcriptions', () => {
    expect(() => spanishPhonemeUnits('')).toThrow(/Empty/);
    expect(() => spanishPhonemeUnits('ˈ')).toThrow(/Empty/);
  });
});
