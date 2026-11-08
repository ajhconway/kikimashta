import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialVoiceIds, practiceVoices, voicePreferenceKey } from './voices';

beforeEach(() => localStorage.clear());

describe('global practice voice preferences (#148)', () => {
  it('defaults to every approved voice and restores a saved subset in catalog order', () => {
    expect(practiceVoices.map(voice => [voice.name, voice.description])).toEqual([
      ['Otani', 'Tokyo (standard)'], ['Morioki', 'Tokyo (standard)'],
      ['Goro', 'Kansai'], ['Tsuki', 'Kansai'],
      ['Takeshi', 'Kyushu'], ['Lime', 'Kyushu'],
      ['Ritsuto', 'Anime (standard)'], ['Itsuki', 'Anime (standard)'],
    ]);
    expect(initialVoiceIds()).toEqual(practiceVoices.map(voice => voice.id));
    localStorage.setItem(voicePreferenceKey, JSON.stringify(['lime', 'otani', 'lime', 'retired']));
    expect(initialVoiceIds()).toEqual(['otani', 'lime']);
  });

  it.each(['[]', '["retired"]', '[null]', '{}', 'invalid'])('uses all voices for unusable preference %s', saved => {
    localStorage.setItem(voicePreferenceKey, saved);
    expect(initialVoiceIds()).toEqual(practiceVoices.map(voice => voice.id));
  });

  it('uses all voices when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(initialVoiceIds()).toEqual(practiceVoices.map(voice => voice.id));
  });
});
