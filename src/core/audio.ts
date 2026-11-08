import type { AudioAsset } from '../types';

/** Select once when presenting a word; replay the selected recording until advancing. */
export function selectRecording(recordings: AudioAsset[], random = Math.random, voiceIds?: readonly string[]): AudioAsset {
  if (!recordings.length) throw new Error('A word needs at least one recording.');
  const preferred = voiceIds ? recordings.filter(recording => recording.voice && voiceIds.includes(recording.voice)) : recordings;
  const available = preferred.length ? preferred : recordings;
  return available[Math.floor(random() * available.length)]!;
}
