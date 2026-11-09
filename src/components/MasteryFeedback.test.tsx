import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MasteryFeedback } from './MasteryFeedback';

describe('mastery answer feedback (#141)', () => {
  it('stays empty before an answer, including stale change or saving props', () => {
    const { container } = render(<MasteryFeedback outcome={null} change={{ label: 'Strong', direction: 'up' }} saving/>);
    expect(container.firstElementChild).toBeEmptyDOMElement();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/saving/i)).not.toBeInTheDocument();
  });

  it.each([
    { direction: 'up', label: 'Strong', outcome: 'success', accessible: 'increased', arrow: '↑', announcement: 'Correct answer.' },
    { direction: 'down', label: 'Learning', outcome: 'failure', accessible: 'decreased', arrow: '↓', announcement: 'Incorrect answer. Review the answer and try again.' },
  ] as const)('presents the $direction arrow and new level with one accessible change description', ({ direction, label, outcome, accessible, arrow, announcement }) => {
    const { container } = render(<MasteryFeedback outcome={outcome} change={{ direction, label }}/>);
    const cue = screen.getByRole('img', { name: `Mastery ${accessible} to ${label}` });
    expect(within(cue).getByText(arrow)).toBeVisible();
    expect(within(cue).getByText(label)).toBeVisible();
    expect(within(cue).getByText(arrow)).toHaveAttribute('aria-hidden', 'true');
    expect(within(cue).getByText(label).closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(announcement)).toHaveClass('sr-only');
    expect(container.firstElementChild).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText(outcome === 'success' ? '✓' : '↺')).not.toBeInTheDocument();
  });

  it.each([
    { outcome: 'success', symbol: '✓', announcement: 'Correct answer.' },
    { outcome: 'partial', symbol: '≈', announcement: 'Partial success. Take your time.' },
    { outcome: 'failure', symbol: '↺', announcement: 'Incorrect answer. Review the answer and try again.' },
  ] as const)('shows an outcome cue and screen-reader announcement for unchanged $outcome', ({ outcome, symbol, announcement }) => {
    const { container } = render(<MasteryFeedback outcome={outcome}/>);
    expect(screen.getByText(symbol)).toBeVisible();
    expect(screen.getByText(symbol)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(announcement)).toHaveClass('sr-only');
    expect(container.firstElementChild).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/level|new|learning|improving|familiar|steady|strong|confident|mastered/i)).not.toBeInTheDocument();
  });

  it('announces saving only while an answered question is being saved', () => {
    const { rerender } = render(<MasteryFeedback outcome="partial" saving/>);
    expect(screen.getByText('Saving…')).toHaveClass('sr-only');
    expect(screen.getByText('≈')).toBeVisible();
    rerender(<MasteryFeedback outcome="partial"/>);
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
    expect(screen.getByText('Partial success. Take your time.')).toHaveClass('sr-only');
  });

  it.each([
    { label: 'Learning', timerMs: null, timer: 'Untimed' },
    { label: 'Familiar', timerMs: 10000, timer: '10s' },
    { label: 'Confident', timerMs: 1500, timer: '1.5s' },
  ] as const)('shows $label and $timer in the current-mastery area before an answer', ({ label, timerMs, timer }) => {
    render(<MasteryFeedback outcome={null} current={{ label, timerMs }}/>);
    const current = screen.getByRole('status', { name: 'Current mastery' });
    expect(current).not.toHaveAttribute('aria-hidden');
    expect(current).toHaveClass('question-mastery');
    expect(within(current).getByText(label)).toBeVisible();
    expect(within(current).getByText(label)).toHaveClass('question-mastery-label');
    expect(within(current).getByText(timer)).toBeVisible();
    expect(within(current).getByText(timer)).toHaveClass('question-mastery-timer');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/^[✓≈↺]$/)).not.toBeInTheDocument();
  });

  it('identifies the demo accessibly while keeping its unsaved note screen-reader-only', () => {
    render(<MasteryFeedback outcome={null} current={{ label: 'Strong', timerMs: 3000, demo: true }}/>);
    const current = screen.getByRole('status', { name: 'Demo mastery' });
    expect(within(current).getByText('Strong')).toBeVisible();
    expect(within(current).getByText('3s')).toBeVisible();
    expect(within(current).getByText('Unsaved demo')).toHaveClass('sr-only');
    expect(screen.queryByRole('status', { name: 'Current mastery' })).not.toBeInTheDocument();
  });

  it.each([
    { direction: 'up', label: 'Strong', outcome: 'success', accessible: 'increased' },
    { direction: 'down', label: 'Learning', outcome: 'failure', accessible: 'decreased' },
  ] as const)('hides the previous mastery context under a $direction change badge', ({ direction, label, outcome, accessible }) => {
    const { rerender } = render(<MasteryFeedback outcome={outcome} current={{ label: 'Steady', timerMs: 5000 }} change={{ direction, label }}/>);
    expect(screen.getByRole('img', { name: `Mastery ${accessible} to ${label}` })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Current mastery' })).not.toBeInTheDocument();
    const hidden = screen.getByRole('status', { hidden: true });
    expect(hidden).toHaveAttribute('aria-hidden', 'true');
    expect(within(hidden).getByText('Steady')).toBeInTheDocument();
    expect(within(hidden).getByText('5s')).toBeInTheDocument();
    // The next unanswered question can reuse the slot without retaining hidden state.
    rerender(<MasteryFeedback outcome={null} current={{ label: 'Familiar', timerMs: 10000 }}/>);
    expect(screen.getByRole('status', { name: 'Current mastery' })).not.toHaveAttribute('aria-hidden');
    expect(screen.getByText('Familiar')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it.each([
    { outcome: 'success', symbol: '✓' },
    { outcome: 'partial', symbol: '≈' },
    { outcome: 'failure', symbol: '↺' },
  ] as const)('retains the current level and timer alongside an unchanged $outcome symbol', ({ outcome, symbol }) => {
    render(<MasteryFeedback outcome={outcome} current={{ label: 'Familiar', timerMs: 10000 }}/>);
    const current = screen.getByRole('status', { name: 'Current mastery' });
    expect(current).not.toHaveAttribute('aria-hidden');
    expect(within(current).getByText('Familiar')).toBeVisible();
    expect(within(current).getByText('10s')).toBeVisible();
    expect(within(current).getByText(symbol)).toBeVisible();
    expect(within(current).getByText(symbol)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByText(symbol)).toHaveLength(1);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

});
