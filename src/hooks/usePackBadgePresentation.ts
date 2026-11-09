import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { BadgePresentationController, type BadgePresentationInput } from '../core/pack-badge-presentation';

const motionQuery = '(prefers-reduced-motion: reduce)';
const reducedMotion = () => Boolean(globalThis.matchMedia?.(motionQuery).matches);
function subscribeMotion(listener: () => void) {
  const media = globalThis.matchMedia?.(motionQuery);
  media?.addEventListener?.('change', listener);
  return () => media?.removeEventListener?.('change', listener);
}

/** Keep accepted Home snapshots alive across practice without persisting presentation state. */
export function usePackBadgePresentation(input: Omit<BadgePresentationInput, 'reducedMotion'>) {
  const [controller] = useState(() => new BadgePresentationController());
  const motion = useSyncExternalStore(subscribeMotion, reducedMotion, () => false);
  const presentation = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const { badges, active, scope, reset } = input;
  useLayoutEffect(() => {
    controller.update({ badges, active, scope, reset, reducedMotion: motion });
  }, [controller, badges, active, scope, reset, motion]);
  useLayoutEffect(() => () => controller.dispose(), [controller]);
  return presentation;
}
