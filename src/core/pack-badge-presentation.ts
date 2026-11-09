import { masteryLevels } from './mastery';
import type { PackBadge } from './pack-badges';

export const BADGE_CELEBRATE_MS = 1900;
export const BADGE_REORDER_MS = 1700;
export const BADGE_REDUCED_CELEBRATE_MS = 450;
export interface BadgePosition { x: number; y: number }
export interface BadgeChange { kind: 'award' | 'upgrade'; badge: PackBadge; previous?: PackBadge }
export interface PresentedPackBadge {
  badge: PackBadge;
  position: BadgePosition;
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
const nearestAngle = (target: number, from = target) => target + Math.round((from - target) / 360) * 360;
type RotationDirection = 1 | -1;
function rotationDelta(target: number, from: number, direction: RotationDirection): number {
  const delta = ((target - from) * direction % 360 + 360) % 360;
  return delta < 1e-8 || delta > 360 - 1e-8 ? 0 : delta * direction;
}

/** Choose an open end of the ring, ready to turn in the same direction as its neighbors. */
function awardPosition(entries: readonly PresentedPackBadge[], direction: RotationDirection): BadgePosition {
  if (!entries.length) return { x: 0, y: -1 };
  const angles = entries.map(entry => (angleOf(entry.position) + 360) % 360).sort((a, b) => a - b);
  let start = angles[0]!, gap = 0;
  angles.forEach((angle, index) => {
    const space = (angles[index + 1] ?? angles[0]! + 360) - angle;
    if (space > gap) { start = angle; gap = space; }
  });
  const step = Math.min(360 / Math.max(10, entries.length + 1), gap / 2);
  const angle = (start + (direction === 1 ? gap - step : step)) * Math.PI / 180;
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

function awardRotation(entries: readonly PresentedPackBadge[], ordered: readonly PackBadge[], awardedId: string) {
  const destinations = new Map(ordered.map((badge, index) => [badge.pack.id, angleOf(packBadgePosition(index, ordered.length))]));
  const choices = ([1, -1] as const).map(direction => {
    const position = awardPosition(entries, direction);
    const distance = entries.reduce((sum, entry) => sum + Math.abs(rotationDelta(destinations.get(entry.badge.pack.id)!, entry.angle, direction)), 0)
      + Math.abs(rotationDelta(destinations.get(awardedId)!, angleOf(position), direction));
    return { direction, position, distance };
  });
  return choices[0]!.distance <= choices[1]!.distance ? choices[0]! : choices[1]!;
}

/** Highest mastery takes the top-outward slots; equal levels keep source pack order. */
export function sortPackBadges(badges: readonly PackBadge[]): PackBadge[] {
  return badges.map((badge, index) => ({ badge, index }))
    .sort((a, b) => rank(b.badge) - rank(a.badge) || a.index - b.index)
    .map(entry => entry.badge);
}

/** Mirrored slots; odd pairs start on the right so a new lowest badge needs one shared turn. */
export function packBadgePosition(index: number, count: number): BadgePosition {
  if (count < 1) return { x: 0, y: 0 };
  const step = 2 * Math.PI / Math.max(10, count);
  const slot = count % 2 === 0
    ? (Math.floor(index / 2) + .5) * (index % 2 ? 1 : -1)
    : index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? 1 : -1);
  const angle = slot * step;
  const clean = (value: number) => Math.abs(value) < 1e-12 ? 0 : value;
  return { x: clean(Math.sin(angle)), y: clean(-Math.cos(angle)) };
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
  private rotation: RotationDirection | undefined;
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
      this.rotation = undefined;
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
        this.rotation = undefined;
        this.reconcile();
        const positions = new Map(this.snapshot.entries.map(entry => [entry.badge.pack.id, entry]));
        this.publish({ phase: 'idle', announcement: '', entries: this.shown.map(badge => {
          const previous = positions.get(badge.pack.id)!;
          return { badge, position: previous.position, angle: previous.angle };
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
    this.rotation = undefined;
    if (this.known && this.pending !== null) {
      this.shown = sortPackBadges(this.pending);
      this.snapshot = { phase: 'idle', entries: this.positioned(this.shown), announcement: '' };
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

  private positioned(badges: readonly PackBadge[], direction?: RotationDirection): PresentedPackBadge[] {
    const previous = new Map(this.snapshot.entries.map(entry => [entry.badge.pack.id, entry.angle]));
    return badges.map((badge, index) => {
      const position = packBadgePosition(index, badges.length);
      const from = previous.get(badge.pack.id), target = angleOf(position);
      return { badge, position, angle: direction && from !== undefined ? from + rotationDelta(target, from, direction) : nearestAngle(target, from) };
    });
  }

  private settle(): void {
    this.cancelTimer();
    this.current = null;
    this.rotation = undefined;
    if (this.known && this.pending !== null) this.shown = sortPackBadges(this.pending);
    this.publish({ phase: 'idle', entries: this.positioned(this.shown), announcement: '' });
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
    const award = change.kind === 'award' ? awardRotation(
      this.snapshot.entries.filter(entry => this.shown.some(badge => badge.pack.id === entry.badge.pack.id)),
      sortPackBadges(this.visibleInSourceOrder()), change.badge.pack.id) : null;
    this.rotation = award?.direction;
    const token = ++this.token;
    const entries = this.shown.map(badge => {
      const previous = positions.get(badge.pack.id);
      const position = previous?.position ?? award!.position;
      return { badge, position, angle: previous?.angle ?? angleOf(position),
        ...(badge.pack.id === change.badge.pack.id ? { celebration: { ...change, token } } : {}),
      };
    });
    this.publish({ phase: 'celebrate', entries,
      announcement: `${change.kind === 'award' ? 'New badge' : 'Badge upgraded'}: ${change.badge.pack.title}, ${change.badge.level.label}.` });
    this.schedule(() => { this.current = null; this.reorder(); },
      this.reducedMotion ? BADGE_REDUCED_CELEBRATE_MS : BADGE_CELEBRATE_MS);
  }

  private reorder(): void {
    this.reconcile();
    this.shown = sortPackBadges(this.visibleInSourceOrder());
    const entries = this.positioned(this.shown, this.rotation);
    this.rotation = undefined;
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
        this.reducedMotion ? BADGE_REDUCED_CELEBRATE_MS : BADGE_CELEBRATE_MS);
    } else if (this.reducedMotion) {
      this.cancelTimer();
      this.publish({ ...this.snapshot, phase: 'idle', announcement: '' });
      this.advance();
    }
  }
}
