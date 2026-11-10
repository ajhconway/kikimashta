import { schedulerVersion } from '../src/core/scheduler';
import type { Exercise } from '../src/types';
import type { Page } from './fixtures';

/** Keep real content and storage while leaving only the desired lesson cards new. */
export async function leaveNewCards(page: Page, languageId: string, items: { id: string; audio: { src: string }[] }[], exercises: Exercise[], remaining: { itemId: string; exercise: Exercise }[]) {
  const cards = [...new Map(items.map(item => [item.id, item])).values()].flatMap(item => exercises.map(exercise => ({ item, exercise })));
  const known = cards.filter(card => !remaining.some(next => next.itemId === card.item.id && next.exercise === card.exercise));
  // Valid future-dated history is retained as known without creating due work or
  // a forecast in this week. This is the same real-storage clock-skew boundary
  // covered by App.clock.test.tsx, not a replacement scheduler or reduced chunk.
  const at = Date.UTC(2035, 0, 1);
  const attempts = known.map((card, index) => ({
    id: `known-${index}`, sessionId: 'lesson-fixture', itemId: card.item.id, language: languageId,
    choiceIds: [card.item.id], selectedId: card.item.id, correct: true,
    startedAt: at, answeredAt: at, responseMs: 0,
    context: { phase: 'lesson', exercise: card.exercise, recordingSrc: card.item.audio[0]!.src, replays: 0, schedulerVersion },
  }));
  await page.evaluate(async attempts => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kikimashta-v0', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('attempts', 'readwrite');
      for (const attempt of attempts) tx.objectStore('attempts').put(attempt);
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    } finally { db.close(); }
  }, attempts);
  return attempts.length;
}
