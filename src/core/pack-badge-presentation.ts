import { masteryLevels } from './mastery';
import type { PackBadge } from './pack-badges';

export const BADGE_CELEBRATE_MS = 1900;
export const BADGE_UPGRADE_MS = 4200;
export const BADGE_UPGRADE_FADE_MS = 500;
export const BADGE_UPGRADE_REVEAL_MS = 1050;
export const BADGE_REORDER_MS = 1700;
export type BadgeSide = 'left' | 'right';
export const BADGE_REDUCED_CELEBRATE_MS = 450;
export interface BadgePosition { x: number; y: number }
export interface BadgeChange { kind: 'award' | 'upgrade'; badge: PackBadge; previous?: PackBadge }
export interface PresentedPackBadge {
  badge: PackBadge;
  position: BadgePosition;
  side: BadgeSide;
  /** Continuous degrees, unwrapped across the bottom for a smooth circular turn. */
  angle: number;
  celebration?: BadgeChange & { token: number };
}
export interface BadgePresentation {
  phase: 'idle' | 'celebrate' | 'reorder';
  entries: readonly PresentedPackBadge[];
  announcement: string;
}
export interface BadgePresentationInput {
  badges: readonly PackBadge[] | null;
  active: boolean;
  scope: unknown;
  reducedMotion: boolean;
  reset?: boolean;
}

const rank = (badge: PackBadge) => masteryLevels.findIndex(level => level.label === badge.level.label);
const angleOf = (position: BadgePosition) => Math.atan2(position.x, -position.y) * 180 / Math.PI;
/** New medals enter below their own side, while neighbors hold their current slots. */
function awardPosition(entries: readonly PresentedPackBadge[], side: BadgeSide): BadgePosition {
  if (!entries.length) return { x: 0, y: -1 };
  const sameSide = entries.filter(entry => entry.side === side);
  const outermost = Math.max(0, ...sameSide.map(entry => Math.abs(angleOf(entry.position))));
  const step = 360 / Math.max(10, entries.length + 1);
  const angle = Math.min(180, outermost + step) * Math.PI / 180 * (side === 'left' ? -1 : 1);
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

/** Retain side membership; rank only within each side. The fuller side owns the top slot. */
export function layoutPackBadges(badges: readonly PackBadge[], sides = new Map<string, BadgeSide>(), previous: readonly PresentedPackBadge[] = []): PresentedPackBadge[] {
  const priorOrder = new Map(previous.map((entry, index) => [entry.badge.pack.id, index]));
  const stable = [...badges].sort((a, b) => (priorOrder.get(a.pack.id) ?? previous.length) - (priorOrder.get(b.pack.id) ?? previous.length));
  const ordered = sortPackBadges(stable);
  const counts = { left: 0, right: 0 };
  for (const badge of ordered) {
    const side = sides.get(badge.pack.id);
    if (side) counts[side]++;
  }
  for (const badge of ordered) {
    if (!sides.has(badge.pack.id)) {
      const side = counts.left <= counts.right ? 'left' : 'right';
      sides.set(badge.pack.id, side); counts[side]++;
    }
  }
  const centerSide = counts.left === counts.right ? null : counts.left > counts.right ? 'left' : 'right';
  const step = 360 / Math.max(10, 2 * Math.max(counts.left, counts.right) - (centerSide ? 1 : 0));
  const indices = { left: 0, right: 0 };
  return ordered.map(badge => {
    const side = sides.get(badge.pack.id)!;
    const index = indices[side]++;
    const angle = (index + (centerSide ? side === centerSide ? 0 : 1 : .5)) * step * (side === 'left' ? -1 : 1);
    const radians = angle * Math.PI / 180;
    const clean = (value: number) => Math.abs(value) < 1e-12 ? 0 : value;
    return { badge, side, angle, position: { x: clean(Math.sin(radians)), y: clean(-Math.cos(radians)) } };
  }).sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle) || (a.side === 'left' ? -1 : 1));
}

/** Highest mastery takes the top-outward slots; equal levels keep source pack order. */
export function sortPackBadges(badges: readonly PackBadge[]): PackBadge[] {
  return badges.map((badge, index) => ({ badge, index }))
    .sort((a, b) => rank(b.badge) - rank(a.badge) || a.index - b.index)
    .map(entry => entry.badge);
}

