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

  it('updates review types, selected sample levels, question count and timer policy', () => {
    const { changed } = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Simple contexts · Writing' }));
    expect(changed.mock.calls.at(-1)![0].exercises).toEqual(['audio-picture', 'context-simple-text']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Words · Pictures' }));
    expect(changed.mock.calls.at(-1)![0].exercises).toEqual(['context-simple-text']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear levels' }));
    expect(screen.getByRole('button', { name: 'Start dev review' })).toBeDisabled();
    expect(screen.getByText('Choose at least one mastery level.')).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Strong' }));
    expect(changed.mock.calls.at(-1)![0].masteryLevels).toEqual([5]);
    expect(screen.getByRole('button', { name: 'Start dev review' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Questions'), { target: { value: '12' } });
    expect(changed.mock.calls.at(-1)![0].count).toBe(12);
    fireEvent.change(screen.getByLabelText('Timer behavior'), { target: { value: 'untimed' } });
    expect(changed.mock.calls.at(-1)![0].timerMode).toBe('untimed');
    fireEvent.click(screen.getByRole('button', { name: 'All levels' }));
    expect(changed.mock.calls.at(-1)![0].masteryLevels).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(screen.getByRole('checkbox', { name: 'Confident' })).toHaveAccessibleDescription('1.5s timer');
  });

  it('requires a selected available type even when unavailable type IDs are selected', () => {
    const { started } = setup({ value: { ...defaultDevReviewOptions, exercises: ['audio-text'] } });
    expect(screen.getByText('Choose at least one review type.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start dev review' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Start dev review' }).closest('form')!);
    expect(started).not.toHaveBeenCalled();
  });

  it('shows an empty-content explanation with the language-specific library link', () => {
    setup({ availableTypes: [], libraryHref: '/vocabulary/?language=es-419' });
    expect(screen.getByText(/No review types are available/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Card library' })).toHaveAttribute('href', '/vocabulary/?language=es-419');
    expect(screen.getByRole('button', { name: 'Start dev review' })).toBeDisabled();
  });

  it('blocks editing and starting while disabled and reports a supplied start error', () => {
    const { rerender, started } = setup({ disabled: true });
    expect(screen.getByRole('checkbox', { name: 'Words · Pictures' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Questions' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start dev review' })).toBeDisabled();
    rerender(<DevReviewOptions availableTypes={types} value={defaultDevReviewOptions} libraryHref="/vocabulary/"
      onChange={vi.fn()} onStart={started} error="These questions could not be prepared. Try another selection."/>);
    expect(screen.getByRole('alert')).toHaveTextContent('These questions could not be prepared. Try another selection.');
    expect(screen.getByRole('button', { name: 'Start dev review' })).toBeDisabled();
  });
});
