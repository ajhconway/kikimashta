import { expect, it } from 'vitest';
import type { WordItem } from '../types';
import { packBadges } from './pack-badges';
import type { CardPack } from './packs';
import { advanceSchedule, schedulerVersion } from './scheduler';

const items: WordItem[] = ['cat', 'dog'].map(id => ({ id, language: 'ja-JP', theme: 'test', label: id, text: id,
  image: { src: 'test.png', source: 'generated', alt: id }, audio: [] }));
const pack: CardPack = { id: 'pictures', title: 'Test pictures', language: 'ja-JP', exercise: 'audio-picture', itemIds: ['cat', 'dog', 'unapproved'] };
const hour = 3600000;
async function word(itemId: string, gap: number) {
  const schedule = await advanceSchedule(undefined, { id: itemId, sessionId: 'test', language: 'ja-JP', itemId,
    selectedId: itemId, choiceIds: [itemId], correct: true, startedAt: 0, answeredAt: 1000, responseMs: 1000,
    context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: 'test.mp3', replays: 0, schedulerVersion } });
  return { ...schedule, dueAt: 1000 + gap };
}
it('requires all approved cards, excludes empty packs, and removes or downgrades current badges', async () => {
  const cat = await word('cat', 30 * 24 * hour), dog = await word('dog', 365 * 24 * hour);
  expect(packBadges(items, [pack], [cat])).toEqual([]);
  expect(packBadges(items, [{ ...pack, itemIds: [] }], [cat, dog])).toEqual([]);
  expect(packBadges(items, [pack], [cat, dog])[0]?.level.label).toBe('Strong');
  const weak = await word('cat', 4 * hour);
  expect(packBadges(items, [pack], [weak, dog])[0]?.level.label).toBe('Improving');
  expect(packBadges(items, [pack], [{ ...weak, dueAt: weak.dueAt - 1 }, dog])).toEqual([]);
});
it('separates language and format, ignoring unrelated contextual schedules', async () => {
  const schedules = [await word('cat', 24 * hour), await word('dog', 24 * hour)];
  expect(packBadges([...items, ...items.map(item => ({ ...item, language: 'es-419' }))], [pack, { ...pack, id: 'writing', exercise: 'audio-text' }, { ...pack, id: 'es', language: 'es-419' }], schedules).map(badge => badge.pack.id)).toEqual(['pictures']);
  expect(packBadges(items, [pack], schedules.map(word => ({ ...word, exercise: 'context-simple-picture' })))).toEqual([]);
});

it('requires approved foundation cards in the pack even when its word cards have higher mastery', async () => {
  const foundation = { exercise: 'context-simple-picture' as const, item: { ...items[0]!, id: 'request' } };
  const basicPack = { ...pack, itemIds: ['cat', 'dog', 'request'] };
  const words = [await word('cat', 30 * 24 * hour), await word('dog', 30 * 24 * hour)];
  expect(packBadges(items, [basicPack], words, [foundation])).toEqual([]);
  const context = { ...await word('request', 24 * hour), exercise: foundation.exercise };
  expect(packBadges(items, [basicPack], [...words, context], [foundation])).toMatchObject([{ level: { label: 'Familiar' }, cardCount: 3 }]);
  expect(packBadges(items, [basicPack], words, [{ ...foundation, item: { ...foundation.item, language: 'es-419' } }])).toMatchObject([{ level: { label: 'Strong' }, cardCount: 2 }]);
  expect(packBadges(items, [basicPack], words, [{ ...foundation, exercise: 'context-simple-text' }])).toMatchObject([{ level: { label: 'Strong' }, cardCount: 2 }]);
});
