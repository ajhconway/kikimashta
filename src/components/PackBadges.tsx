import type { CSSProperties } from 'react';
import type { PackBadge } from '../core/pack-badges';
import { PackBadgeMedal } from './PackBadgeMedal';
import './PackBadges.css';

export function PackBadges({ badges }: { badges: readonly PackBadge[] }) {
  if (!badges.length) return null;
  return <section className="pack-badges" aria-label="Pack mastery badges">
    <ul>{badges.map(({ pack, level, cardCount }, index) => {
      const angle = (-90 + index * 360 / badges.length + (index % 3 - 1) * 2) * Math.PI / 180;
      const right = Math.cos(angle) > 0;
      return <li key={pack.id} className={'pack-badge badge-' + level.label.toLowerCase() + (right ? ' badge-right' : '') + (Math.abs(Math.cos(angle)) < .35 ? ' badge-center' : '')}
        tabIndex={0} aria-label={`${pack.title}: ${level.label} minimum mastery`}
        title={`${pack.title} · ${level.label} minimum · ${cardCount} cards`}
        style={{ left: `${50 + Math.cos(angle) * 40}%`, top: `${50 + Math.sin(angle) * 46}%`,
          '--badge-duration': `${7 + index % 4}s`, '--badge-delay': `${-index * 1.7}s` } as CSSProperties}>
        <PackBadgeMedal badge={{ pack, level, cardCount }}/>
      </li>;
    })}</ul>
  </section>;
}
