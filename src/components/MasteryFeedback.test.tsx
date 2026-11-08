import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MasteryFeedback } from './MasteryFeedback';

function expectNoOldFeedback() {
  expect(screen.queryByText(/got it|try this one/i)).not.toBeInTheDocument();
}

describe('mastery answer feedback (#141)', () => {
  it('stays empty before an answer, including stale change or saving props', () => {
    const { container } = render(<MasteryFeedback outcome={null} change={{ label: 'Strong', direction: 'up' }} saving/>);
    expect(container.firstElementChild).toBeEmptyDOMElement();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/saving/i)).not.toBeInTheDocument();
    expectNoOldFeedback();
  });

  it.each([
    { direction: 'up', label: 'Strong', outcome: 'success', accessible: 'increased', arrow: '↑', announcement: 'Correct answer.' },
    { direction: 'down', label: 'Learning', outcome: 'failure', accessible: 'decreased', arrow: '↓', announcement: 'Incorrect answer. Review the answer and try again.' },
  ] as const)('presents the $direction arrow and new level with one accessible change description', ({ direction, label, outcome, accessible, arrow, announcement }) => {
    const { container } = render(<MasteryFeedback outcome={outcome} change={{ direction, label }}/>);
    const cue = screen.getByRole('img', { name: `Mastery ${accessible} to ${label}` });
    expect(within(cue).getByText(arrow)).toBeVisible();
    expect(screen.queryByText(/^level (up|down)$/i)).not.toBeInTheDocument();
    expect(within(cue).getByText(label)).toBeVisible();
    expect(within(cue).getByText(arrow)).toHaveAttribute('aria-hidden', 'true');
    expect(within(cue).getByText(label).closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(announcement)).toHaveClass('sr-only');
    expect(container.firstElementChild).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText(outcome === 'success' ? '✓' : '↺')).not.toBeInTheDocument();
    expectNoOldFeedback();
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
    expectNoOldFeedback();
  });

  it('announces saving only while an answered question is being saved', () => {
    const { rerender } = render(<MasteryFeedback outcome="partial" saving/>);
    expect(screen.getByText('Saving…')).toHaveClass('sr-only');
    expect(screen.getByText('≈')).toBeVisible();
    rerender(<MasteryFeedback outcome="partial"/>);
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
    expect(screen.getByText('Partial success. Take your time.')).toHaveClass('sr-only');
    expectNoOldFeedback();
  });
});
