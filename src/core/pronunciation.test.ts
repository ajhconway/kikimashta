import { describe, expect, it } from 'vitest';
import { japaneseMoras, japanesePronunciationKey, pronunciationSimilarity } from './pronunciation';

describe('Japanese pronunciation proxy (#200)', () => {
  it('normalizes script, width and combining voicing without removing sound contrasts', () => {
    expect(japaneseMoras('ﾆｯﾎﾟﾝ')).toEqual(['に', 'っ', 'ぽ', 'ん']);
    expect(japanesePronunciationKey('ﾆｯﾎﾟﾝ')).toBe('にっぽん');
    expect(japanesePronunciationKey('ニッポン')).toBe(japanesePronunciationKey('にっぽん'));
    expect(japaneseMoras('か\u3099っこう')).toEqual(['が', 'っ', 'こ', 'う']);
    expect(pronunciationSimilarity('カ\u3099ッコウ', 'がっこう')).toBe(1);
  });

  it('keeps glides and borrowed small-vowel sounds together while retaining length and small っ', () => {
    expect(japaneseMoras('しゅっちょう')).toEqual(['しゅ', 'っ', 'ちょ', 'う']);
    expect(japaneseMoras('ファックス')).toEqual(['ふぁ', 'っ', 'く', 'す']);
    expect(japaneseMoras('ﾃｨｰ')).toEqual(['てぃ', 'ー']);
    expect(japaneseMoras('ヴァイオリン')).toEqual(['ゔぁ', 'い', 'お', 'り', 'ん']);
    expect(japaneseMoras('コーヒー')).toEqual(['こ', 'ー', 'ひ', 'ー']);
  });

  it('measures real substitution, insertion and deletion contrasts by mora count', () => {
    expect(pronunciationSimilarity('まち', 'はち')).toBe(.5);
    expect(pronunciationSimilarity('おばさん', 'おばあさん')).toBe(.8);
    expect(pronunciationSimilarity('おばあさん', 'おばさん')).toBe(.8);
    expect(pronunciationSimilarity('きて', 'きって')).toBeCloseTo(2 / 3);
    expect(pronunciationSimilarity('コート', 'こと')).toBeCloseTo(2 / 3);
    expect(pronunciationSimilarity('きょう', 'きよう')).toBeCloseTo(1 / 3);
    expect(pronunciationSimilarity('ねこ', 'いぬ')).toBe(0);
  });

  it('retains voicing, long-vowel spellings and geminates in canonical identity', () => {
    expect(japanesePronunciationKey('かき')).not.toBe(japanesePronunciationKey('がき'));
    expect(japanesePronunciationKey('きて')).not.toBe(japanesePronunciationKey('きって'));
    expect(japanesePronunciationKey('コー')).not.toBe(japanesePronunciationKey('こう'));
    expect(pronunciationSimilarity('かき', 'がき')).toBe(.5);
    expect(pronunciationSimilarity('パ', 'バ')).toBe(0);
  });

  it.each(['', ' ', 'ねこ ', '猫', 'neko', 'ねこ1', 'ねこ・いぬ', 'ゞ', 'ヽ', 'ー', 'ゃ', 'んゃ', 'っゃ', 'きゃゅ', 'ヶ', 'ヷ'])(
    'leaves unsupported readings unclassified: %j', reading => {
      expect(japaneseMoras(reading)).toBeUndefined();
      expect(japanesePronunciationKey(reading)).toBeUndefined();
      expect(pronunciationSimilarity(reading, 'ねこ')).toBeUndefined();
      expect(pronunciationSimilarity('ねこ', reading)).toBeUndefined();
    },
  );
});
