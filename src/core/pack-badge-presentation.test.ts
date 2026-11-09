import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { masteryLevels } from './mastery';
import type { PackBadge } from './pack-badges';
import {
  BADGE_CELEBRATE_MS, BADGE_REDUCED_CELEBRATE_MS, BADGE_REORDER_MS,
  BadgePresentationController, badgeChanges, packBadgePosition, sortPackBadges,
} from './pack-badge-presentation';

function badge(id: string, level = 3): PackBadge {
  return { pack: { id, title: id, language: 'ja-JP', exercise: 'audio-picture', itemIds: [] }, level: masteryLevels[level]!, cardCount: 12 };
}
const scope = {};
const input = (badges: readonly PackBadge[] | null, extra: Partial<Parameters<BadgePresentationController['update']>[0]> = {}) =>
  ({ badges, active: true, scope, reducedMotion: false, ...extra });
const ids = (controller: BadgePresentationController) => controller.getSnapshot().entries.map(entry => entry.badge.pack.id);
const current = (controller: BadgePresentationController) => controller.getSnapshot().entries.find(entry => entry.celebration);
const cycle = () => vi.advanceTimersByTime(BADGE_CELEBRATE_MS + BADGE_REORDER_MS);

it('orders highest mastery first while preserving source order for ties without mutating input', () => {
  const source = [badge('first', 3), badge('second', 7), badge('third', 3), badge('fourth', 5)];
  expect(sortPackBadges(source).map(entry => entry.pack.id)).toEqual(['second', 'fourth', 'first', 'third']);
  expect(source.map(entry => entry.pack.id)).toEqual(['first', 'second', 'third', 'fourth']);
});

it('fills upright mirrored unit-circle slots from the top for odd and even counts', () => {
  for (let count = 1; count <= 12; count++) {
    const points = Array.from({ length: count }, (_, index) => packBadgePosition(index, count));
    expect(new Set(points.map(point => `${point.x.toFixed(8)},${point.y.toFixed(8)}`)).size).toBe(count);
    points.forEach(point => expect(Math.hypot(point.x, point.y)).toBeCloseTo(1, 8));
    if (count % 2) expect(points[0]).toEqual({ x: 0, y: -1 });
    for (let index = count % 2; index < count; index += 2) {
      expect(points[index]!.x).toBeCloseTo(-points[index + 1]!.x, 8);
      expect(points[index]!.y).toBeCloseTo(points[index + 1]!.y, 8);
    }
  }
});

