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
