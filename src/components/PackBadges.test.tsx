import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PackBadges } from './PackBadges';
import { masteryLevels } from '../core/mastery';
import { cardPacks } from '../core/packs';

it('renders named pack badges and removes the section when no badge is available', () => {
  const view = render(<PackBadges badges={[{ pack: cardPacks[0]!, level: masteryLevels[2], cardCount: 12 }]}/>);
  expect(screen.getByRole('region', { name: 'Pack mastery badges' })).toBeInTheDocument();
  expect(screen.getByRole('listitem')).toHaveAccessibleName(`${cardPacks[0]!.title}: Improving minimum mastery`);
  expect(screen.getByRole('listitem')).toHaveAttribute('title', `${cardPacks[0]!.title} · Improving minimum · 12 cards`);
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  expect(screen.queryByText('Improving')).not.toBeInTheDocument();
  expect(screen.getByRole('listitem')).toHaveAttribute('tabindex', '0');
  view.rerender(<PackBadges badges={[]}/>);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('gives every mastery level a unique crest and uses the medallion for family and ribbon for level/format', () => {
  const badges = masteryLevels.map((level, index) => ({ pack: { ...cardPacks[0]!, id: `ja-wanikani-${index}-pictures` }, level, cardCount: 12 }));
  const { container } = render(<PackBadges badges={badges}/>);
  expect(new Set(Array.from(container.querySelectorAll('.badge-disc'), element => element.getAttribute('d'))).size).toBe(8);
  expect(new Set(Array.from(container.querySelectorAll('textPath'), path => path.getAttribute('href'))).size).toBe(8);
  for (const medal of container.querySelectorAll('.pack-badge-medal')) {
    expect(medal.getAttribute('data-family')).toBe('WaniKani');
    expect(medal.querySelector('.badge-family')?.textContent).toBe('WK');
    expect(medal.querySelector('.badge-number')?.textContent).toBe('L1');
    expect(medal.querySelector('.badge-picture-frame')).not.toBeNull();
    expect(medal.querySelector('.badge-ribbon-tails')).not.toBeNull();
    expect(medal.querySelector('.badge-crab')).toBeNull();
    expect(medal.querySelector('.badge-wk')).toHaveAttribute('dominant-baseline', 'central');
    const link = medal.querySelector('textPath')!.getAttribute('href')!;
    expect(Array.from(medal.querySelectorAll('defs path')).some(path => '#' + path.id === link)).toBe(true);
  }
});

it('identifies travel contents with its own emblem and shows a writing ribbon for writing packs', () => {
  const { container } = render(<PackBadges badges={[{ pack: { ...cardPacks[0]!, id: 'es-419-travel-2-writing', title: 'Travel level 2', sourceLevel: 2, exercise: 'audio-text' }, level: masteryLevels[5], cardCount: 36 }]}/>);
  expect(container.querySelector('.pack-badge-medal')).toHaveAttribute('data-family', 'Travel');
  expect(container.querySelector('.badge-suitcase')).not.toBeNull();
  expect(container.querySelector('.badge-family')?.textContent).toBe('');
  expect(container.querySelector('.badge-number')).toHaveTextContent('L2');
  expect(container.querySelector('.badge-format path')).not.toBeNull();
  expect(container.querySelector('.badge-picture-frame')).toBeNull();
});
