import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultDevReviewOptions, type DevReviewOptions as Options, type DevReviewType } from '../core/dev-review';
import { DevReviewOptions, type DevReviewOptionsProps } from './DevReviewOptions';

const types: DevReviewType[] = [
  { exercise: 'audio-picture', label: 'Words · Pictures', count: 16 },
  { exercise: 'context-simple-text', label: 'Simple contexts · Writing', count: 4 },
];
function setup(props: Partial<DevReviewOptionsProps> = {}) {
  const changed = vi.fn();
  const started = vi.fn();
  function Screen() {
    const [value, setValue] = useState<Options>(props.value ?? { ...defaultDevReviewOptions, exercises: ['audio-picture'] });
    return <DevReviewOptions availableTypes={types} value={value} libraryHref="/vocabulary/" onStart={started}
      {...props} onChange={next => { changed(next); setValue(next); }}/>;
  }
  return { ...render(<Screen/>), changed, started };
}

describe('Dev review options (#152)', () => {
  it('describes simulated practice, exposes available types and starts only on submission', () => {
    const { started } = setup();
    expect(screen.getByRole('heading', { name: 'Dev review options' })).toHaveFocus();
    expect(screen.getByText(/Your saved progress stays unchanged/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Card library' })).toHaveAttribute('href', '/vocabulary/');
    const choices = within(screen.getByRole('group', { name: 'Review types' })).getAllByRole('checkbox');
    expect(choices).toHaveLength(2);
    expect(choices[0]).toHaveAccessibleDescription('16 available');
    expect(screen.queryByRole('checkbox', { name: 'Words · Writing' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start dev review' }));
    expect(started).toHaveBeenCalledOnce();
  });

  it('requires a selected available type even when unavailable type IDs are selected', () => {
    const { started } = setup({ value: { ...defaultDevReviewOptions, exercises: ['audio-text'] } });
    expect(screen.getByText('Choose at least one review type.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start dev review' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Start dev review' }).closest('form')!);
    expect(started).not.toHaveBeenCalled();
  });
});
