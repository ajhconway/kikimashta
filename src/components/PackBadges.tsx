import type { CSSProperties } from 'react';
import type { PackBadge } from '../core/pack-badges';
import { BADGE_CELEBRATE_MS, BADGE_REORDER_MS, packBadgePosition, sortPackBadges, type BadgePresentation, type PresentedPackBadge } from '../core/pack-badge-presentation';
import { PackBadgeMedal } from './PackBadgeMedal';
import './PackBadges.css';

export function PackBadges({ badges, presentation }: { badges: readonly PackBadge[]; presentation?: BadgePresentation }) {
  const entries: readonly PresentedPackBadge[] = presentation?.entries ?? sortPackBadges(badges).map((badge, index) => ({ badge, position: packBadgePosition(index, badges.length) }));
  return <>
    <span className="sr-only" role="status" aria-live="polite">{presentation?.announcement ?? ''}</span>
    {entries.length > 0 && <section className="pack-badges" aria-label="Pack mastery badges" data-phase={presentation?.phase ?? 'idle'}
    style={{ '--badge-celebrate-duration': `${BADGE_CELEBRATE_MS}ms`, '--badge-reorder-duration': `${BADGE_REORDER_MS}ms` } as CSSProperties}>
    <ul>{entries.map(entry => {
      const { badge, position, celebration } = entry;
      const { pack, level, cardCount } = badge;
      const right = position.x > .1;
      return <li key={pack.id} data-pack-id={pack.id} data-celebration={celebration?.kind}
        className={'pack-badge badge-' + level.label.toLowerCase() + (right ? ' badge-right' : '') + (Math.abs(position.x) < .1 ? ' badge-center' : '')}
        tabIndex={0} aria-label={`${pack.title}: ${level.label} minimum mastery`}
        title={`${pack.title} · ${level.label} minimum · ${cardCount} cards`}
        style={{ left: `calc(50% + var(--badge-radius) * ${position.x})`, top: `calc(50% + var(--badge-radius) * ${position.y})`, '--badge-pop-shift': Math.abs(position.x) > .9 ? `${position.x > 0 ? -12 : 12}px` : '0px' } as CSSProperties}>
        <span key={celebration?.token ?? level.label} className="badge-presentation-art" aria-hidden="true">
          {celebration?.previous && <span className="badge-previous-art"><PackBadgeMedal badge={celebration.previous}/></span>}
          <span className="badge-current-art"><PackBadgeMedal badge={badge}/></span>
          {celebration && <span className="badge-fireworks" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => {
            const angle = index * Math.PI / 6;
            return <i key={index} style={{ '--spark-x': `${Math.cos(angle) * (position.x < -.5 && Math.cos(angle) < 0 || position.x > .5 && Math.cos(angle) > 0 ? 18 : 70)}px`, '--spark-y': `${Math.sin(angle) * 70}px`, '--spark-delay': `${index % 3 * 35}ms` } as CSSProperties}/>;
          })}</span>}
        </span>
      </li>;
    })}</ul>
  </section>}
  </>;
}
