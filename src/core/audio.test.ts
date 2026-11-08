import { describe, expect, it } from 'vitest';
import type { AudioAsset } from '../types';
import { selectRecording } from './audio';

const recordings: AudioAsset[] = [
  { src: 'audio/marin-cat.mp3', source: 'synthesized', voice: 'marin' },
  { src: 'audio/cedar-cat.mp3', source: 'synthesized', voice: 'cedar' },
];

describe('recording selection', () => {
  it('can select either voice without modifying the available recordings', () => {
    const before = structuredClone(recordings);
    expect(selectRecording(recordings, () => 0)).toEqual(recordings[0]);
    expect(selectRecording(recordings, () => 0.999)).toEqual(recordings[1]);
    expect(recordings).toEqual(before);
  });

  it('selects only preferred voices, uniformly across matching recordings', () => {
    expect(selectRecording(recordings, () => 0.999, ['marin'])).toEqual(recordings[0]);
    expect(selectRecording(recordings, () => 0, ['cedar'])).toEqual(recordings[1]);
    expect(selectRecording(recordings, () => 0.999, ['marin', 'cedar'])).toEqual(recordings[1]);
  });

  it('falls back to available recordings when preferred voices are absent', () => {
    expect(selectRecording(recordings, () => 0.999, ['missing'])).toEqual(recordings[1]);
    expect(selectRecording(recordings, () => 0, [])).toEqual(recordings[0]);
    const human: AudioAsset = { src: 'speaker.mp3', source: 'recorded' };
    expect(selectRecording([human], () => 0, ['marin'])).toEqual(human);
  });

  it('also supports a single recording, including a human recording', () => {
    const recorded: AudioAsset[] = [{ src: 'audio/speaker.mp3', source: 'recorded' }];
    expect(selectRecording(recorded, () => 0.999)).toEqual(recorded[0]);
    expect(() => selectRecording([])).toThrow(/at least one recording/);
  });
});