/** Only positive changes celebrate; disappearance and lower mastery are ordinary updates. */
export function badgeChanges(before: readonly PackBadge[], after: readonly PackBadge[]): BadgeChange[] {
  const previous = new Map(before.map(badge => [badge.pack.id, badge]));
  return after.flatMap<BadgeChange>(badge => {
    const old = previous.get(badge.pack.id);
    if (!old) return [{ kind: 'award' as const, badge }];
    return rank(badge) > rank(old) ? [{ kind: 'upgrade' as const, badge, previous: old }] : [];
  });
}

const emptyPresentation = (): BadgePresentation => ({ phase: 'idle', entries: [], announcement: '' });
const uninitializedScope = Symbol('uninitialized badge scope');

/**
 * Ephemeral Home presentation. The authoritative badge list never changes here.
 * A revealed level advances before its animation so repeated snapshots cannot replay it.
 */
export class BadgePresentationController {
  private listeners = new Set<() => void>();
  private snapshot = emptyPresentation();
  private scope: unknown = uninitializedScope;
  private known = false;
  private shown: PackBadge[] = [];
  private pending: readonly PackBadge[] | null = null;
  private current: BadgeChange | null = null;
  private sides = new Map<string, BadgeSide>();
  private active = false;
  private reducedMotion = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private token = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): BadgePresentation => this.snapshot;

  update(input: BadgePresentationInput): void {
    const motionChanged = this.reducedMotion !== input.reducedMotion;
    this.reducedMotion = input.reducedMotion;
    if (this.scope !== input.scope || input.reset) {
      this.cancelTimer();
      this.scope = input.scope;
      this.known = false;
      this.shown = [];
      this.pending = null;
      this.current = null;
      this.sides.clear();
      this.publish(emptyPresentation());
    }
    this.active = input.active;
    if (input.reset) return;
    if (!input.active) {
      // Leaving Home consumes animations already in flight, not progress arriving while hidden.
      this.settle();
      return;
    }
    if (input.badges === null) {
      this.adjustMotion(motionChanged);
      return;
    }
    this.pending = [...input.badges];
    if (!this.known) {
      this.known = true;
      this.settle();
      return;
    }
    if (this.current) {
      const latest = this.pending.find(badge => badge.pack.id === this.current!.badge.pack.id);
      if (!latest || rank(latest) < rank(this.current.badge)) {
        // Never finish an award/upgrade withdrawn by a newer authoritative snapshot.
        this.cancelTimer();
        this.current = null;
        this.reconcile();
        const positions = new Map(this.snapshot.entries.map(entry => [entry.badge.pack.id, entry]));
        this.publish({ phase: 'idle', announcement: '', entries: this.shown.map(badge => {
          const previous = positions.get(badge.pack.id)!;
          return { badge, side: previous.side, position: previous.position, angle: previous.angle };
        }) });
        this.advance();
        return;
      }
    }
    if (this.snapshot.phase !== 'idle') {
      this.reconcile();
      const positions = new Map(this.snapshot.entries.map(entry => [entry.badge.pack.id, entry]));
      this.publish({ ...this.snapshot, entries: this.shown.map(badge => {
        const entry = positions.get(badge.pack.id)!;
        return { ...entry, badge };
      }) });
      this.adjustMotion(motionChanged);
      return;
    }
    this.advance();
  }

  /** Cancel pending callbacks and listeners; a StrictMode setup may reuse this instance. */
  dispose(): void {
    this.cancelTimer();
    this.active = false;
    this.current = null;
    if (this.known && this.pending !== null) {
      this.shown = sortPackBadges(this.pending);
      const entries = this.positioned(this.shown);
      this.shown = entries.map(entry => entry.badge);
      this.snapshot = { phase: 'idle', entries, announcement: '' };
    }
    this.listeners.clear();
  }

  private cancelTimer(): void {
    this.generation++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(callback: () => void, delay: number): void {
    this.cancelTimer();
    const generation = this.generation;
    this.timer = setTimeout(() => {
      if (generation !== this.generation || !this.active) return;
      this.timer = null;
      callback();
    }, delay);
  }

  private publish(next: BadgePresentation): void {
    // Fresh but equivalent async snapshots must not restart phases or external-store renders.
    if (JSON.stringify(next) === JSON.stringify(this.snapshot)) return;
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }

  private positioned(badges: readonly PackBadge[]): PresentedPackBadge[] {
    return layoutPackBadges(badges, this.sides, this.snapshot.entries);
  }

  private celebrationDuration(): number {
    return this.reducedMotion ? BADGE_REDUCED_CELEBRATE_MS : this.current?.kind === 'upgrade' ? BADGE_UPGRADE_MS : BADGE_CELEBRATE_MS;
  }

  private settle(): void {
    this.cancelTimer();
    this.current = null;
    if (this.known && this.pending !== null) this.shown = sortPackBadges(this.pending);
    const entries = this.positioned(this.shown);
    this.shown = entries.map(entry => entry.badge);
    this.publish({ phase: 'idle', entries, announcement: '' });
  }

  /** Apply removals, metadata and downward changes now; positive changes wait their turn. */
  private reconcile(): void {
    const latest = new Map(this.pending?.map(badge => [badge.pack.id, badge]));
    this.shown = this.shown.flatMap(badge => {
      const next = latest.get(badge.pack.id);
      return next ? [rank(next) <= rank(badge) ? next : badge] : [];
    });
  }

  private visibleInSourceOrder(): PackBadge[] {
    const visible = new Map(this.shown.map(badge => [badge.pack.id, badge]));
    return (this.pending ?? []).flatMap(badge => {
      const shown = visible.get(badge.pack.id);
      return shown ? [shown] : [];
    });
  }

  private advance(): void {
    if (!this.active || this.pending === null) return;
    this.reconcile();
    const change = badgeChanges(this.shown, this.pending)[0];
    if (!change) {
      this.reorder();
      return;
    }
    const positions = new Map(this.snapshot.entries.map(entry => [entry.badge.pack.id, entry]));
    const existing = this.shown.findIndex(badge => badge.pack.id === change.badge.pack.id);
    if (existing < 0) this.shown.push(change.badge);
    else this.shown[existing] = change.badge;
    this.current = change;
    // Establish the new membership before its reveal; existing memberships never change.
    this.positioned(this.visibleInSourceOrder());
    const side = this.sides.get(change.badge.pack.id)!;
    const openPosition = awardPosition(this.snapshot.entries.filter(entry => this.shown.some(badge => badge.pack.id === entry.badge.pack.id)), side);
    const token = ++this.token;
    const entries = this.shown.map(badge => {
      const previous = positions.get(badge.pack.id);
      const position = previous?.position ?? openPosition;
      return { badge, side: this.sides.get(badge.pack.id)!, position, angle: previous?.angle ?? angleOf(position),
        ...(badge.pack.id === change.badge.pack.id ? { celebration: { ...change, token } } : {}),
      };
    });
    this.publish({ phase: 'celebrate', entries,
      announcement: `${change.kind === 'award' ? 'New badge' : 'Badge upgraded'}: ${change.badge.pack.title}, ${change.badge.level.label}.` });
    this.schedule(() => { this.current = null; this.reorder(); },
      this.celebrationDuration());
  }

  private reorder(): void {
    this.reconcile();
    this.shown = sortPackBadges(this.visibleInSourceOrder());
    const entries = this.positioned(this.shown);
    this.shown = entries.map(entry => entry.badge);
    const previous = new Map(this.snapshot.entries.map(entry => [entry.badge.pack.id, entry.position]));
    const moved = entries.some(entry => {
      const old = previous.get(entry.badge.pack.id);
      return !old || old.x !== entry.position.x || old.y !== entry.position.y;
    });
    if (moved && !this.reducedMotion) {
      this.publish({ phase: 'reorder', entries, announcement: this.snapshot.announcement });
      this.schedule(() => {
        this.publish({ ...this.snapshot, phase: 'idle', announcement: '' });
        this.advance();
      }, BADGE_REORDER_MS);
    } else {
      this.publish({ phase: 'idle', entries, announcement: '' });
      // A second positive change may have arrived during the preceding celebration.
      if (this.pending && badgeChanges(this.shown, this.pending).length) this.advance();
    }
  }

  private adjustMotion(changed: boolean): void {
    if (!changed || this.snapshot.phase === 'idle') return;
    if (this.snapshot.phase === 'celebrate') {
      this.schedule(() => { this.current = null; this.reorder(); },
        this.celebrationDuration());
    } else if (this.reducedMotion) {
      this.cancelTimer();
      this.publish({ ...this.snapshot, phase: 'idle', announcement: '' });
      this.advance();
    }
  }
}