it('finds only newly awarded and strictly upgraded pack identities', () => {
  const old = [badge('upgrade'), badge('same'), badge('downgrade', 7), badge('removed')];
  const next = [badge('upgrade', 5), badge('same'), badge('downgrade', 3), badge('new', 2)];
  expect(badgeChanges(old, next)).toEqual([
    { kind: 'upgrade', badge: next[0], previous: old[0] }, { kind: 'award', badge: next[3] },
  ]);
});

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
    controller.update(input([badge('a'), badge('b', 5)]));
    const originalPositions = new Map(controller.getSnapshot().entries.map(entry => [entry.badge.pack.id, entry.position]));
    controller.update(input([badge('a', 7), badge('b', 5)]));
    expect(controller.getSnapshot().phase).toBe('celebrate');
    expect(ids(controller)).toEqual(['b', 'a']);
    expect(current(controller)).toMatchObject({ badge: { pack: { id: 'a' }, level: { label: 'Mastered' } },
      position: originalPositions.get('a'), celebration: { kind: 'upgrade', previous: { level: { label: 'Familiar' } } } });
    vi.advanceTimersByTime(BADGE_CELEBRATE_MS - 1);
    expect(controller.getSnapshot().phase).toBe('celebrate');
    expect(controller.getSnapshot().entries.map(entry => entry.position)).toEqual([originalPositions.get('b'), originalPositions.get('a')]);
    vi.advanceTimersByTime(1);
    expect(controller.getSnapshot().phase).toBe('reorder'); expect(ids(controller)).toEqual(['a', 'b']);
    expect(controller.getSnapshot().entries[0]!.position).toEqual(packBadgePosition(0, 2));
    expect(current(controller)).toBeUndefined();
    vi.advanceTimersByTime(BADGE_REORDER_MS);
    expect(controller.getSnapshot().phase).toBe('idle'); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not restart a running celebration when equivalent snapshots arrive', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a')]));
    controller.update(input([badge('a', 5)]));
    const accepted = controller.getSnapshot();
    vi.advanceTimersByTime(BADGE_CELEBRATE_MS - 1);
    controller.update(input([badge('a', 5)]));
    expect(controller.getSnapshot()).toBe(accepted);
    vi.advanceTimersByTime(1);
    expect(controller.getSnapshot().phase).toBe('idle'); expect(vi.getTimerCount()).toBe(0);
  });

  it('uses source order for ties after an upgrade changes the ordering', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a'), badge('b', 5)]));
    expect(ids(controller)).toEqual(['b', 'a']);
    controller.update(input([badge('a', 5), badge('b', 5)]));
    vi.advanceTimersByTime(BADGE_CELEBRATE_MS);
    expect(controller.getSnapshot().phase).toBe('reorder'); expect(ids(controller)).toEqual(['a', 'b']);
    vi.advanceTimersByTime(BADGE_REORDER_MS); expect(controller.getSnapshot().phase).toBe('idle');
  });

  it('celebrates the first earned badge after an authoritative empty baseline', () => {
    const controller = new BadgePresentationController(); controller.update(input([]));
    controller.update(input([badge('new', 2)]));
    expect(current(controller)).toMatchObject({ position: { x: 0, y: 0 }, celebration: { kind: 'award' } });
    expect(controller.getSnapshot().announcement).toContain('New badge: new, Improving');
    cycle();
    expect(controller.getSnapshot().entries[0]!.position).toEqual({ x: 0, y: -1 });
    expect(controller.getSnapshot().phase).toBe('idle');
    controller.update(input([badge('new', 2)]));
    expect(current(controller)).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not add a reorder phase when an upgrade does not change any slots', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a', 5), badge('b')]));
    controller.update(input([badge('a', 6), badge('b')]));
    vi.advanceTimersByTime(BADGE_CELEBRATE_MS);
    expect(controller.getSnapshot().phase).toBe('idle'); expect(ids(controller)).toEqual(['a', 'b']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('queues multiple awards, holding revealed badges still until each celebration ends', () => {
    const controller = new BadgePresentationController(); controller.update(input([]));
    controller.update(input([badge('a', 5), badge('b', 7)]));
    expect(ids(controller)).toEqual(['a']); expect(current(controller)?.badge.pack.id).toBe('a');
    cycle();
    expect(ids(controller)).toEqual(['a', 'b']); expect(current(controller)?.badge.pack.id).toBe('b');
    expect(controller.getSnapshot().entries[0]!.position).toEqual({ x: 0, y: -1 });
    cycle();
    expect(ids(controller)).toEqual(['b', 'a']); expect(controller.getSnapshot().phase).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('coalesces newer progress during a celebration without replaying or losing upgrades', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a')]));
    controller.update(input([badge('a', 5)]));
    const token = current(controller)!.celebration!.token;
    vi.advanceTimersByTime(200);
    controller.update(input([badge('a', 7), badge('b', 2)]));
    expect(current(controller)!.celebration!.token).toBe(token);
    expect(current(controller)?.badge.level.label).toBe('Strong');
    vi.advanceTimersByTime(BADGE_CELEBRATE_MS - 200);
    expect(current(controller)).toMatchObject({ badge: { pack: { id: 'a' }, level: { label: 'Mastered' } },
      celebration: { previous: { level: { label: 'Strong' } } } });
    expect(current(controller)!.celebration!.token).not.toBe(token);
    vi.advanceTimersByTime(BADGE_CELEBRATE_MS);
    expect(current(controller)?.badge.pack.id).toBe('b');
    cycle();
    expect(ids(controller)).toEqual(['a', 'b']); expect(controller.getSnapshot().phase).toBe('idle');
    controller.update(input([badge('a', 7), badge('b', 2)])); expect(vi.getTimerCount()).toBe(0);
  });

  it('queues progress arriving during the reorder phase after the current move finishes', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a'), badge('b', 5)]));
    controller.update(input([badge('a', 7), badge('b', 5)]));
    vi.advanceTimersByTime(BADGE_CELEBRATE_MS);
    controller.update(input([badge('a', 7), badge('b', 6), badge('c', 5)]));
    expect(controller.getSnapshot().phase).toBe('reorder'); expect(current(controller)).toBeUndefined();
    vi.advanceTimersByTime(BADGE_REORDER_MS);
    expect(current(controller)).toMatchObject({ badge: { pack: { id: 'b' }, level: { label: 'Confident' } },
      celebration: { kind: 'upgrade', previous: { level: { label: 'Strong' } } } });
    vi.advanceTimersByTime(BADGE_CELEBRATE_MS);
    expect(current(controller)?.badge.pack.id).toBe('c');
    cycle(); expect(ids(controller)).toEqual(['a', 'b', 'c']); expect(controller.getSnapshot().phase).toBe('idle');
  });

  it('keeps the last accepted baseline through pending or failed Home history loads', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a')]));
    controller.update(input(null));
    expect(ids(controller)).toEqual(['a']); expect(vi.getTimerCount()).toBe(0);
    controller.update(input([badge('a', 5)]));
    expect(current(controller)?.celebration?.kind).toBe('upgrade');
  });

  it('removes a withdrawn new badge immediately and cancels its old callback', () => {
    const controller = new BadgePresentationController(); controller.update(input([]));
    controller.update(input([badge('a', 5)]));
    vi.advanceTimersByTime(200); controller.update(input([]));
    expect(ids(controller)).toEqual([]); expect(controller.getSnapshot().phase).toBe('idle');
    expect(controller.getSnapshot().announcement).toBe('');
    vi.runAllTimers(); expect(ids(controller)).toEqual([]); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retain an upgraded rank after an authoritative downgrade during celebration', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a'), badge('b', 5)]));
    controller.update(input([badge('a', 7), badge('b', 5)]));
    controller.update(input([badge('a', 2), badge('b', 5)]));
    expect(current(controller)).toBeUndefined();
    expect(controller.getSnapshot().entries.find(entry => entry.badge.pack.id === 'a')?.badge.level.label).toBe('Improving');
    vi.runAllTimers(); expect(ids(controller)).toEqual(['b', 'a']);
    expect(controller.getSnapshot().entries.find(entry => entry.badge.pack.id === 'a')?.badge.level.label).toBe('Improving');
  });

  it('applies other removals and downgrades during a celebration without revealing queued upgrades', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a'), badge('b', 6), badge('c', 5)]));
    controller.update(input([badge('a', 7), badge('b', 6), badge('c', 5)]));
    controller.update(input([badge('a', 7), badge('b', 2), badge('d', 5)]));
    expect(ids(controller)).toEqual(['b', 'a']);
    expect(controller.getSnapshot().entries.find(entry => entry.badge.pack.id === 'b')?.badge.level.label).toBe('Improving');
    expect(current(controller)?.badge.pack.id).toBe('a');
    vi.runAllTimers(); expect(ids(controller)).toEqual(['a', 'd', 'b']); expect(controller.getSnapshot().phase).toBe('idle');
  });

  it('settles an interrupted celebration on leaving Home but detects later saved progress on return', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a')]));
    controller.update(input([badge('a', 5)]));
    controller.update(input(null, { active: false }));
    expect(controller.getSnapshot().phase).toBe('idle'); expect(current(controller)).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
    controller.update(input([badge('a', 7)], { active: false }));
    expect(controller.getSnapshot().entries[0]?.badge.level.label).toBe('Strong');
    controller.update(input([badge('a', 7)]));
    expect(current(controller)).toMatchObject({ celebration: { kind: 'upgrade', previous: { level: { label: 'Strong' } } } });
    cycle(); controller.update(input(null, { active: false })); controller.update(input([badge('a', 7)]));
    expect(current(controller)).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
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
    expect(controller.getSnapshot().phase).toBe('idle'); expect(ids(controller)).toEqual(['a', 'b']); expect(vi.getTimerCount()).toBe(0);
  });

  it('honors reduced motion when it changes mid-celebration or mid-reorder', () => {
    const controller = new BadgePresentationController(); controller.update(input([badge('a'), badge('b', 5)]));
    controller.update(input([badge('a', 7), badge('b', 5)]));
    controller.update(input(null, { reducedMotion: true }));
    vi.advanceTimersByTime(BADGE_REDUCED_CELEBRATE_MS);
    expect(controller.getSnapshot().phase).toBe('idle'); expect(ids(controller)).toEqual(['a', 'b']);
    controller.update(input([badge('a', 7), badge('b', 5)], { reducedMotion: false }));
    controller.update(input([badge('a', 7), badge('b', 5), badge('c', 6)]));
    vi.advanceTimersByTime(BADGE_CELEBRATE_MS); expect(controller.getSnapshot().phase).toBe('reorder');
    controller.update(input(null, { reducedMotion: true }));
    expect(controller.getSnapshot().phase).toBe('idle'); expect(vi.getTimerCount()).toBe(0);
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
