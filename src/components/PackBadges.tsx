import type { CSSProperties } from 'react';
import type { PackBadge } from '../core/pack-badges';
import { PackBadgeMedal } from './PackBadgeMedal';
import './PackBadges.css';

export function PackBadges({ badges }: { badges: readonly PackBadge[] }) {
  if (!badges.length) return null;
  const step = 2 * Math.PI / Math.max(10, badges.length);
  return <section className="pack-badges" aria-label="Pack mastery badges">
    <ul>{badges.map(({ pack, level, cardCount }, index) => {
      const slot = badges.length % 2 === 0
        ? (Math.floor(index / 2) + .5) * (index % 2 ? 1 : -1)
        : index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? -1 : 1);
      const angle = slot * step;
      const horizontal = Math.sin(angle);
      const right = horizontal > .1;
      return <li key={pack.id} className={'pack-badge badge-' + level.label.toLowerCase() + (right ? ' badge-right' : '') + (Math.abs(horizontal) < .1 ? ' badge-center' : '')}
        tabIndex={0} aria-label={`${pack.title}: ${level.label} minimum mastery`}
        title={`${pack.title} · ${level.label} minimum · ${cardCount} cards`}
        style={{ left: `calc(50% + var(--badge-radius) * ${horizontal})`, top: `calc(50% - var(--badge-radius) * ${Math.cos(angle)})` } as CSSProperties}>
        <PackBadgeMedal badge={{ pack, level, cardCount }}/>
      </li>;
    })}</ul>
  </section>;
}
