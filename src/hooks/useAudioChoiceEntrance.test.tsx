import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAudioChoiceEntrance } from './useAudioChoiceEntrance';

function Harness({ id = 'one', enabled = true }) {
  const audio = useRef<HTMLAudioElement>(null), grid = useRef<HTMLDivElement>(null);
  const ready = useAudioChoiceEntrance({ id, enabled, audio, grid });
  return <><audio ref={audio}/><div ref={grid}><div className="choice-slot"/><div className="choice-slot"/></div><button disabled={!ready}>Answer</button></>;
}
afterEach(() => vi.useRealTimers());
it('hides choices until the audio tail, tracks stalls, lands at the end, and keeps them on replay', () => {
  vi.useFakeTimers();
  const { container, rerender } = render(<Harness/>);
  const audio = container.querySelector('audio')!, grid = container.querySelector('div')!;
  Object.defineProperty(audio, 'duration', { configurable: true, value: 2 });
  expect(grid).not.toBeVisible();
  expect(screen.getByRole('button')).toBeDisabled();
  audio.currentTime = 1.82;
  act(() => vi.advanceTimersByTime(20));
  expect(grid).toBeVisible();
  const slot = grid.firstElementChild as HTMLElement;
  const position = slot.style.transform;
  expect(position).toContain('-13.');
  act(() => vi.advanceTimersByTime(500));
  expect(slot.style.transform).toBe(position);
  audio.currentTime = 2;
  fireEvent.ended(audio);
  expect(slot.style.transform).toBe('');
  expect(screen.getByRole('button')).toBeEnabled();
  audio.currentTime = 0;
  fireEvent.play(audio);
  act(() => vi.advanceTimersByTime(100));
  expect(grid).toBeVisible();
  rerender(<Harness id="two"/>);
  expect(grid).not.toBeVisible();
  expect(screen.getByRole('button')).toBeDisabled();
});
it('reveals short clips at their endpoint and cleans up on exit', () => {
  vi.useFakeTimers();
  const { container, rerender } = render(<Harness/>);
  const audio = container.querySelector('audio')!;
  Object.defineProperty(audio, 'duration', { configurable: true, value: .15 });
  audio.currentTime = .1;
  act(() => vi.advanceTimersByTime(20));
  expect(container.querySelector('div')).toBeVisible();
  fireEvent.ended(audio);
  expect(screen.getByRole('button')).toBeEnabled();
  rerender(<Harness enabled={false}/>);
  expect(vi.getTimerCount()).toBe(0);
});
it('uses no movement with reduced motion and reveals only at the audio endpoint', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  try {
    const { container } = render(<Harness/>);
    const audio = container.querySelector('audio')!;
    Object.defineProperty(audio, 'duration', { configurable: true, value: .2 });
    audio.currentTime = .19;
    act(() => vi.advanceTimersByTime(20));
    expect(container.querySelector('div')).not.toBeVisible();
    fireEvent.ended(audio);
    expect(container.querySelector('div')).toBeVisible();
    expect((container.querySelector('.choice-slot') as HTMLElement).style.transform).toBe('');
  } finally { vi.unstubAllGlobals(); }
});
