import runtime from '../../content/semantic-neighbors/ja-runtime.json';
import type { Exercise, PracticeCard, WordItem } from '../types';
import type { JapaneseNeighborTable, WordChoiceKind, WordChoicePolicySnapshot, WritingChoicePolicySnapshot } from './distractor-types';
import type { MasteryLevel } from './mastery';
import { japanesePronunciationKey } from './pronunciation';
import { shuffled } from './random';
import { writtenKanaEnding } from './written-plausibility';

type Kind = 'semantic' | 'pronunciation' | 'broad';
interface Candidate { item: WordItem; kind: Kind }
export class InsufficientChoicesError extends Error {
  constructor() { super('Enough distinct, unambiguous choices are required.'); this.name = 'InsufficientChoicesError'; }
}
export interface WordNeighborRelations {
  language: string;
  semanticIds(id: string): readonly string[] | undefined;
  pronunciationIds(id: string): readonly string[];
  pictureExcluded(a: string, b: string): boolean;
}

export function neighborRelations(table: JapaneseNeighborTable): WordNeighborRelations {
  const indices = new Map(table.ids.map((id, index) => [id, index]));
  const pairKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const exclusions = new Set(table.pictureExclusionPairs.map(([a, b]) => pairKey(a!, b!)));
  return {
    language: table.language,
    semanticIds: id => {
      const index = indices.get(id);
      return index === undefined ? undefined : table.semantic[index]!.map(value => table.ids[value]!);
    },
    pronunciationIds: id => {
      const index = indices.get(id);
      return index === undefined ? [] : table.pronunciation[index]!.map(value => table.ids[value]!);
    },
    pictureExcluded: (a, b) => {
      const first = indices.get(a), second = indices.get(b);
      return first !== undefined && second !== undefined && exclusions.has(pairKey(first, second));
    },
  };
}

export const japaneseWordNeighbors = neighborRelations(runtime);
const normalized = (value: string) => value.normalize('NFKC').trim();
const sound = (item: WordItem) => japanesePronunciationKey(item.reading ?? item.text) ?? normalized(item.reading ?? item.text);
const visible = (item: WordItem, exercise: Exercise) => exercise === 'audio-picture' ? item.image.src : normalized(item.text);

/** Reviewed picture collisions are symmetric, including between two alternatives. */
function compatible(a: WordItem, b: WordItem, exercise: Exercise, relations?: WordNeighborRelations): boolean {
  if (a.id === b.id || a.language !== b.language || visible(a, exercise) === visible(b, exercise)) return false;
  return exercise !== 'audio-picture' || !(a.pictureDistractorExclusions?.includes(b.id) ||
    b.pictureDistractorExclusions?.includes(a.id) || relations?.pictureExcluded(a.id, b.id));
}

