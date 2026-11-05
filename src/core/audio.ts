import type { AudioAsset } from '../types';

/** Select once when presenting a word; replay the selected recording until advancing. */
export function selectRecording(recordings: AudioAsset[], random = Math.random): AudioAsset {
  if (!recordings.length) throw new Error('A word needs at least one recording.');
  return recordings[Math.floor(random() * recordings.length)]!;
}
