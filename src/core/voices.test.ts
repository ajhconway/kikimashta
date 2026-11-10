import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialVoiceIds, practiceVoices, practiceVoicesFor, voicePreferenceKey, voicePreferenceKeyFor } from './voices';

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

describe('language-scoped Spanish practice voices (#159)', () => {
  it('lists all eight selected voices with explicit regional labels', () => {
    expect(practiceVoicesFor('es-419').map(voice => [voice.id, voice.name, voice.description])).toEqual([
      ['juan', 'Juan', 'Mexico City, Mexico'], ['pamela', 'Pamela', 'Mexico City, Mexico'],
      ['albeiro', 'Albeiro O', 'Bogotá, Colombia'], ['carito', 'Carito', 'Bogotá, Colombia'],
      ['santiago', 'Santiago', 'Buenos Aires, Argentina'], ['agustina', 'Agustina', 'Buenos Aires, Argentina'],
      ['carlos-figueroa', 'Carlos Figueroa', 'Puerto Rico · Caribbean Spanish'], ['veronica', 'Veronica', 'Puerto Rico · Caribbean Spanish'],
    ]);
    expect(initialVoiceIds('es-419')).toEqual(practiceVoicesFor('es-419').map(voice => voice.id));
    expect(practiceVoicesFor('unsupported')).toEqual([]);
  });

  it('preserves the Japanese key and restores each language independently', () => {
    expect(voicePreferenceKeyFor('ja-JP')).toBe(voicePreferenceKey);
    const spanishKey = voicePreferenceKeyFor('es-419');
    expect(spanishKey).not.toBe(voicePreferenceKey);
    localStorage.setItem(voicePreferenceKey, JSON.stringify(['lime']));
    localStorage.setItem(spanishKey, JSON.stringify(['pamela', 'juan', 'cesar', 'lime', 'juan']));
    expect(initialVoiceIds()).toEqual(['lime']);
    expect(initialVoiceIds('es-419')).toEqual(['juan', 'pamela']);
    localStorage.setItem(spanishKey, JSON.stringify(['veronica']));
    expect(initialVoiceIds('es-419')).toEqual(['veronica']);
    expect(initialVoiceIds()).toEqual(['lime']);
  });

  it('defaults to all Spanish voices when the saved subset belongs to Japanese', () => {
    localStorage.setItem(voicePreferenceKeyFor('es-419'), '["lime"]');
    expect(initialVoiceIds('es-419')).toEqual(practiceVoicesFor('es-419').map(voice => voice.id));
  });
});