/** Pure choice selection; session callers snapshot its result before presentation. */
export function selectWordChoices(
  { item: target, exercise }: PracticeCard, pool: readonly WordItem[], level: MasteryLevel,
  random: () => number, relations: WordNeighborRelations = japaneseWordNeighbors,
): { choices: WordItem[]; choiceKinds: Record<string, WordChoiceKind>; choicePolicy?: WordChoicePolicySnapshot; writingChoicePolicy?: WritingChoicePolicySnapshot } {
  const semanticIds = target.language === relations.language ? relations.semanticIds(target.id) : undefined;
  const active = semanticIds !== undefined && (exercise === 'audio-picture' || exercise === 'audio-text');
  const candidates = shuffled(pool, random).filter(item => compatible(target, item, exercise, active ? relations : undefined) &&
    sound(target) !== sound(item));
  const ending = target.language === 'ja-JP' && exercise === 'audio-text' && level.preferMatchingKana ? writtenKanaEnding(target.text) : undefined;
  const matchingIds = new Set(ending ? candidates.filter(item => writtenKanaEnding(item.text) === ending).map(item => item.id) : []);
  const preferMatches = (items: WordItem[]) => ending ? [...items.filter(item => matchingIds.has(item.id)), ...items.filter(item => !matchingIds.has(item.id))] : items;
  const writingPolicy = (items: WordItem[]): WritingChoicePolicySnapshot | undefined => {
    if (!ending) return undefined;
    const matching = items.filter(item => matchingIds.has(item.id)).length;
    return { version: 'trailing-kana-v1', ending, matching, fallback: items.length - matching };
  };
  if (!active) {
    // Preserve ordinary selection for languages/items without prepared neighbors.
    const seen = new Set([visible(target, exercise)]);
    const legacy = preferMatches(candidates).filter(item => {
      if (seen.has(visible(item, exercise))) return false;
      seen.add(visible(item, exercise)); return true;
    }).slice(0, 3);
    if (legacy.length < 3) throw new InsufficientChoicesError();
    return { choices: shuffled([target, ...legacy], random), writingChoicePolicy: writingPolicy(legacy),
      choiceKinds: Object.fromEntries([[target.id, 'correct'], ...legacy.map(item => [item.id, 'broad'])]) };
  }
  const byId = new Map(candidates.map(item => [item.id, item]));
  // Filter the selected scope first, then sample a small nearest-neighbor window.
  const nearest = (ids: readonly string[]) => preferMatches(shuffled(preferMatches(ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : [])).slice(0, 6), random));
  const semantic = nearest(semanticIds), pronunciation = nearest(relations.pronunciationIds(target.id));
  const closeIds = new Set([...semantic, ...pronunciation].map(item => item.id));
  const broad = preferMatches(candidates.filter(item => !closeIds.has(item.id)));
  const tagged = (items: readonly WordItem[], kind: Kind): Candidate[] => items.map(item => ({ item, kind }));
  const desired = level.distractors;
  const options: Record<Kind, Candidate[]> = {
    pronunciation: tagged(pronunciation, 'pronunciation'),
    semantic: tagged(semantic, 'semantic'), broad: tagged(broad, 'broad'),
  };
  function search(slots: Kind[], selected: Candidate[] = [], minimumMatches = 0): Candidate[] | undefined {
    const matched = minimumMatches ? selected.filter(candidate => matchingIds.has(candidate.item.id)).length : 0;
    if (selected.length === 3) return matched >= minimumMatches ? selected : undefined;
    if (minimumMatches && matched + slots.slice(selected.length).filter(kind => options[kind].some(candidate =>
      matchingIds.has(candidate.item.id) && selected.every(other => compatible(other.item, candidate.item, exercise, relations)))).length < minimumMatches) return undefined;
    const kind = slots[selected.length]!;
    const seen = new Set<string>();
    for (const candidate of options[kind]) {
      if (seen.has(candidate.item.id)) continue;
      seen.add(candidate.item.id);
      if (!selected.every(other => compatible(other.item, candidate.item, exercise, relations))) continue;
      const result = search(slots, [...selected, candidate], minimumMatches);
      if (result) return result;
    }
    return undefined;
  }
  const patterns: { semantic: number; pronunciation: number }[] = [];
  function pattern(semantic: number, pronunciation: number) {
    if (!patterns.some(value => value.semantic === semantic && value.pronunciation === pronunciation)) patterns.push({ semantic, pronunciation });
  }
  // Exhaust each mixture before substituting more broad options. Missing sound
  // neighbors first become semantic ones; broad choices are the next fallback.
  for (let pronunciation = desired.pronunciation; pronunciation >= 0; pronunciation--) {
    for (let semantic = Math.min(3 - pronunciation, desired.semantic + desired.pronunciation - pronunciation); semantic >= 0; semantic--) {
      pattern(semantic, pronunciation);
    }
  }
  // A tiny scope may contain only close choices. Preserve four valid answers
  // even when every easier mixture is impossible, and snapshot the actual mix.
  for (let pronunciation = 0; pronunciation <= 3; pronunciation++) {
    for (let semantic = 0; semantic <= 3 - pronunciation; semantic++) pattern(semantic, pronunciation);
  }
  let selected: Candidate[] | undefined;
  for (const mix of patterns) {
    const slots: Kind[] = [
      ...Array<Kind>(mix.pronunciation).fill('pronunciation'), ...Array<Kind>(mix.semantic).fill('semantic'),
      ...Array<Kind>(3 - mix.pronunciation - mix.semantic).fill('broad'),
    ];
    // Maximize ending agreement within a complete mastery mixture before relaxing it.
    for (let minimum = ending ? 3 : 0; minimum >= 0; minimum--) {
      selected = search(slots, [], minimum);
      if (selected) break;
    }
    if (selected) break;
  }
  if (!selected) throw new InsufficientChoicesError();
  const actual = { semantic: 0, pronunciation: 0, broad: 0 };
  for (const candidate of selected) actual[candidate.kind]++;
  return {
    choices: shuffled([target, ...selected.map(candidate => candidate.item)], random),
    writingChoicePolicy: writingPolicy(selected.map(candidate => candidate.item)),
    choiceKinds: Object.fromEntries([[target.id, 'correct'], ...selected.map(candidate => [candidate.item.id, candidate.kind])]),
    choicePolicy: { version: 'word-neighbors-v1', mastery: level.label, requested: { ...desired }, actual },
  };
}
