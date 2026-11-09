import { useId } from 'react';
import { badgeArtwork, formatArtwork, suitcaseArtwork, suitcaseViewBox } from '../core/badge-art';
import type { PackBadge } from '../core/pack-badges';

const ink = '#4c087c';
const roundedFont = "ui-rounded, 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif";
const asset = (path: string) => (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/') + path.replace(/^\//, '');

/** Illustrated rank artwork is shared; pack, answer format and level are independent overlays. */
export function PackBadgeMedal({ badge: { pack, level } }: { badge: PackBadge }) {
  const ribbonId = useId();
  const art = badgeArtwork[level.label];
  const { ribbon } = art;
  const waniKani = pack.id.startsWith('ja-wanikani-');
  const travel = pack.id.includes('travel');
  const family = waniKani ? 'WaniKani' : travel ? 'Travel' : pack.title;
  const center = travel ? art.travelCenter ?? art.center : art.center;
  const format = pack.exercise.endsWith('picture') ? 'picture' : 'writing';
  const formatArt = formatArtwork[format];
  const iconHeight = ribbon.iconHeight * (format === 'writing' ? 1.05 : 1);
  const number = pack.sourceLevel ?? /(?:level|nivel)\s*(\d+)/i.exec(pack.title)?.[1];
  const label = number === undefined ? '★' : `L${number}`;
  const iconPosition = (ribbon.iconX - ribbon.left) / (ribbon.right - ribbon.left);
  const iconAngle = Math.atan(2 * ribbon.bow * (1 - 2 * iconPosition) / (ribbon.right - ribbon.left)) * 180 / Math.PI;
  // Fit multi-digit pack levels inside their share of the ribbon.
  const labelWidth = (ribbon.right - ribbon.iconX - ribbon.iconWidth / 2 - 2) * .93;
  const labelSize = Math.min(ribbon.fontSize, labelWidth / (label.length * .68));
  const textStyle = { fill: ink, stroke: 'none', filter: 'none', fontFamily: roundedFont, fontWeight: 900, letterSpacing: '-.04em' } as const;

  return <svg className="pack-badge-medal" data-rank={level.label} data-family={family} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <image className="badge-background" href={asset(travel ? art.travelSrc ?? art.src : art.src)} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>
    <g className="badge-family" data-overlay="family" style={{ stroke: 'none', filter: 'none' }}>
      {travel
        ? <svg className="badge-suitcase-slot" x={center.x - center.width / 2} y={center.y - center.height / 2}
            width={center.width} height={center.height} viewBox={suitcaseViewBox} preserveAspectRatio="xMidYMid meet">
          <image className="badge-suitcase" href={asset(suitcaseArtwork)} width="1254" height="1254"/>
        </svg>
        : <text className={waniKani ? 'badge-wk' : 'badge-family-monogram'} x={center.x} y={center.y} textAnchor="middle" dominantBaseline="central"
            style={{ ...textStyle, fontSize: Math.min(center.width * .6, center.height * .86) }}>{waniKani ? 'WK' : pack.title.split(' ')[0]!.slice(0, 2).toUpperCase()}</text>}
    </g>
    <defs><path id={ribbonId} d={`M${ribbon.left} ${ribbon.baseline}Q${(ribbon.left + ribbon.right) / 2} ${ribbon.baseline + ribbon.bow} ${ribbon.right} ${ribbon.baseline}`}/></defs>
    <g className="badge-format" data-overlay="format" data-format={format}
      transform={`rotate(${iconAngle} ${ribbon.iconX} ${ribbon.iconY})`} style={{ stroke: 'none', filter: 'none' }}>
      <svg className="badge-format-slot" x={ribbon.iconX - ribbon.iconWidth / 2} y={ribbon.iconY - iconHeight / 2}
        width={ribbon.iconWidth} height={iconHeight} viewBox={formatArt.viewBox} preserveAspectRatio="xMidYMid meet">
        <image className="badge-format-artwork" href={asset(formatArt.src)} width={formatArt.width} height={formatArt.height}/>
      </svg>
    </g>
    <text className="badge-number" data-overlay="level" style={{ ...textStyle, fontSize: labelSize }}>
      <textPath href={`#${ribbonId}`} startOffset={ribbon.labelOffset} textAnchor="middle">{label}</textPath>
    </text>
  </svg>;
}
