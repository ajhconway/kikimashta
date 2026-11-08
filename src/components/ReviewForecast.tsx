import { useId } from 'react';
import type { DensityForecast } from '../core/density';
import './ReviewForecast.css';

export interface ReviewForecastProps {
  forecast: DensityForecast | null;
  at: number;
  loading: boolean;
  unavailable: boolean;
}

const dayMs = 24 * 60 * 60 * 1000;
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const fullDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const roundedCount = (count: number) => count > 0 && count < 1 ? '<1' : String(Math.round(count));

/** Seven daily estimates from the same current-card snapshot as Home intensity. (#156) */
export function ReviewForecast({ forecast, at, loading, unavailable }: ReviewForecastProps) {
  const id = useId();
  const ready = !loading && !unavailable && forecast !== null;
  const daily = ready ? Array.from({ length: 7 }, (_, index) => {
    const count = forecast.daily[index] ?? 0;
    return Number.isFinite(count) ? Math.max(0, count) : 0;
  }) : [];
  const maximum = Math.max(1, ...daily);
  const empty = ready && daily.every(count => count === 0);

  return <section className="review-forecast" aria-labelledby={`${id}-heading`} aria-busy={loading || undefined}>
    <h2 id={`${id}-heading`}>Review forecast</h2>
    {ready ? <>
      <ol className="review-forecast-days" role="list" aria-label="Estimated daily reviews">
        {daily.map((count, index) => {
          const date = new Date(at + index * dayMs);
          const label = index === 0 ? 'Today' : weekday.format(date);
          const displayed = roundedCount(count);
          const accessibleCount = displayed === '<1' ? 'less than 1' : displayed;
          const description = `${index === 0 ? 'Today, ' : ''}${fullDate.format(date)}: ${accessibleCount} estimated ${displayed === '1' || displayed === '<1' ? 'review' : 'reviews'}`;
          return <li key={index} aria-label={description}>
            <span className="review-forecast-count" aria-hidden="true">{displayed}</span>
            <span className="review-forecast-track" aria-hidden="true"><span className={'review-forecast-bar' + (count === 0 ? ' is-zero' : '')} style={{ height: `${count === 0 ? 3 : Math.max(6, count / maximum * 36)}px` }}/></span>
            <time dateTime={date.toISOString()} aria-hidden="true">{label}</time>
          </li>;
        })}
      </ol>
      <p className="review-forecast-empty" aria-live="polite">{empty ? 'No reviews expected this week.' : ''}</p>
    </> : <p className="review-forecast-state" aria-live="polite">{loading ? 'Loading review forecast…' : 'Review forecast unavailable.'}</p>}
  </section>;
}
