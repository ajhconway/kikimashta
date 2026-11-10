import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PackBadges } from './PackBadges';
import { badgeArtwork, suitcaseArtwork } from '../core/badge-art';
import { learningLanguages } from '../core/languages';
import { masteryLevels } from '../core/mastery';
import { cardPacks } from '../core/packs';
import type { PackBadge } from '../core/pack-badges';

const badge: PackBadge = { pack: cardPacks[0]!, level: masteryLevels[2], cardCount: 12 };
it('renders named pack badges and removes the section when no badge is available', () => {
  const view = render(<PackBadges badges={[badge]}/>);
  expect(screen.getByRole('region', { name: 'Pack mastery badges' })).toBeInTheDocument();
  expect(screen.getByRole('listitem')).toHaveAccessibleName(`${cardPacks[0]!.title}: Improving minimum mastery`);
  expect(screen.getByRole('listitem')).toHaveAttribute('title', `${cardPacks[0]!.title} · Improving minimum · 12 cards`);
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  expect(screen.queryByText('Improving')).not.toBeInTheDocument();
  expect(screen.getByRole('listitem')).toHaveAttribute('tabindex', '0');
  view.rerender(<PackBadges badges={[]}/>);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('uses suitcase artwork for every real Spanish pack, including Basic Spanish without travel in its ID', () => {
  const spanish = learningLanguages.find(language => language.id === 'es-419')!;
  const basic = spanish.packs.find(pack => pack.id.includes('basic'))!;
  expect(basic.id).not.toContain('travel');
  expect(cardPacks.every(pack => pack.badgeFamily === 'wanikani')).toBe(true);
  expect(spanish.packs.every(pack => pack.badgeFamily === 'suitcase')).toBe(true);
  const { container } = render(<PackBadges badges={spanish.packs.map(pack => ({ ...badge, pack }))}/>);
  const medals = container.querySelectorAll('.pack-badge-medal');
  expect(medals).toHaveLength(spanish.packs.length);
  medals.forEach(medal => {
    expect(medal).toHaveAttribute('data-family', 'Suitcase');
    expect(medal.querySelector('.badge-background')).toHaveAttribute('href', '/' + badgeArtwork.Improving.travelSrc);
    expect(medal.querySelector('.badge-suitcase')).toHaveAttribute('href', '/' + suitcaseArtwork);
    expect(medal.querySelector('.badge-family')?.textContent).toBe('');
    expect(medal.querySelector('.badge-wk, .badge-family-monogram')).toBeNull();
  });
  expect(screen.getByRole('listitem', { name: `${basic.title}: Improving minimum mastery` })).toBeInTheDocument();
});
