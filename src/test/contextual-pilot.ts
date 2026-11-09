import changes from '../../content/contextual/answer-amendments.json';
import { withAnswerAmendments, type ContextualAnswerAmendments } from '../content/contextual-answers';

/** Keep word/legacy-flow regressions independent of expanding content admission.
 * Current direct-entry content has separate App and real-browser journeys. */
export function withHistoricalJapanesePractice(actual: typeof import('../content/contextual-runtime')) {
  return { ...actual, contextualBanks: [
    ...withAnswerAmendments(actual.recordedContextualBanks, changes as ContextualAnswerAmendments),
    ...actual.contextualBanks.filter(bank => bank.language !== 'ja-JP'),
  ] };
}
