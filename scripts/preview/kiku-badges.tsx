/** Issue #181: isolated visual demo using the actual Home badge and Kiku components. */
import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { PackBadges } from '../../src/components/PackBadges';
import { HomeIntensity } from '../../src/components/PaceControl';
import { masteryLevels } from '../../src/core/mastery';
import { DENSITY_LEVELS } from '../../src/core/density';
import { intensityColors } from '../../src/themes';
import type { PackBadge } from '../../src/core/pack-badges';
import '../../src/styles.css';
import './kiku-badges.css';

const earnedLevels = masteryLevels.slice(2);
function KikuBadgeDemo() {
  const [family, setFamily] = useState('mixed');
  const [rank, setRank] = useState('mixed');
  const [count, setCount] = useState(6);
  const [mood, setMood] = useState('light');
  const density = DENSITY_LEVELS.find(level => level.id === mood)!;
  const badges: PackBadge[] = Array.from({ length: count }, (_, index) => {
    const travel = family === 'travel' || family === 'mixed' && index % 2 === 1;
    const writing = Math.floor(index / 2) % 2 === 1;
    const packLevel = Math.floor(index / 2) + 1;
    return {
      pack: {
        id: `${travel ? 'es-419-travel' : 'ja-wanikani'}-${packLevel}-${writing ? 'writing' : 'pictures'}-${index}`,
        title: `${travel ? 'Travel' : 'WaniKani'} level ${packLevel} · ${writing ? 'Writing' : 'Pictures'}`,
        sourceLevel: packLevel, language: travel ? 'es-419' : 'ja-JP',
        exercise: writing ? 'audio-text' : 'audio-picture', itemIds: [],
      },
      level: rank === 'mixed' ? earnedLevels[index % earnedLevels.length]! : earnedLevels.find(level => level.label === rank)!,
      cardCount: 12,
    };
  });
  return <div className="kiku-badge-demo" style={{ '--screen-background': intensityColors[density.id], background: intensityColors[density.id] } as CSSProperties}>
    <div className="app app-home">
      <header><a href="../layers/index.html">Badge designs</a><span className="demo-tag">Home preview</span></header>
      <main><section className="home">
        <h1>kikimashta</h1>
        <div className="home-kiku-stage has-pack-badges">
          <HomeIntensity value={density.threshold}/>
          <PackBadges badges={badges}/>
        </div>
        <a className="primary start demo-app-link" href="/">Open app <span aria-hidden="true">↗</span></a>
      </section></main>
      <form className="kiku-demo-controls" aria-label="Badge preview controls" onSubmit={event => event.preventDefault()}>
        <label>Mastery<select value={rank} onChange={event => setRank(event.target.value)}>
          <option value="mixed">All earned levels</option>{earnedLevels.map(level => <option key={level.label}>{level.label}</option>)}
        </select></label>
        <label>Packs<select value={family} onChange={event => setFamily(event.target.value)}>
          <option value="mixed">WK + Travel</option><option value="wk">WaniKani</option><option value="travel">Travel</option>
        </select></label>
        <label>Badges<select value={count} onChange={event => setCount(Number(event.target.value))}>
          {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
        </select></label>
        <label>Kiku mood<select value={mood} onChange={event => setMood(event.target.value)}>
          {DENSITY_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
        </select></label>
      </form>
      <p className="kiku-demo-note">Sample badges only. Your learning progress stays unchanged. Tap or focus a badge for its pack and mastery.</p>
    </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<KikuBadgeDemo/>);
