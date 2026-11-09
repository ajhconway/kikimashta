import { deviceStorage } from './device-storage';
import registry from '../../content/elevenlabs-voices.json';
import spanishRegistry from '../../content/es-419-voices.json';

const accentLabels: Record<string, string> = {
  standard: 'Tokyo (standard)',
  kansai: 'Kansai',
  kyushu: 'Kyushu',
};

/** Approved Japanese voices, using the same stable IDs as the recordings. (#148) */
export const practiceVoices = registry.voices.map(voice => ({
  id: voice.voice, name: voice.name,
  description: voice.style === 'anime' ? 'Anime (standard)' : accentLabels[voice.accent] ?? voice.accent,
}));
export const voicePreferenceKey = 'kikimashta-practice-voices-v1';

const spanishVoices = spanishRegistry.voices.map(voice => ({
  id: voice.voice, name: voice.name, description: voice.region,
}));

/** Keep voice selection and regional descriptions specific to the learning language. */
export function practiceVoicesFor(languageId = 'ja-JP') {
  if (languageId === 'ja-JP') return practiceVoices;
  if (languageId === 'es-419') return spanishVoices;
  return [];
}

export function voicePreferenceKeyFor(languageId = 'ja-JP'): string {
  return languageId === 'ja-JP' ? voicePreferenceKey : `${voicePreferenceKey}:${languageId}`;
}

export function initialVoiceIds(languageId = 'ja-JP'): string[] {
  const voices = practiceVoicesFor(languageId);
  try {
    const saved: unknown = JSON.parse(deviceStorage.getItem(voicePreferenceKeyFor(languageId)) ?? 'null');
    if (Array.isArray(saved) && saved.every(id => typeof id === 'string')) {
      const ids = voices.filter(voice => saved.includes(voice.id)).map(voice => voice.id);
      if (ids.length) return ids;
    }
  } catch { /* Use all voices when optional preferences are unavailable. */ }
  return voices.map(voice => voice.id);
}
