import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PackBadges } from './PackBadges';
import { masteryLevels } from '../core/mastery';
import { cardPacks } from '../core/packs';

it('renders named pack badges and removes the section when no badge is available', () => {
  const view = render(<PackBadges badges={[{ pack: cardPacks[0]!, level: masteryLevels[2], cardCount: 12 }]}/>);
  expect(screen.getByRole('region', { name: 'Pack mastery badges' })).toBeInTheDocument();
  expect(screen.getByRole('listitem')).toHaveAccessibleName(`${cardPacks[0]!.title}: Improving minimum mastery`);
  expect(screen.getByRole('listitem')).toHaveAttribute('title', 'All 12 cards are Improving or higher');
  view.rerender(<PackBadges badges={[]}/>);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});
