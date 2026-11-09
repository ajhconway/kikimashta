/** Word-choice policy snapshots are local question state; attempts already save exact choices. */
export interface DistractorCounts { semantic: number; pronunciation: number }
export type WordChoiceKind = 'correct' | 'semantic' | 'pronunciation' | 'broad';
export interface WritingChoicePolicySnapshot {
  version: 'trailing-kana-v1';
  ending: string;
  matching: number;
  fallback: number;
}
export interface WordChoicePolicySnapshot {
  version: 'word-neighbors-v1';
  mastery: string;
  requested: DistractorCounts;
  actual: DistractorCounts & { broad: number };
}

/** Compact indices refer to ids; semantic rows retain full rankings for pack filtering. */
export interface JapaneseNeighborTable {
  schemaVersion: number;
  language: string;
  ids: string[];
  semantic: number[][];
  pronunciation: number[][];
  pictureExclusionPairs: number[][];
}
