import { useLayoutEffect, useRef } from 'react';
import type { PracticeAttempt } from '../types';

/** Browser-native transform motion avoids rerendering the quiz for every frame. */
export function QuizTimerFill({ timer, expired, now }: {
  timer: NonNullable<PracticeAttempt['timer']>; expired: boolean; now: () => number;
}) {
  const fill = useRef<HTMLDivElement>(null);
  const motion = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const animation = fill.current?.animate?.([
      { transform: 'scaleY(0)' }, { transform: 'scaleY(1)' },
    ], { duration: timer.limitMs, easing: 'linear', fill: 'forwards' });
    if (!animation) return;
    motion.current = animation;
    function alignWithDeadline() {
      animation!.currentTime = Math.max(0, Math.min(timer.limitMs, now() - timer.startedAt));
    }
    alignWithDeadline();
    document.addEventListener('visibilitychange', alignWithDeadline);
    return () => {
      document.removeEventListener('visibilitychange', alignWithDeadline);
      animation.cancel(); motion.current = null;
    };
  }, [timer, now]);
  useLayoutEffect(() => { if (expired) motion.current?.finish(); }, [expired]);
  return <div ref={fill} className="quiz-timer-fill" aria-hidden="true" style={{ transform: expired ? 'scaleY(1)' : 'scaleY(0)' }}/>;
}
