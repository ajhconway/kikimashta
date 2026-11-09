import { DENSITY_LEVELS, densityLevel, type DensityLevel } from '../core/density';
import './PaceControl.css';

const moodImages: Record<DensityLevel, string> = {
  minimal: 'brand/pace/kiku-minimal-v1.png',
  light: 'brand/kikimashta-cat-v1.png',
  moderate: 'brand/pace/kiku-moderate-v1.png',
  high: 'brand/pace/kiku-high-v1.png',
  intense: 'brand/pace/kiku-intense-v2.png',
};
function KikuMood({ level }: { level: DensityLevel | null }) {
  return <img className="pace-kiku" src={import.meta.env.BASE_URL + moodImages[level || 'minimal']} alt="" aria-hidden="true" draggable={false}/>;
}

export function DensityIndicator({ value }: { value: number | null }) {
  const level = value === null ? null : densityLevel(value);
  return <div className="pace-density" data-density={level || undefined} role="status" aria-label="Review density">{DENSITY_LEVELS.find(candidate => candidate.id === level)?.label || '…'}</div>;
}

export function HomeIntensity({ value }: { value: number | null }) {
  const level = value === null ? null : densityLevel(value);
  return <div className="home-intensity" data-density={level || undefined} role="status" aria-label="Review density">
    <KikuMood level={level}/>
    <span>{DENSITY_LEVELS.find(candidate => candidate.id === level)?.label || '…'}</span>
  </div>;
}
