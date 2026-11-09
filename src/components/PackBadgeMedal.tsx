import type { PackBadge } from '../core/pack-badges';
import type { MasteryLevel } from '../core/mastery';

/** Each rank has its own silhouette, independent of its color. */
const crests: Record<MasteryLevel['label'], string> = {
  New: 'M50 10a33 33 0 1 1 0 66 33 33 0 0 1 0-66Z',
  Learning: 'M50 8C68 8 84 28 82 47 80 67 65 78 50 80 35 78 20 67 18 47 16 28 32 8 50 8Z',
  Improving: 'M50 6 60 12 72 10 78 21 89 27 87 40 94 50 85 60 82 73 69 76 60 85 50 81 40 85 31 76 18 73 15 60 6 50 13 40 11 27 22 21 28 10 40 12Z',
  Familiar: 'M50 6 85 25 85 63 50 83 15 63 15 25Z',
  Steady: 'M17 12Q50 0 83 12V45C83 66 68 79 50 87 32 79 17 66 17 45Z',
  Strong: 'M50 3 63 16 81 13 84 31 97 44 84 57 81 75 63 72 50 85 37 72 19 75 16 57 3 44 16 31 19 13 37 16Z',
  Confident: 'M25 19 16 6 38 15 50 2 62 15 84 6 75 19 87 34 85 60 72 77 50 84 28 77 15 60 13 34Z',
  Mastered: 'M50 5 61 14 75 9 80 23 94 26 89 41 96 53 84 62 82 76 67 77 58 88 50 83 42 88 33 77 18 76 16 62 4 53 11 41 6 26 20 23 25 9 39 14Z',
};

export function PackBadgeMedal({ badge: { pack, level } }: { badge: PackBadge }) {
  const number = pack.sourceLevel ?? /level\s*(\d+)/i.exec(pack.title)?.[1] ?? '★';
  const waniKani = pack.id.startsWith('ja-wanikani-');
  const travel = pack.id.includes('travel');
  const rank = level.label;
  return <svg className="pack-badge-medal" data-rank={rank} data-family={waniKani ? 'WaniKani' : travel ? 'Travel' : pack.title}
    viewBox="0 0 100 124" aria-hidden="true" focusable="false">
    {rank === 'Mastered' && <g className="badge-wings"><path d="M21 28 1 18 4 36 15 46 2 43 8 58 24 63ZM79 28 99 18 96 36 85 46 98 43 92 58 76 63Z"/></g>}
    <path d={crests[rank]} className="badge-disc"/>
    <circle cx="50" cy="44" r="27" className="badge-inlay"/>
    <circle cx="50" cy="44" r="23" className="badge-ring"/>
    {rank === 'New' && <circle cx="50" cy="44" r="31" className="badge-stitch"/>}
    {rank === 'Learning' && <path d="M41 13q-2-9-12-7 0 10 12 7Zm18 0q2-9 12-7 0 10-12 7Z" className="badge-leaves"/>}
    {rank === 'Improving' && <g className="badge-studs">{[20, 50, 80].map((x, i) => <circle key={x} cx={x} cy={i === 1 ? 12 : 26} r="3"/>)}</g>}
    {rank === 'Familiar' && <path d="M25 23 50 10 75 23M25 66 50 79 75 66" className="badge-engraving"/>}
    {rank === 'Steady' && <path d="m25 16 4 5m42-5-4 5M41 76l9 5 9-5" className="badge-engraving"/>}
    {rank === 'Strong' && <g className="badge-studs"><path d="m50 7 3 6-3 6-3-6ZM9 44l6-3 6 3-6 3ZM91 44l-6-3-6 3 6 3Z"/></g>}
    {(rank === 'Confident' || rank === 'Mastered') && <g className="badge-laurel"><path d="M22 62Q7 44 22 28M78 62q15-18 0-34"/><path d="m19 35-7-7 1 12 6 3m-1 3-9-3 5 11 6 1m61-20 7-7-1 12-6 3m1 3 9-3-5 11-6 1"/></g>}
    {rank === 'Mastered' && <path className="badge-crown" d="m31 16-4-13 14 6 9-8 9 8 14-6-4 13Z"/>}
    <g className="badge-family">
      {waniKani ? <>
        <g className="badge-crab"><path d="M33 33q-10-2-9-10m43 10q10-2 9-10M28 26l-5-3 1 7m48-4 5-3-1 7M42 30v-4m16 4v-4"/><ellipse cx="50" cy="35" rx="15" ry="9"/><circle cx="43" cy="26" r="2"/><circle cx="57" cy="26" r="2"/></g>
        <text x="50" y="55" textAnchor="middle">Wani</text><text x="50" y="68" textAnchor="middle">Kani</text>
      </> : travel ? <>
        <g className="badge-suitcase"><rect x="34" y="28" width="32" height="26" rx="5"/><path d="M43 28v-6h14v6M41 29v24m18-24v24"/></g>
        <text x="50" y="68" textAnchor="middle">Travel</text>
      </> : <><path className="badge-suitcase" d="M30 30q10-5 20 0 10-5 20 0v25q-10-5-20 0-10-5-20 0Zm20 0v25"/><text x="50" y="68" textAnchor="middle">{pack.title.split(' ')[0]!.slice(0, 9)}</text></>}
    </g>
    <path d="M12 82H2l6 15-6 16h22V90m64-8h10l-6 15 6 16H76V90" className="badge-ribbon-tails"/>
    <path d="m12 105 12 8v-8m64 0-12 8v-8" className="badge-ribbon-fold"/>
    <path d="M12 79q38 7 76 0v27q-38 7-76 0Z" className="badge-ribbons"/>
    {pack.exercise.endsWith('picture')
      ? <g className="badge-format"><rect x="22" y="87" width="23" height="17" rx="2"/><path d="m24 101 6-7 5 5 4-4 4 6"/><circle cx="39" cy="92" r="1.5"/></g>
      : <g className="badge-format"><path d="m24 104 2-8 14-14 6 6-14 14Z M37 85l6 6 M26 96l6 6"/></g>}
    <text x="64" y="103" textAnchor="middle" className="badge-number">{number === '★' ? '★' : `L${number}`}</text>
  </svg>;
}
