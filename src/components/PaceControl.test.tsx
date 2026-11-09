import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DensityIndicator } from './PaceControl';

it('shows the current qualitative label and an accessible loading placeholder', () => {
  const view = render(<DensityIndicator value={20}/>);
  expect(screen.getByRole('status', { name: 'Review density' }).textContent).toBe('Moderate');
  view.rerender(<DensityIndicator value={null}/>);
  expect(screen.getByRole('status', { name: 'Review density' }).textContent).toBe('…');
});
