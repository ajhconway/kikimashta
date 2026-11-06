import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DensityRange } from '../core/density';
import { DensityIndicator, PaceControl } from './PaceControl';

function Controlled({ initial = { min: 'light', max: 'moderate' }, changed = () => {} }: {
  initial?: DensityRange;
  changed?: (range: DensityRange) => void;
}) {
  const [range, setRange] = useState(initial);
  return <PaceControl value={8} range={range} onChange={next => { setRange(next); changed(next); }}/>;
}
function selected(wheel: HTMLElement) { return within(wheel).getByRole('option', { selected: true }); }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('qualitative practice pace', () => {
  it('shows only the current qualitative label and an accessible loading placeholder', () => {
    const view = render(<DensityIndicator value={20}/>);
    expect(screen.getByRole('status', { name: 'Review density' }).textContent).toBe('Moderate');
    view.rerender(<DensityIndicator value={null}/>);
    expect(screen.getByRole('status', { name: 'Review density' }).textContent).toBe('…');
  });

  it('keeps every level paired with its own Kiku image while selection changes', () => {
    render(<Controlled initial={{ min: 'minimal', max: 'intense' }}/>);
    const min = screen.getByRole('listbox', { name: 'Minimum' });
    const expected = [
      ['Minimal', 'minimal', '/brand/kikimashta-cat-v1.png'],
      ['Light', 'light', '/brand/pace/kiku-light-v1.png'],
      ['Moderate', 'moderate', '/brand/pace/kiku-moderate-v1.png'],
      ['High', 'high', '/brand/pace/kiku-high-v1.png'],
      ['Intense', 'intense', '/brand/pace/kiku-intense-v1.png'],
    ];
    const assertChoices = () => {
      for (const [label, level, image] of expected) {
        const choice = within(min).getByRole('option', { name: label });
        expect(choice).toHaveAttribute('data-density', level);
        expect(choice.querySelector('img')).toHaveAttribute('src', image);
      }
    };
    assertChoices();
    fireEvent.keyDown(min, { key: 'End' });
    expect(selected(min)).toHaveTextContent('Intense');
    assertChoices();
    expect(screen.getByRole('status', { name: 'Review density' }).querySelector('img')).toHaveAttribute('src', '/brand/pace/kiku-light-v1.png');
  });

  it('supports keyboard selection with equal bounds while preventing minimum from exceeding maximum', () => {
    const changed = vi.fn();
    render(<Controlled changed={changed}/>);
    const min = screen.getByRole('listbox', { name: 'Minimum' });
    const max = screen.getByRole('listbox', { name: 'Maximum' });
    min.focus();
    fireEvent.keyDown(min, { key: 'ArrowDown' });
    expect(selected(min)).toHaveTextContent('Moderate');
    expect(selected(max)).toHaveTextContent('Moderate');
    expect(changed).toHaveBeenLastCalledWith({ min: 'moderate', max: 'moderate' });
    expect(min).toHaveAttribute('aria-activedescendant', selected(min).id);
    fireEvent.keyDown(min, { key: 'End' });
    fireEvent.keyDown(min, { key: 'ArrowDown' });
    expect(changed).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(max, { key: 'Home' });
    expect(selected(max)).toHaveTextContent('Moderate');
    fireEvent.keyDown(max, { key: 'End' });
    expect(selected(max)).toHaveTextContent('Intense');
    fireEvent.keyDown(min, { key: 'Home' });
    expect(selected(min)).toHaveTextContent('Minimal');
    expect(changed).toHaveBeenLastCalledWith({ min: 'minimal', max: 'intense' });
  });

  it('keeps invalid choices disabled in place and enables them when the other bound allows them', () => {
    const changed = vi.fn();
    render(<Controlled initial={{ min: 'light', max: 'intense' }} changed={changed}/>);
    const min = screen.getByRole('listbox', { name: 'Minimum' });
    fireEvent.click(within(min).getByRole('option', { name: 'High' }));
    expect(changed).toHaveBeenLastCalledWith({ min: 'high', max: 'intense' });
    const max = screen.getByRole('listbox', { name: 'Maximum' });
    const moderate = within(max).getByRole('option', { name: 'Moderate' });
    expect(within(min).getAllByRole('option')).toHaveLength(5);
    expect(within(max).getAllByRole('option')).toHaveLength(5);
    expect(moderate).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(moderate);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(selected(max)).toHaveTextContent('Intense');
    fireEvent.click(within(max).getByRole('option', { name: 'High' }));
    expect(changed).toHaveBeenLastCalledWith({ min: 'high', max: 'high' });
    const intense = within(min).getByRole('option', { name: 'Intense' });
    expect(intense).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(intense);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(selected(min)).toHaveTextContent('High');
    fireEvent.click(within(min).getByRole('option', { name: 'Moderate' }));
    expect(within(max).getByRole('option', { name: 'Moderate' })).toBe(moderate);
    expect(moderate).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(moderate);
    expect(changed).toHaveBeenLastCalledWith({ min: 'moderate', max: 'moderate' });
  });

  it('glides back from disabled choices before committing the nearest valid bound in either wheel', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    render(<Controlled changed={changed}/>);
    const min = screen.getByRole('listbox', { name: 'Minimum' });
    const max = screen.getByRole('listbox', { name: 'Maximum' });
    fireEvent.wheel(min, { deltaY: 1000 });
    min.scrollTop = 480;
    fireEvent.scroll(min);
    act(() => { vi.advanceTimersByTime(120); });
    expect(changed).not.toHaveBeenCalled();
    expect(min.scrollTop).toBe(480);
    act(() => { vi.advanceTimersByTime(80); });
    expect(min.scrollTop).toBeLessThan(480);
    expect(min.scrollTop).toBeGreaterThan(240);
    expect(changed).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(160); });
    expect(selected(min)).toHaveTextContent('Moderate');
    expect(min.scrollTop).toBe(240);
    expect(changed).toHaveBeenCalledExactlyOnceWith({ min: 'moderate', max: 'moderate' });
    fireEvent.wheel(max, { deltaY: -1000 });
    max.scrollTop = 0;
    fireEvent.scroll(max);
    act(() => { vi.advanceTimersByTime(360); });
    expect(selected(max)).toHaveTextContent('Moderate');
    expect(max.scrollTop).toBe(240);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('lets a new touch interrupt the rebound without committing its stale choice', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    render(<Controlled changed={changed}/>);
    const min = screen.getByRole('listbox', { name: 'Minimum' });
    fireEvent.wheel(min, { deltaY: 1000 });
    min.scrollTop = 480;
    fireEvent.scroll(min);
    act(() => { vi.advanceTimersByTime(216); });
    expect(min.scrollTop).toBeLessThan(480);
    fireEvent.touchStart(min);
    min.scrollTop = 0;
    fireEvent.scroll(min);
    act(() => { vi.advanceTimersByTime(500); });
    expect(changed).not.toHaveBeenCalled();
    expect(min.scrollTop).toBe(0);
    fireEvent.touchEnd(min);
    act(() => { vi.advanceTimersByTime(620); });
    expect(changed).toHaveBeenCalledExactlyOnceWith({ min: 'minimal', max: 'moderate' });
  });

  it('skips the rebound for reduced motion and cancels it on unmount', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const view = render(<Controlled changed={changed}/>);
    const min = screen.getByRole('listbox', { name: 'Minimum' });
    fireEvent.wheel(min, { deltaY: 1000 });
    min.scrollTop = 480;
    fireEvent.scroll(min);
    act(() => { vi.advanceTimersByTime(216); });
    view.unmount();
    act(() => { vi.advanceTimersByTime(500); });
    expect(changed).not.toHaveBeenCalled();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    render(<Controlled changed={changed}/>);
    const reduced = screen.getByRole('listbox', { name: 'Minimum' });
    fireEvent.wheel(reduced, { deltaY: 1000 });
    reduced.scrollTop = 480;
    fireEvent.scroll(reduced);
    act(() => { vi.advanceTimersByTime(120); });
    expect(reduced.scrollTop).toBe(240);
    expect(changed).toHaveBeenCalledExactlyOnceWith({ min: 'moderate', max: 'moderate' });
  });

  it('preserves restored bounds through programmatic scroll events and emits once after user scrolling settles', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    render(<Controlled initial={{ min: 'high', max: 'intense' }} changed={changed}/>);
    const min = screen.getByRole('listbox', { name: 'Minimum' });
    expect(selected(min)).toHaveTextContent('High');
    fireEvent.scroll(min);
    act(() => { vi.advanceTimersByTime(500); });
    expect(changed).not.toHaveBeenCalled();
    fireEvent.wheel(min, { deltaY: -240 });
    min.scrollTop = 120;
    fireEvent.scroll(min);
    act(() => { vi.advanceTimersByTime(119); });
    expect(changed).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(selected(min)).toHaveTextContent('Light');
    expect(changed).toHaveBeenCalledExactlyOnceWith({ min: 'light', max: 'intense' });
    // The controlled update recenters the wheel, which can emit another native
    // scroll. It must not become a second user action or reset the saved value.
    fireEvent.scroll(min);
    act(() => { vi.advanceTimersByTime(500); });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('keeps a touch drag active through a long pause and commits only after release', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    render(<Controlled changed={changed}/>);
    const min = screen.getByRole('listbox', { name: 'Minimum' });
    fireEvent.touchStart(min);
    min.scrollTop = 0;
    fireEvent.scroll(min);
    act(() => { vi.advanceTimersByTime(500); });
    expect(changed).not.toHaveBeenCalled();
    // Continue the same gesture after holding still beyond the fallback delay.
    min.scrollTop = 240;
    fireEvent.scroll(min);
    act(() => { vi.advanceTimersByTime(500); });
    expect(changed).not.toHaveBeenCalled();
    fireEvent.touchEnd(min);
    act(() => { vi.advanceTimersByTime(120); });
    expect(changed).toHaveBeenCalledExactlyOnceWith({ min: 'moderate', max: 'moderate' });
    expect(selected(min)).toHaveTextContent('Moderate');
  });

  it('cancels an unsettled scroll when the control is removed', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const view = render(<Controlled changed={changed}/>);
    const min = screen.getByRole('listbox', { name: 'Minimum' });
    fireEvent.pointerDown(min);
    min.scrollTop = 240;
    fireEvent.scroll(min);
    view.unmount();
    act(() => { vi.advanceTimersByTime(500); });
    expect(changed).not.toHaveBeenCalled();
  });
});
