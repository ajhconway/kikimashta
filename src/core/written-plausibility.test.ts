import { describe, expect, it } from 'vitest';
import { writtenKanaEnding } from './written-plausibility';

describe('visible Japanese writing endings', () => {
  it.each([['上げる', 'げる'], ['下げる', 'げる'], ['大きい', 'きい'], ['小さい', 'さい'],
    ['お休み', 'み'], ['田んぼ', 'んぼ'], ['  広げる  ', 'げる']])('extracts the complete hiragana ending of %s', (text, ending) => {
    expect(writtenKanaEnding(text!)).toBe(ending);
  });
  it.each(['犬', 'お金', '入り口', '日の出', 'りんご', 'コーヒー', 'パン', 'coffee'])('does not invent an ending for %s', text => {
    expect(writtenKanaEnding(text)).toBeUndefined();
  });
});
