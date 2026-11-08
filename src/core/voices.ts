import registry from '../../content/elevenlabs-voices.json';

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

export function initialVoiceIds(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(voicePreferenceKey) ?? 'null');
    if (Array.isArray(saved) && saved.every(id => typeof id === 'string')) {
      const ids = practiceVoices.filter(voice => saved.includes(voice.id)).map(voice => voice.id);
      if (ids.length) return ids;
    }
  } catch { /* Use all voices when optional preferences are unavailable. */ }
  return practiceVoices.map(voice => voice.id);
}
