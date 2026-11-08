import type { AnswerOutcome, PracticeAttempt } from '../types';
import type { ScheduledWord } from './scheduler';

/** Dev review samples the pilot choices independently on each presentation. */
export function devReviewTimeLimit(random = Math.random): number | null {
  const choices = [null, 10000, 7000, 5000, 3000] as const;
  return choices[Math.floor(random() * choices.length)]!;
}

/** Pilot policy (#121): FSRS stability is measured in days, per card identity. */
export function quizTimeLimit(word: ScheduledWord | undefined): number | null {
  if (!word || word.card.scheduleStatus !== 'review' || !Number.isFinite(word.card.stability)) return null;
  const stability = word.card.stability;
  if (stability >= 21) return 3000;
  if (stability >= 7) return 5000;
  if (stability >= 3) return 7000;
  if (stability >= 1) return 10000;
  return null;
}

/** Expiry changes the eventual grade, never whether a question can be answered. */
export function answerOutcome(correct: boolean, timer: PracticeAttempt['timer'], answeredAt: number): AnswerOutcome {
  if (!correct) return 'failure';
  return timer && answeredAt - timer.startedAt >= timer.limitMs ? 'partial' : 'success';
}
