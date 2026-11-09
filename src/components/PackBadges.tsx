import type { PackBadge } from '../core/pack-badges';
import './PackBadges.css';

export function PackBadges({ badges }: { badges: readonly PackBadge[] }) {
  if (!badges.length) return null;
  return <section className="pack-badges" aria-label="Pack mastery badges">
    <h2>Pack badges</h2>
    <p>Every card counts.</p>
    <ul>{badges.map(({ pack, level, cardCount }) => <li key={pack.id} className={'pack-badge badge-' + level.label.toLowerCase()}
      aria-label={`${pack.title}: ${level.label} minimum mastery`} title={`All ${cardCount} cards are ${level.label} or higher`}>
      <svg className="pack-badge-medal" viewBox="0 0 80 92" aria-hidden="true" focusable="false">
        <path d="m19 56-5 30 17-8 9 10 9-10 17 8-5-30" className="badge-ribbons"/>
        <circle cx="40" cy="35" r="30" className="badge-disc"/><circle cx="40" cy="35" r="23" className="badge-ring"/>
        <path d="m40 18 5 10 12 2-9 9 2 12-10-6-10 6 2-12-9-9 12-2Z" className="badge-star"/>
      </svg>
      <strong>{level.label}</strong><span>{pack.title}</span>
    </li>)}</ul>
  </section>;
}
