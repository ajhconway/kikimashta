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
afterEach(() => { vi.useRealTimers(); });

describe('qualitative practice pace', () => {
  it('shows only the current qualitative label and an accessible loading placeholder', () => {
    const view = render(<DensityIndicator value={20}/>);
    expect(screen.getByRole('status', { name: 'Review density' }).textContent).toBe('Moderate');
    view.rerender(<DensityIndicator value={null}/>);
    expect(screen.getByRole('status', { name: 'Review density' }).textContent).toBe('…');
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

  it('lets a clicked option select a bound and removes options that would reverse the range', () => {
    const changed = vi.fn();
    render(<Controlled initial={{ min: 'light', max: 'intense' }} changed={changed}/>);
    const min = screen.getByRole('listbox', { name: 'Minimum' });
    fireEvent.click(within(min).getByRole('option', { name: 'High' }));
    expect(changed).toHaveBeenLastCalledWith({ min: 'high', max: 'intense' });
    const max = screen.getByRole('listbox', { name: 'Maximum' });
    expect(within(max).queryByRole('option', { name: 'Moderate' })).not.toBeInTheDocument();
    fireEvent.click(within(max).getByRole('option', { name: 'High' }));
    expect(changed).toHaveBeenLastCalledWith({ min: 'high', max: 'high' });
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
    fireEvent.wheel(min, { deltaY: -64 });
    min.scrollTop = 32;
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
    min.scrollTop = 64;
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
    min.scrollTop = 64;
    fireEvent.scroll(min);
    view.unmount();
    act(() => { vi.advanceTimersByTime(500); });
    expect(changed).not.toHaveBeenCalled();
  });
});
