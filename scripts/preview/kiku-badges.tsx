/** Issue #205: isolated earned-badge presentation demo; no progress storage. */
import { useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { PackBadges } from '../../src/components/PackBadges';
import { HomeIntensity } from '../../src/components/PaceControl';
import { masteryLevels } from '../../src/core/mastery';
import { usePackBadgePresentation } from '../../src/hooks/usePackBadgePresentation';
import { DENSITY_LEVELS } from '../../src/core/density';
import { intensityColors } from '../../src/themes';
import type { PackBadge } from '../../src/core/pack-badges';
import '../../src/styles.css';
import './kiku-badges.css';

const earnedLevels = masteryLevels.slice(2);
interface Settings { family: string; rank: string; count: number }
const defaults: Settings = { family: 'mixed', rank: 'mixed', count: 6 };
function sampleBadge(index: number, family: string, level: PackBadge['level']): PackBadge {
  const suitcase = family === 'travel' || family === 'mixed' && index % 2 === 1;
  const writing = Math.floor(index / 2) % 2 === 1;
  const packLevel = Math.floor(index / 2) + 1;
  return { pack: {
    id: `${suitcase ? 'es-419-travel' : 'ja-wanikani'}-${packLevel}-${writing ? 'writing' : 'pictures'}-${index}`,
    title: `${suitcase ? 'Travel' : 'WaniKani'} level ${packLevel} · ${writing ? 'Writing' : 'Pictures'}`,
    sourceLevel: packLevel, language: suitcase ? 'es-419' : 'ja-JP', badgeFamily: suitcase ? 'suitcase' : 'wanikani',
    exercise: writing ? 'audio-text' : 'audio-picture', itemIds: [],
  }, level, cardCount: 12 };
}
const samples = (settings: Settings) => Array.from({ length: settings.count }, (_, index) => sampleBadge(index, settings.family,
  settings.rank === 'mixed' ? earnedLevels[index % earnedLevels.length]! : earnedLevels.find(level => level.label === settings.rank)!));

function KikuBadgeDemo() {
  const [settings, setSettings] = useState(defaults);
  const [badges, setBadges] = useState(() => samples(defaults));
  const [scope, setScope] = useState({});
  const [upgradeId, setUpgradeId] = useState('');
  const [mood, setMood] = useState('light');
  const stage = useRef<HTMLDivElement>(null);
  const presentation = usePackBadgePresentation({ badges, active: true, scope });
  const density = DENSITY_LEVELS.find(level => level.id === mood)!;
  const upgradable = badges.filter(badge => badge.level.label !== 'Mastered');
  const selected = upgradable.find(badge => badge.pack.id === upgradeId) ?? upgradable[0];
  const busy = presentation.phase !== 'idle';
  function configure(next: Settings) {
    setSettings(next); setBadges(samples(next)); setScope({}); setUpgradeId('');
  }
  function earnBadge() {
    setBadges(current => [...current, sampleBadge(current.length, settings.family, earnedLevels[0]!)]);
    setSettings(current => ({ ...current, count: current.count + 1 }));
    stage.current?.scrollIntoView({ block: 'center' });
  }
  function upgradeBadge() {
    if (!selected) return;
    setBadges(current => current.map(badge => badge.pack.id === selected.pack.id
      ? { ...badge, level: earnedLevels[earnedLevels.indexOf(badge.level) + 1]! } : badge));
    stage.current?.scrollIntoView({ block: 'center' });
  }
  return <div className="kiku-badge-demo" style={{ '--screen-background': intensityColors[density.id], background: intensityColors[density.id] } as CSSProperties}>
    <div className="app app-home">
      <header><a href="../layers/index.html">Badge designs</a><span className="demo-tag">Home preview</span></header>
      <main><section className="home">
        <h1>kikimashta</h1>
        <div ref={stage} className={'home-kiku-stage' + (badges.length || presentation.entries.length ? ' has-pack-badges' : '')}>
          <HomeIntensity value={density.threshold}/>
          <PackBadges badges={badges} presentation={presentation}/>
        </div>
        <a className="primary start demo-app-link" href="/">Open app <span aria-hidden="true">↗</span></a>
      </section></main>
      <form className="kiku-demo-controls" aria-label="Badge preview controls" onSubmit={event => event.preventDefault()}>
        <label>Mastery<select value={settings.rank} onChange={event => configure({ ...settings, rank: event.target.value })}>
          <option value="mixed">All earned levels</option>{earnedLevels.map(level => <option key={level.label}>{level.label}</option>)}
        </select></label>
        <label>Packs<select value={settings.family} onChange={event => configure({ ...settings, family: event.target.value })}>
          <option value="mixed">WK + Travel</option><option value="wk">WaniKani</option><option value="travel">Travel</option>
        </select></label>
        <label>Badges<select value={settings.count} onChange={event => configure({ ...settings, count: Number(event.target.value) })}>
          {Array.from({ length: 11 }, (_, index) => <option key={index} value={index}>{index}</option>)}
        </select></label>
        <label>Kiku mood<select value={mood} onChange={event => setMood(event.target.value)}>
          {DENSITY_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
        </select></label>
        <div className="demo-celebration-actions">
          <button type="button" onClick={earnBadge} disabled={busy || badges.length >= 10}>Earn a badge</button>
          <label>Badge to upgrade<select value={selected?.pack.id ?? ''} onChange={event => setUpgradeId(event.target.value)} disabled={!selected || busy}>
            {!selected && <option value="">{badges.length ? 'All Mastered' : 'No badges'}</option>}
            {upgradable.map(badge => <option key={badge.pack.id} value={badge.pack.id}>{badge.pack.title} · {badge.level.label}</option>)}
          </select></label>
          <button type="button" onClick={upgradeBadge} disabled={busy || !selected}>Upgrade badge</button>
          <button type="button" onClick={() => configure(defaults)}>Reset preview</button>
        </div>
      </form>
      <p className="demo-badge-phase" role="status">{presentation.phase === 'celebrate' ? 'Celebrating!' : presentation.phase === 'reorder' ? 'Moving into mastery order…' : 'Highest mastery at the top of each side'}</p>
      <p className="kiku-demo-note">Sample badges only. Your learning progress stays unchanged. Earn or upgrade a badge to try its celebration.</p>
    </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<KikuBadgeDemo/>);
