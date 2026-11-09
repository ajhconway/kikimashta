import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DensityForecast } from '../core/density';
import { ReviewForecast } from './ReviewForecast';

// Local noon avoids depending on the test runner's timezone or crossing a local date.
const at = new Date(2026, 10, 8, 12).getTime();
const forecast = (daily: number[]): DensityForecast => ({ daily, reviewsPerDay: daily.reduce((sum, count) => sum + count, 0) / 7, horizonDays: 7, scenarios: 32 });

function renderForecast(daily: number[]) {
  return render(<ReviewForecast forecast={forecast(daily)} at={at} loading={false} unavailable={false}/>);
}

describe('Home review forecast (#156)', () => {
  it('presents seven rounded daily estimates with English days and accessible dates', () => {
    renderForecast([3, 1, 2.4, 5.6, 0, 7, 8]);
    expect(screen.getByRole('heading', { name: 'Review forecast', level: 2 })).toBeVisible();
    const list = screen.getByRole('list', { name: 'Estimated daily reviews' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(7);
    expect(rows.map(row => row.querySelector('.review-forecast-count')!.textContent)).toEqual(['3', '1', '2', '6', '0', '7', '8']);
    expect(rows.map(row => row.querySelector('time')!.textContent)).toEqual(['Today', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(rows[0]).toHaveAccessibleName('Today, Sunday, November 8: 3 estimated reviews');
    expect(rows[1]).toHaveAccessibleName('Monday, November 9: 1 estimated review');
    expect(rows[6]).toHaveAccessibleName('Saturday, November 14: 8 estimated reviews');
    expect(rows[1]!.querySelector('time')).toHaveAttribute('datetime', new Date(at + 86_400_000).toISOString());
  });

  it('keeps positive fractions below one visible and rounds larger fractional estimates', () => {
    renderForecast([0.001, 0.25, 0.99, 1.01, 1.49, 1.5, 0]);
    const rows = screen.getAllByRole('listitem');
    expect(rows.map(row => row.querySelector('.review-forecast-count')!.textContent)).toEqual(['<1', '<1', '<1', '1', '1', '2', '0']);
    expect(rows[0]).toHaveAccessibleName('Today, Sunday, November 8: less than 1 estimated review');
    expect(rows[0]!.querySelector('.review-forecast-bar')).not.toHaveClass('is-zero');
    expect(screen.queryByText('No reviews expected this week.')).not.toBeInTheDocument();
  });

  it('shows a complete seven-day zero forecast with an explicit empty-work message', () => {
    renderForecast([0, 0, 0, 0, 0, 0, 0]);
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    expect(screen.getByRole('listitem', { name: 'Today, Sunday, November 8: 0 estimated reviews' })).toBeVisible();
    expect(screen.getByText('No reviews expected this week.')).toBeVisible();
    for (const row of screen.getAllByRole('listitem')) expect(row.querySelector('.review-forecast-bar')).toHaveClass('is-zero');
  });

  it('uses the supplied forecast timestamp when the displayed week changes', () => {
    const { rerender } = renderForecast([1, 0, 0, 0, 0, 0, 0]);
    rerender(<ReviewForecast forecast={forecast([1, 0, 0, 0, 0, 0, 0])} at={at + 86_400_000} loading={false} unavailable={false}/>);
    expect(screen.getByRole('listitem', { name: 'Today, Monday, November 9: 1 estimated review' })).toBeVisible();
    expect(screen.getAllByRole('listitem')[1]!.querySelector('time')).toHaveTextContent('Tue');
  });

  it('shows loading instead of stale forecast numbers, then a distinct unavailable state', () => {
    const stale = forecast([41, 42, 43, 44, 45, 46, 47]);
    const { rerender } = render(<ReviewForecast forecast={stale} at={at} loading unavailable={false}/>);
    expect(screen.getByText('Loading review forecast…')).toBeVisible();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('41')).not.toBeInTheDocument();
    rerender(<ReviewForecast forecast={stale} at={at} loading={false} unavailable/>);
    expect(screen.getByText('Review forecast unavailable.')).toBeVisible();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('41')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading review forecast…')).not.toBeInTheDocument();
    rerender(<ReviewForecast forecast={null} at={at} loading={false} unavailable={false}/>);
    expect(screen.getByText('Review forecast unavailable.')).toBeVisible();
  });
});
