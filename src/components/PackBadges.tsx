import type { CSSProperties } from 'react';
import type { PackBadge } from '../core/pack-badges';
import './PackBadges.css';

export function PackBadges({ badges }: { badges: readonly PackBadge[] }) {
  if (!badges.length) return null;
  return <section className="pack-badges" aria-label="Pack mastery badges">
    <ul>{badges.map(({ pack, level, cardCount }, index) => {
      const angle = (-90 + index * 360 / badges.length + (index % 3 - 1) * 2) * Math.PI / 180;
      const right = Math.cos(angle) > 0;
      const packNumber = pack.sourceLevel ?? /level\s*(\d+)/i.exec(pack.title)?.[1] ?? '★';
      return <li key={pack.id} className={'pack-badge badge-' + level.label.toLowerCase() + (right ? ' badge-right' : '') + (Math.abs(Math.cos(angle)) < .35 ? ' badge-center' : '')}
        tabIndex={0} aria-label={`${pack.title}: ${level.label} minimum mastery`}
        title={`${pack.title} · ${level.label} minimum · ${cardCount} cards`}
        style={{ left: `${50 + Math.cos(angle) * 40}%`, top: `${50 + Math.sin(angle) * 46}%`,
          '--badge-duration': `${7 + index % 4}s`, '--badge-delay': `${-index * 1.7}s` } as CSSProperties}>
        <svg className="pack-badge-medal" viewBox="0 0 80 92" aria-hidden="true" focusable="false">
          <path d="m19 56-5 30 17-8 9 10 9-10 17 8-5-30" className="badge-ribbons"/>
          <circle cx="40" cy="35" r="30" className="badge-disc"/><circle cx="40" cy="35" r="23" className="badge-ring"/>
          <text x="40" y="44" textAnchor="middle" className="badge-number">{packNumber}</text>
          {pack.exercise.endsWith('picture')
            ? <g className="badge-format"><rect x="29" y="64" width="22" height="16" rx="2"/><path d="m31 77 6-6 4 4 3-3 5 5"/><circle cx="45" cy="69" r="1"/></g>
            : <g className="badge-format"><path d="m31 78 2-7 12-12 5 5-12 12Z M42 62l5 5 M33 71l5 5"/></g>}
        </svg>
      </li>;
    })}</ul>
  </section>;
}
