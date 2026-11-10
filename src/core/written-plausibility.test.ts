import { describe, expect, it } from 'vitest';
import { writtenKanaEnding } from './written-plausibility';

describe('visible Japanese writing endings', () => {
  it.each([['上げる', 'げる'], ['大きい', 'きい'],
    ['お休み', 'み'], ['田んぼ', 'んぼ'], ['  広げる  ', 'げる']])('extracts the complete hiragana ending of %s', (text, ending) => {
    expect(writtenKanaEnding(text!)).toBe(ending);
  });
  it.each(['犬', '入り口', 'りんご', 'コーヒー', 'coffee'])('does not invent an ending for %s', text => {
    expect(writtenKanaEnding(text)).toBeUndefined();
  });
});
