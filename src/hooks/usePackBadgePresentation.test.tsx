import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePackBadgePresentation } from './usePackBadgePresentation';
import { PackBadges } from '../components/PackBadges';
import { BADGE_CELEBRATE_MS, BADGE_UPGRADE_MS, BADGE_REORDER_MS } from '../core/pack-badge-presentation';
import { masteryLevels } from '../core/mastery';
import { cardPacks } from '../core/packs';
import type { PackBadge } from '../core/pack-badges';

const account = {};
const badge = (index: number, rank: number): PackBadge => ({ pack: cardPacks[index]!, level: masteryLevels[rank]!, cardCount: 12 });
function Harness({ badges, active = true, scope = account, reset = false }: {
  badges: readonly PackBadge[] | null; active?: boolean; scope?: object; reset?: boolean;
}) {
  const presentation = usePackBadgePresentation({ badges, active, scope, reset });
  return active && badges ? <PackBadges badges={badges} presentation={presentation}/> : null;
}
const region = () => screen.getByRole('region', { name: 'Pack mastery badges' });
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it('celebrates a replacement before moving it to the top, including StrictMode lifecycle reuse', () => {
  const before = [badge(0, 2), badge(1, 5), badge(2, 6)];
  const view = render(<StrictMode><Harness badges={before}/></StrictMode>);
  expect(region()).toHaveAttribute('data-phase', 'idle');
  const originalNodes = screen.getAllByRole('listitem');
  const original = screen.getByRole('listitem', { name: `${before[0]!.pack.title}: Improving minimum mastery` }).getAttribute('style');
  view.rerender(<StrictMode><Harness badges={[badge(0, 7), badge(1, 5), badge(2, 6)]}/></StrictMode>);
  const upgraded = screen.getByRole('listitem', { name: `${before[0]!.pack.title}: Mastered minimum mastery` });
  expect(region()).toHaveAttribute('data-phase', 'celebrate');
  expect(upgraded).toHaveAttribute('data-celebration', 'upgrade');
  expect(upgraded.getAttribute('style')).toBe(original);
  expect(upgraded.querySelector('.badge-previous-art [data-rank="Improving"]')).not.toBeNull();
  expect(upgraded.querySelector('.badge-current-art [data-rank="Mastered"]')).not.toBeNull();
  expect(region().querySelectorAll('.badge-fireworks [data-burst]')).toHaveLength(5);
  expect(region().querySelectorAll('.firework-ray').length).toBeGreaterThan(100);
  expect(upgraded).toHaveAttribute('data-side', 'left');
  expect(screen.getByRole('status')).toHaveTextContent('Badge upgraded');
  act(() => { vi.advanceTimersByTime(BADGE_UPGRADE_MS); });
  expect(region()).toHaveAttribute('data-phase', 'reorder');
  screen.getAllByRole('listitem').forEach((element, index) => expect(element).toBe(originalNodes[index]));
  expect(upgraded.getAttribute('style')).not.toBe(original);
  expect(upgraded.querySelector('.badge-previous-art, .badge-fireworks')).toBeNull();
  act(() => { vi.advanceTimersByTime(BADGE_REORDER_MS); });
  expect(region()).toHaveAttribute('data-phase', 'idle');
  expect(vi.getTimerCount()).toBe(0);
  view.unmount();
});

it('remembers the last real Home snapshot through practice and pending history', () => {
  const before = [badge(0, 2)];
  const view = render(<Harness badges={before}/>);
  view.rerender(<Harness active={false} badges={null}/>);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  view.rerender(<Harness active={false} badges={[badge(0, 5)]}/>);
  view.rerender(<Harness badges={null}/>);
  view.rerender(<Harness badges={[badge(0, 5)]}/>);
  expect(region()).toHaveAttribute('data-phase', 'celebrate');
  expect(screen.getByRole('listitem')).toHaveAttribute('data-celebration', 'upgrade');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not celebrate existing progress on first load, account replacement or account loading', () => {
  const view = render(<Harness badges={null}/>);
  view.rerender(<Harness badges={[badge(0, 3)]}/>);
  expect(region()).toHaveAttribute('data-phase', 'idle');
  view.rerender(<Harness scope={{}} badges={[badge(0, 7)]}/>);
  expect(region()).toHaveAttribute('data-phase', 'idle');
  const next = {};
  view.rerender(<Harness scope={next} reset badges={null}/>);
  view.rerender(<Harness scope={next} badges={[badge(0, 7)]}/>);
  expect(region()).toHaveAttribute('data-phase', 'idle');
  expect(region().querySelector('.badge-fireworks')).toBeNull();
  view.unmount();
});

it('announces a first earned badge after an empty baseline and clears timers on unmount', () => {
  const view = render(<Harness badges={[]}/>);
  const live = screen.getByRole('status');
  view.rerender(<Harness badges={[badge(0, 2)]}/>);
  expect(screen.getByRole('listitem')).toHaveAttribute('data-celebration', 'award');
  expect(screen.getByRole('listitem')).toHaveStyle('--badge-angle: 0deg');
  expect(region().querySelectorAll('.badge-fireworks [data-burst]')).toHaveLength(1);
  expect(screen.getByRole('status')).toBe(live);
  expect(live).toHaveTextContent('New badge');
  view.unmount();
  act(() => { vi.runOnlyPendingTimers(); });
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['award', 'upgrade'] as const)('clears a completed %s announcement so re-earning it changes the live text again', kind => {
  const before = kind === 'award' ? [] : [badge(0, 2), badge(1, 5)];
  const after = kind === 'award' ? [badge(0, 2)] : [badge(0, 7), badge(1, 5)];
  const view = render(<Harness badges={before}/>);
  const live = screen.getByRole('status');
  view.rerender(<Harness badges={after}/>);
  const duration = kind === 'upgrade' ? BADGE_UPGRADE_MS : BADGE_CELEBRATE_MS;
  const announcement = live.textContent;
  expect(announcement).toContain(kind === 'award' ? 'New badge' : 'Badge upgraded');
  act(() => { vi.advanceTimersByTime(duration + BADGE_REORDER_MS); });
  expect(live).toBeEmptyDOMElement();
  view.rerender(<Harness badges={before}/>);
  act(() => { vi.advanceTimersByTime(BADGE_REORDER_MS); });
  view.rerender(<Harness badges={after}/>);
  expect(live).toHaveTextContent(announcement!);
  act(() => { vi.advanceTimersByTime(duration + BADGE_REORDER_MS); });
  expect(live).toBeEmptyDOMElement();
  view.unmount();
});
