import type { AnswerOutcome, PracticeAttempt } from '../types';
import type { ScheduledWord } from './scheduler';
import { cardMastery } from './mastery';

/** Dev review samples the pilot choices independently on each presentation. */
export function devReviewTimeLimit(random = Math.random): number | null {
  const choices = [null, 10000, 5000, 3000, 1500] as const;
  return choices[Math.floor(random() * choices.length)]!;
}

/** Timers share the same scheduled-interval policy as displayed mastery (#135). */
export function quizTimeLimit(word: ScheduledWord | undefined): number | null {
  return cardMastery(word).timerMs;
}

/** Expiry changes the eventual grade, never whether a question can be answered. */
export function answerOutcome(correct: boolean, timer: PracticeAttempt['timer'], answeredAt: number): AnswerOutcome {
  if (!correct) return 'failure';
  return timer && answeredAt - timer.startedAt >= timer.limitMs ? 'partial' : 'success';
}
