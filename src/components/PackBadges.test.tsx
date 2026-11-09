import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PackBadges } from './PackBadges';
import { PackBadgeMedal } from './PackBadgeMedal';
import { badgeArtwork, formatArtwork, suitcaseArtwork, suitcaseViewBox } from '../core/badge-art';
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

it('uses a distinct illustrated background for every rank and independent accessible overlay content', () => {
  const badges = masteryLevels.map(level => ({ ...badge, level, pack: { ...badge.pack, id: `rank-${level.label}` } }));
  const { container } = render(<PackBadges badges={badges}/>);
  const medals = Array.from(container.querySelectorAll('.pack-badge-medal'));
  expect(medals).toHaveLength(8);
  expect(new Set(medals.map(medal => medal.querySelector('.badge-background')!.getAttribute('href'))).size).toBe(8);
  expect(new Set(Array.from(container.querySelectorAll('textPath'), path => path.getAttribute('href'))).size).toBe(8);
  medals.forEach(medal => {
    const level = masteryLevels.find(level => level.label === medal.getAttribute('data-rank'))!;
    expect(medal).toHaveAttribute('data-family', 'WaniKani');
    expect(medal.querySelector('.badge-background')).toHaveAttribute('href', '/' + badgeArtwork[level.label].src);
    expect(medal.querySelector('.badge-family')).toHaveTextContent('WK');
    expect(medal.querySelector('.badge-number')).toHaveTextContent('L1');
    expect(medal.querySelector('.badge-format-artwork')).toHaveAttribute('href', '/' + formatArtwork.picture.src);
    expect(medal.querySelector('.badge-format-slot')).toHaveAttribute('viewBox', formatArtwork.picture.viewBox);
    expect(medal.querySelector('.badge-format path')).toBeNull();
    expect(medal.querySelector('.badge-format')).toHaveAttribute('data-format', 'picture');
    expect(medal.querySelector('.badge-wk')).toHaveAttribute('dominant-baseline', 'central');
    const link = medal.querySelector('textPath')!.getAttribute('href')!;
    expect(Array.from(medal.querySelectorAll('defs path')).some(path => '#' + path.id === link)).toBe(true);
  });
});

it('selects the flower-free travel artwork and cropped suitcase slot for every rank', () => {
  const { container } = render(<PackBadges badges={masteryLevels.map(level => ({ ...badge, level,
    pack: { ...badge.pack, badgeFamily: 'suitcase', id: `es-419-travel-${level.label}-pictures`, title: 'Travel level 1' },
  }))}/>);
  container.querySelectorAll('.pack-badge-medal').forEach(medal => {
    const level = masteryLevels.find(level => level.label === medal.getAttribute('data-rank'))!;
    const art = badgeArtwork[level.label];
    const center = art.travelCenter ?? art.center;
    expect(medal.querySelector('.badge-background')).toHaveAttribute('href', '/' + (art.travelSrc ?? art.src));
    if (art.travelSrc) expect(medal.querySelector('.badge-background')).not.toHaveAttribute('href', '/' + art.src);
    expect(medal.querySelector('.badge-suitcase')).toHaveAttribute('href', '/' + suitcaseArtwork);
    expect(medal.querySelector('.badge-suitcase')).toHaveAttribute('width', '1254');
    expect(medal.querySelector('.badge-suitcase-slot')).toHaveAttribute('viewBox', suitcaseViewBox);
    expect(medal.querySelector('.badge-suitcase-slot')).toHaveAttribute('x', String(center.x - center.width / 2));
    expect(medal.querySelector('.badge-suitcase-slot')).toHaveAttribute('y', String(center.y - center.height / 2));
    expect(medal.querySelector('.badge-suitcase-slot')).toHaveAttribute('width', String(center.width));
    expect(medal.querySelector('.badge-suitcase-slot')).toHaveAttribute('height', String(center.height));
    expect(medal.querySelector('.badge-family')?.textContent).toBe('');
    expect(medal.querySelector('.badge-wk')).toBeNull();
    expect(medal.querySelector('.badge-format-artwork')).toHaveAttribute('href', '/' + formatArtwork.picture.src);
    expect(medal.querySelector('.badge-number')).toHaveTextContent('L1');
  });
});

