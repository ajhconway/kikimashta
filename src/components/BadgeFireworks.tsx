import { useId, type CSSProperties } from 'react';
import './BadgeFireworks.css';

interface Burst { x: number; y: number; scale: number; delay: number; duration: number; rays: number }
const upgradeBursts: readonly Burst[] = [
  { x: 0, y: 0, scale: 1, delay: 1080, duration: 1650, rays: 28 },
  { x: 58, y: -62, scale: .74, delay: 1480, duration: 1650, rays: 24 },
  { x: 82, y: 38, scale: .8, delay: 1880, duration: 1650, rays: 28 },
  { x: 10, y: 78, scale: .66, delay: 2260, duration: 1450, rays: 24 },
  { x: 62, y: -12, scale: .95, delay: 2600, duration: 1450, rays: 32 },
];
const awardBursts: readonly Burst[] = [{ x: 0, y: 0, scale: .72, delay: 120, duration: 1500, rays: 18 }];
const colors = ['#ff459a', '#8132dc', '#ffc331', '#fff4d2', '#d86cff'];
const star = 'M0-7 2-2 7 0 2 2 0 7-2 2-7 0-2-2Z';

/** Decorative, finite SVG fireworks; the parent owns location and celebration lifetime. */
export function BadgeFireworks({ kind }: { kind: 'award' | 'upgrade' }) {
  const glowId = useId();
  const bursts = kind === 'upgrade' ? upgradeBursts : awardBursts;
  return <svg className={`badge-fireworks badge-fireworks-${kind}`} data-kind={kind} viewBox="-160 -160 320 320" aria-hidden="true" focusable="false">
    <defs><radialGradient id={glowId}>
      <stop offset="0" stopColor="#fff9dd" stopOpacity=".98"/>
      <stop offset=".32" stopColor="#ffe4a1" stopOpacity=".8"/>
      <stop offset=".7" stopColor="#f592d3" stopOpacity=".3"/>
      <stop offset="1" stopColor="#f592d3" stopOpacity="0"/>
    </radialGradient></defs>
    {bursts.map((burst, burstIndex) => <g key={burstIndex} data-burst={burstIndex}
      style={{ '--burst-delay': `${burst.delay}ms`, '--burst-duration': `${burst.duration}ms`, '--rocket-delay': `${Math.max(0, burst.delay - 300)}ms` } as CSSProperties}>
      {kind === 'upgrade' && <path className="firework-rocket" d={`M${burst.x - 18} ${burst.y + 105} Q${burst.x + 12} ${burst.y + 48} ${burst.x} ${burst.y}`}
        pathLength="1" fill="none" stroke={colors[burstIndex % colors.length]} strokeWidth="3.5" strokeLinecap="round"/>}
      <g transform={`translate(${burst.x} ${burst.y}) scale(${burst.scale})`}>
        <circle className="firework-flash" r="68" fill={`url(#${glowId})`}/>
        <circle className="firework-ring firework-ring-outer" r="52"/>
        <circle className="firework-ring firework-ring-inner" r="34"/>
        <g className="firework-burst">
          {Array.from({ length: burst.rays }, (_, index) => {
            const reach = 76 + index % 4 * 10;
            const bend = index % 2 ? 5 : -5;
            const trail = `M0 ${-reach * .28} Q${bend} ${-reach * .62} 0 ${-reach}`;
            return <g className="firework-ray" key={index} transform={`rotate(${index * 360 / burst.rays + burstIndex * 9})`}>
              <path className="firework-ray-shadow" d={trail}/>
              <path className="firework-ray-color" d={trail} stroke={colors[(index + burstIndex) % colors.length]}/>
              <circle className="firework-ember" cy={-reach} r={index % 3 === 0 ? 3.6 : 2.3}/>
              {index % 4 === 0 && <path className="firework-star" d={star} transform={`translate(0 ${-reach + 3}) scale(${index % 8 ? .8 : 1.15})`}/>}
            </g>;
          })}
          <path className="firework-center-star" d={star} transform="scale(1.8)"/>
        </g>
      </g>
    </g>)}
  </svg>;
}
