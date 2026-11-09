import type { CSSProperties } from 'react';
import type { PackBadge } from '../core/pack-badges';
import { BADGE_CELEBRATE_MS, BADGE_UPGRADE_FADE_MS, BADGE_UPGRADE_REVEAL_MS, BADGE_REORDER_MS, layoutPackBadges, type BadgePresentation, type PresentedPackBadge } from '../core/pack-badge-presentation';
import { BadgeFireworks } from './BadgeFireworks';
import { PackBadgeMedal } from './PackBadgeMedal';
import './PackBadges.css';

export function PackBadges({ badges, presentation }: { badges: readonly PackBadge[]; presentation?: BadgePresentation }) {
  const entries: readonly PresentedPackBadge[] = presentation?.entries ?? layoutPackBadges(badges);
  // Moving a DOM node cancels its CSS transition. Visual order belongs to the orbit coordinates.
  const stableEntries = [...entries].sort((a, b) => a.badge.pack.id < b.badge.pack.id ? -1 : a.badge.pack.id > b.badge.pack.id ? 1 : 0);
  return <>
    <span className="sr-only" role="status" aria-live="polite">{presentation?.announcement ?? ''}</span>
    {entries.length > 0 && <section className="pack-badges" aria-label="Pack mastery badges" data-phase={presentation?.phase ?? 'idle'}
    style={{ '--badge-celebrate-duration': `${BADGE_CELEBRATE_MS}ms`, '--badge-upgrade-fade': `${BADGE_UPGRADE_FADE_MS}ms`, '--badge-upgrade-reveal-delay': `${BADGE_UPGRADE_REVEAL_MS}ms`, '--badge-reorder-duration': `${BADGE_REORDER_MS}ms` } as CSSProperties}>
    <ul>{stableEntries.map(entry => {
      const { badge, position, angle: orbitAngle, celebration } = entry;
      const { pack, level, cardCount } = badge;
      const right = position.x > .1;
      return <li key={pack.id} data-pack-id={pack.id} data-celebration={celebration?.kind} data-side={entry.side}
        className={'pack-badge badge-' + level.label.toLowerCase() + (right ? ' badge-right' : '') + (Math.abs(position.x) < .1 ? ' badge-center' : '')}
        tabIndex={0} aria-label={`${pack.title}: ${level.label} minimum mastery`}
        title={`${pack.title} · ${level.label} minimum · ${cardCount} cards`}
        style={{ '--badge-angle': `${orbitAngle}deg`, '--badge-pop-shift': Math.abs(position.x) > .9 ? `${position.x > 0 ? -10 : 10}px` : '0px' } as CSSProperties}>
        <span key={celebration?.token ?? level.label} className="badge-presentation-art" aria-hidden="true">
          {celebration?.previous && <span className="badge-previous-art"><PackBadgeMedal badge={celebration.previous}/></span>}
          <span className="badge-current-art"><PackBadgeMedal badge={badge}/></span>
        </span>
      </li>;
    })}</ul>
    <span className="badge-effects" aria-hidden="true"><span className="badge-effects-plane">
      {entries.filter(entry => entry.celebration).map(entry => <span key={entry.celebration!.token} className="badge-effect-anchor" data-effect-pack-id={entry.badge.pack.id}
        style={{ '--badge-angle': `${entry.angle}deg`, '--firework-inward': entry.side === 'left' ? 1 : -1 } as CSSProperties}>
        <BadgeFireworks kind={entry.celebration!.kind}/>
      </span>)}
    </span></span>
  </section>}
  </>;
}