it('switches generated format artwork independently of family, rank and multi-digit level', () => {
  const travelBadge: PackBadge = { ...badge, pack: { ...badge.pack, badgeFamily: 'suitcase', id: 'es-419-travel-12-pictures', title: 'Travel level 12', sourceLevel: 12 } };
  const view = render(<PackBadgeMedal badge={travelBadge}/>);
  const originalArtwork = view.container.querySelector('.badge-background')!.getAttribute('href');
  const originalSuitcase = view.container.querySelector('.badge-suitcase-slot')!.outerHTML;
  expect(view.container.querySelector('.badge-format-artwork')).toHaveAttribute('href', '/' + formatArtwork.picture.src);
  view.rerender(<PackBadgeMedal badge={{ ...travelBadge, pack: { ...travelBadge.pack, exercise: 'audio-text' } }}/>);
  expect(view.container.querySelector('.badge-background')).toHaveAttribute('href', originalArtwork);
  expect(view.container.querySelector('.badge-suitcase-slot')!.outerHTML).toBe(originalSuitcase);
  expect(view.container.querySelector('.pack-badge-medal')).toHaveAttribute('data-family', 'Suitcase');
  expect(view.container.querySelector('.badge-number')).toHaveTextContent('L12');
  expect(view.container.querySelector('.badge-format')).toHaveAttribute('data-format', 'writing');
  expect(view.container.querySelector('.badge-format-artwork')).toHaveAttribute('href', '/' + formatArtwork.writing.src);
  expect(view.container.querySelector('.badge-format-slot')).toHaveAttribute('viewBox', formatArtwork.writing.viewBox);
  expect(view.container.querySelector('.badge-format-artwork')).toHaveAttribute('width', String(formatArtwork.writing.width));
  expect(view.container.querySelector('.badge-format-artwork')).toHaveAttribute('height', String(formatArtwork.writing.height));
  expect(view.container.querySelector('.badge-format path')).toBeNull();
  const multiDigitSize = view.container.querySelector('.badge-number')!.getAttribute('style');
  view.rerender(<PackBadgeMedal badge={{ ...travelBadge, pack: { ...travelBadge.pack, sourceLevel: 1 } }}/>);
  expect(view.container.querySelector('.badge-number')).toHaveTextContent('L1');
  expect(view.container.querySelector('.badge-number')!.getAttribute('style')).not.toBe(multiDigitSize);
});

it.each(['audio-picture', 'audio-text'] as const)('keeps %s choice of format separate from the pack family', exercise => {
  const view = render(<PackBadgeMedal badge={{ ...badge, pack: { ...badge.pack, exercise } }}/>);
  expect(view.container.querySelector('.pack-badge-medal')).toHaveAttribute('data-family', 'WaniKani');
  expect(view.container.querySelector('.badge-family')).toHaveTextContent('WK');
  expect(view.container.querySelector('.badge-suitcase')).toBeNull();
  const format = exercise === 'audio-picture' ? 'picture' : 'writing';
  expect(view.container.querySelector('.badge-background')).toHaveAttribute('href', '/' + badgeArtwork[badge.level.label].src);
  expect(view.container.querySelector('.badge-format')).toHaveAttribute('data-format', format);
  expect(view.container.querySelector('.badge-format-artwork')).toHaveAttribute('href', '/' + formatArtwork[format].src);
});

it('reads pack level from a title when the pack has no explicit level metadata', () => {
  const view = render(<PackBadgeMedal badge={{ ...badge, pack: { ...badge.pack, badgeFamily: undefined, sourceLevel: undefined, title: 'Travel level 23', id: 'es-419-travel-23-pictures' } }}/>);
  expect(view.container.querySelector('.badge-number')).toHaveTextContent('L23');
  expect(view.container.querySelector('.badge-suitcase')).not.toBeNull();
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

it('uses explicit family metadata ahead of legacy ID conventions', () => {
  const view = render(<PackBadgeMedal badge={{ ...badge, pack: { ...badge.pack, badgeFamily: 'suitcase' } }}/>);
  expect(view.container.querySelector('.badge-suitcase')).not.toBeNull();
  expect(view.container.querySelector('.badge-background')).toHaveAttribute('href', '/' + badgeArtwork.Improving.travelSrc);
  view.rerender(<PackBadgeMedal badge={{ ...badge, pack: { ...badge.pack, badgeFamily: 'wanikani', id: 'legacy-travel-fixture' } }}/>);
  expect(view.container.querySelector('.badge-family')).toHaveTextContent('WK');
  expect(view.container.querySelector('.badge-suitcase')).toBeNull();
  expect(view.container.querySelector('.badge-background')).toHaveAttribute('href', '/' + badgeArtwork.Improving.src);
});
