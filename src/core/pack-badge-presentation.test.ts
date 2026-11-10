import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { masteryLevels } from './mastery';
import type { PackBadge } from './pack-badges';
import { BADGE_UPGRADE_MS, BADGE_REDUCED_CELEBRATE_MS, BADGE_REORDER_MS, BadgePresentationController, sortPackBadges } from './pack-badge-presentation';

function badge(id: string, level = 3): PackBadge {
  return { pack: { id, title: id, language: 'ja-JP', exercise: 'audio-picture', itemIds: [] }, level: masteryLevels[level]!, cardCount: 12 };
}
const scope = {};
const input = (badges: readonly PackBadge[] | null, extra: Partial<Parameters<BadgePresentationController['update']>[0]> = {}) =>
  ({ badges, active: true, scope, reducedMotion: false, ...extra });
const ids = (controller: BadgePresentationController) => controller.getSnapshot().entries.map(entry => entry.badge.pack.id);
const current = (controller: BadgePresentationController) => controller.getSnapshot().entries.find(entry => entry.celebration);

it('orders highest mastery first while preserving source order for ties without mutating input', () => {
  const source = [badge('first', 3), badge('second', 7), badge('third', 3), badge('fourth', 5)];
  expect(sortPackBadges(source).map(entry => entry.pack.id)).toEqual(['second', 'fourth', 'first', 'third']);
  expect(source.map(entry => entry.pack.id)).toEqual(['first', 'second', 'third', 'fourth']);
});

// Keep lifecycle/scope and one upgrade contract. The native badge journey owns
// rendering; exact decorative ring geometry and phase permutations are retired.
describe('BadgePresentationController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('establishes a silent sorted baseline and keeps equivalent snapshots stable', () => {
    const controller = new BadgePresentationController();
    const listener = vi.fn(); controller.subscribe(listener);
    controller.update(input(null));
    expect(controller.getSnapshot().entries).toEqual([]);
    controller.update(input([badge('a'), badge('b', 7)]));
    expect(ids(controller)).toEqual(['b', 'a']);
    expect(controller.getSnapshot().phase).toBe('idle');
    expect(controller.getSnapshot().announcement).toBe('');
    const accepted = controller.getSnapshot(); listener.mockClear();
    controller.update(input([badge('a'), badge('b', 7)]));
    expect(controller.getSnapshot()).toBe(accepted);
    expect(listener).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces an upgraded medal in its old slot before reordering both badges', () => {
    const controller = new BadgePresentationController();
    controller.update(input([badge('a'), badge('b', 5), badge('c', 6)]));
    const originalPositions = new Map(controller.getSnapshot().entries.map(entry => [entry.badge.pack.id, entry.position]));
    controller.update(input([badge('a', 7), badge('b', 5), badge('c', 6)]));
    expect(controller.getSnapshot().phase).toBe('celebrate');
    expect(ids(controller)).toEqual(['c', 'a', 'b']);
    expect(current(controller)).toMatchObject({ badge: { pack: { id: 'a' }, level: { label: 'Mastered' } },
      position: originalPositions.get('a'), celebration: { kind: 'upgrade', previous: { level: { label: 'Familiar' } } } });
    vi.advanceTimersByTime(BADGE_UPGRADE_MS - 1);
    expect(controller.getSnapshot().phase).toBe('celebrate');
    expect(controller.getSnapshot().entries.map(entry => entry.position)).toEqual([originalPositions.get('c'), originalPositions.get('a'), originalPositions.get('b')]);
    vi.advanceTimersByTime(1);
    expect(controller.getSnapshot().phase).toBe('reorder'); expect(ids(controller)).toEqual(['a', 'c', 'b']);
    expect(controller.getSnapshot().entries[0]!.position).toEqual({ x: 0, y: -1 });
    expect(current(controller)).toBeUndefined();
    vi.advanceTimersByTime(BADGE_REORDER_MS);
    expect(controller.getSnapshot().phase).toBe('idle'); expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the last accepted baseline through pending or failed Home history loads', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a')]));
    controller.update(input(null));
    expect(ids(controller)).toEqual(['a']); expect(vi.getTimerCount()).toBe(0);
    controller.update(input([badge('a', 5)]));
    expect(current(controller)?.celebration?.kind).toBe('upgrade');
  });

  it('establishes a new silent baseline on account/language scope changes or reset', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a')]));
    controller.update(input([badge('a', 7)]));
    controller.update(input(null, { scope: 'other' }));
    expect(controller.getSnapshot().entries).toEqual([]); expect(vi.getTimerCount()).toBe(0);
    controller.update(input([badge('new', 7)], { scope: 'other' }));
    expect(current(controller)).toBeUndefined(); expect(ids(controller)).toEqual(['new']);
    controller.update(input([badge('new', 7)], { scope: 'other', reset: true }));
    expect(controller.getSnapshot().entries).toEqual([]);
    controller.update(input([badge('new', 7)], { scope: 'other' }));
    expect(current(controller)).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
  });

  it('uses a brief static celebration and immediate final slots under reduced motion', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a'), badge('b', 5)], { reducedMotion: true }));
    controller.update(input([badge('a', 7), badge('b', 5)], { reducedMotion: true }));
    expect(controller.getSnapshot().phase).toBe('celebrate');
    vi.advanceTimersByTime(BADGE_REDUCED_CELEBRATE_MS - 1);
    expect(controller.getSnapshot().phase).toBe('celebrate');
    vi.advanceTimersByTime(1);
    expect(controller.getSnapshot().phase).toBe('idle'); expect(ids(controller)).toEqual(['b', 'a']); expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans callbacks/listeners on dispose and permits StrictMode subscription/setup reuse', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a')]));
    const first = vi.fn(); const unsubscribe = controller.subscribe(first);
    controller.update(input([badge('a', 5)])); expect(first).toHaveBeenCalled(); first.mockClear();
    controller.dispose(); unsubscribe(); vi.runAllTimers(); expect(first).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    const second = vi.fn(); controller.subscribe(second);
    controller.update(input([badge('a', 5)])); expect(current(controller)).toBeUndefined();
    controller.update(input([badge('a', 7)])); expect(second).toHaveBeenCalled(); expect(current(controller)?.celebration?.kind).toBe('upgrade');
  });
});
